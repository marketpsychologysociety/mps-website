import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableReviewerTrustRegistry } from './durable-reviewer-trust-registry.mjs';
import { recoveryCheckpointCanonicalJson, recoveryCheckpointSha256 } from './recovery-checkpoint-attestation.mjs';

const ADMIN={actorSubject:'trust-admin-subject-001'};
const ISSUER='https://identity.synthetic.invalid/mps-recovery-reviewers';
const checkpoint={formatVersion:1,schemaSha256:'1'.repeat(64),logicalSha256:'2'.repeat(64),tableCounts:{draw_records:1,idempotency_operations:2,notification_outbox:1,participants:25}};
const auth=async(context,action)=>context?.actorSubject===ADMIN.actorSubject&&['REGISTER_KEY','REVOKE_KEY','ISSUE_NONCE'].includes(action);
const pair=()=>{const p=generateKeyPairSync('ed25519');return {...p,pem:p.publicKey.export({type:'spki',format:'pem'})};};
async function setup(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mps-recovery-nonce-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 let registry=await DurableReviewerTrustRegistry.open(dir,{authorizeAdmin:auth,lockWaitMs:1500,lockRetryMs:5});
 t.after(()=>registry.close().catch(()=>{}));
 return {dir,get registry(){return registry;},reopen:async()=>{await registry.close();registry=await DurableReviewerTrustRegistry.open(dir,{authorizeAdmin:auth,lockWaitMs:1500,lockRetryMs:5});return registry;}};
}
async function issue(registry,key){
 const now=Date.now();
 await registry.registerKey({context:ADMIN,keyId:'recovery-reviewer-key-001',issuer:ISSUER,subject:'reviewer:synthetic-b',publicKeyPem:key.pem,notBefore:'2026-01-01T00:00:00.000Z',notAfter:'2027-01-01T00:00:00.000Z'});
 const challenge=await registry.issueNonce({context:ADMIN,ttlMs:60*60*1000,now:now-60*1000});
 const issuedAt=new Date(now+1000).toISOString();
 const payload={schemaVersion:'mps-recovery-checkpoint-attestation/v1',keyId:'recovery-reviewer-key-001',issuer:ISSUER,reviewerSubject:'reviewer:synthetic-b',exporterSubject:'operator:synthetic-a',checkpointId:'CP-SYN-2026-11-001',sourceId:'DB-SYN-01',checkpointSha256:recoveryCheckpointSha256(checkpoint),nonce:challenge.nonce,issuedAt,expiresAt:new Date(now+10*60*1000).toISOString(),reviewerAuthContext:'synthetic-mfa-step-up'};
 const attestation={payload,signature:sign(null,Buffer.from(recoveryCheckpointCanonicalJson(payload),'utf8'),key.privateKey).toString('base64')};
 return {challenge,attestation,now:now+60*1000,args:{checkpoint,attestation,expectedCheckpointId:'CP-SYN-2026-11-001',expectedSourceId:'DB-SYN-01',now:now+60*1000}};
}

test('verifies checkpoint attestation and atomically consumes nonce exactly once',async t=>{
 const s=await setup(t),key=pair(),f=await issue(s.registry,key);
 const result=await s.registry.verifyAndConsumeRecoveryCheckpoint(f.args);
 assert.equal(result.ok,true,result.errors?.join(','));
 assert.equal(result.nonceConsumed,true);
 assert.equal(s.registry.getStats().consumedNonceCount,1);
 const journal=await fs.readFile(path.join(s.dir,'reviewer-trust.jsonl'),'utf8');
 assert.equal(journal.includes(f.challenge.nonce),false);
 const consumed=journal.trim().split('\n').map(JSON.parse).find(x=>x.event==='NONCE_CONSUMED');
 assert.equal(consumed.bundle_digest,recoveryCheckpointSha256(checkpoint));
 assert.match(consumed.attestation_digest,/^[a-f0-9]{64}$/);
});

test('invalid signature does not consume nonce and valid retry succeeds',async t=>{
 const s=await setup(t),key=pair(),f=await issue(s.registry,key);
 const bad={...f.args,attestation:{payload:f.attestation.payload,signature:Buffer.alloc(64).toString('base64')}};
 const rejected=await s.registry.verifyAndConsumeRecoveryCheckpoint(bad);
 assert.equal(rejected.ok,false);
 assert.equal(s.registry.getStats().consumedNonceCount,0);
 const accepted=await s.registry.verifyAndConsumeRecoveryCheckpoint(f.args);
 assert.equal(accepted.ok,true,accepted.errors?.join(','));
 assert.equal(s.registry.getStats().consumedNonceCount,1);
});

test('nonce consumption remains enforced after registry restart',async t=>{
 const s=await setup(t),key=pair(),f=await issue(s.registry,key);
 const first=await s.registry.verifyAndConsumeRecoveryCheckpoint(f.args);
 assert.equal(first.ok,true,first.errors?.join(','));
 const reopened=await s.reopen();
 const replay=await reopened.verifyAndConsumeRecoveryCheckpoint(f.args);
 assert.equal(replay.ok,false);
 assert.ok(replay.errors.includes('NONCE_ALREADY_CONSUMED'));
 assert.equal(reopened.getStats().consumedNonceCount,1);
});

test('independent registry instances serialize concurrent replay to one durable consumption',async t=>{
 const s=await setup(t),key=pair(),f=await issue(s.registry,key);
 const second=await DurableReviewerTrustRegistry.open(s.dir,{authorizeAdmin:auth,lockWaitMs:1500,lockRetryMs:5});
 t.after(()=>second.close());
 const results=await Promise.all([s.registry.verifyAndConsumeRecoveryCheckpoint(f.args),second.verifyAndConsumeRecoveryCheckpoint(f.args)]);
 assert.equal(results.filter(x=>x.ok).length,1);
 assert.equal(results.filter(x=>x.errors?.includes('NONCE_ALREADY_CONSUMED')).length,1);
 assert.equal(second.getStats().consumedNonceCount,1);
});

test('preserves historical attestation before effective revocation and rejects later signature',async t=>{
 const s=await setup(t),key=pair(),f=await issue(s.registry,key);
 const revokedAt=new Date(Date.parse(f.attestation.payload.issuedAt)+5000).toISOString();
 await s.registry.revokeKey({context:ADMIN,keyId:'recovery-reviewer-key-001',effectiveAt:revokedAt});
 const historical=await s.registry.verifyAndConsumeRecoveryCheckpoint(f.args);
 assert.equal(historical.ok,true,historical.errors?.join(','));
 const challenge=await s.registry.issueNonce({context:ADMIN,ttlMs:60*60*1000,now:Date.now()});
 const issuedAt=new Date(Date.parse(revokedAt)+1000).toISOString();
 const payload={...f.attestation.payload,nonce:challenge.nonce,issuedAt,expiresAt:new Date(Date.parse(issuedAt)+5*60*1000).toISOString()};
 const later={...f.args,attestation:{payload,signature:sign(null,Buffer.from(recoveryCheckpointCanonicalJson(payload),'utf8'),key.privateKey).toString('base64')},now:Date.parse(issuedAt)+1000};
 const rejected=await s.registry.verifyAndConsumeRecoveryCheckpoint(later);
 assert.equal(rejected.ok,false);
 assert.ok(rejected.errors.includes('TRUST_KEY_REVOKED'));
});

test('expired nonce is rejected without consuming or disclosing its plaintext in journal',async t=>{
 const s=await setup(t),key=pair(),f=await issue(s.registry,key);
 const expired=await s.registry.verifyAndConsumeRecoveryCheckpoint({...f.args,now:Date.parse(f.challenge.expiresAt)+1});
 assert.equal(expired.ok,false);
 assert.ok(expired.errors.includes('NONCE_EXPIRED'));
 assert.equal(s.registry.getStats().consumedNonceCount,0);
 const journal=await fs.readFile(path.join(s.dir,'reviewer-trust.jsonl'),'utf8');
 assert.equal(journal.includes(f.challenge.nonce),false);
});
