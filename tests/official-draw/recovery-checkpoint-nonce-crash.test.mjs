import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DurableReviewerTrustRegistry } from './durable-reviewer-trust-registry.mjs';
import { recoveryCheckpointCanonicalJson, recoveryCheckpointSha256 } from './recovery-checkpoint-attestation.mjs';

const ADMIN={actorSubject:'trust-admin-subject-001'};
const ISSUER='https://identity.synthetic.invalid/mps-recovery-reviewers';
const checkpoint={formatVersion:1,schemaSha256:'1'.repeat(64),logicalSha256:'2'.repeat(64),tableCounts:{draw_records:1,idempotency_operations:2,notification_outbox:1,participants:25}};
const auth=async(context,action)=>context?.actorSubject===ADMIN.actorSubject&&['REGISTER_KEY','REVOKE_KEY','ISSUE_NONCE'].includes(action);
const keypair=()=>{const p=generateKeyPairSync('ed25519');return {...p,pem:p.publicKey.export({type:'spki',format:'pem'})};};
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mps-recovery-nonce-crash-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const registry=await DurableReviewerTrustRegistry.open(dir,{authorizeAdmin:auth,lockWaitMs:1500,lockRetryMs:5});
 const key=keypair(),now=Date.now();
 await registry.registerKey({context:ADMIN,keyId:'recovery-crash-key-001',issuer:ISSUER,subject:'reviewer:synthetic-c',publicKeyPem:key.pem,notBefore:'2026-01-01T00:00:00.000Z',notAfter:'2027-01-01T00:00:00.000Z'});
 const challenge=await registry.issueNonce({context:ADMIN,ttlMs:60*60*1000,now:now-60*1000});
 const issuedAt=new Date(now+1000).toISOString();
 const payload={schemaVersion:'mps-recovery-checkpoint-attestation/v1',keyId:'recovery-crash-key-001',issuer:ISSUER,reviewerSubject:'reviewer:synthetic-c',exporterSubject:'operator:synthetic-c',checkpointId:'CP-SYN-CRASH-001',sourceId:'DB-SYN-CRASH-01',checkpointSha256:recoveryCheckpointSha256(checkpoint),nonce:challenge.nonce,issuedAt,expiresAt:new Date(now+10*60*1000).toISOString(),reviewerAuthContext:'synthetic-mfa-step-up'};
 const attestation={payload,signature:sign(null,Buffer.from(recoveryCheckpointCanonicalJson(payload),'utf8'),key.privateKey).toString('base64')};
 const args={operation:'recovery-checkpoint',checkpoint,attestation,expectedCheckpointId:'CP-SYN-CRASH-001',expectedSourceId:'DB-SYN-CRASH-01',now:now+60*1000};
 await registry.close();
 return {dir,challenge,args};
}
async function crashChild(directory,stage,args){
 const worker=fileURLToPath(new URL('./reviewer-trust-crash-worker.mjs',import.meta.url));
 const encoded=Buffer.from(JSON.stringify(args)).toString('base64url');
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[worker,directory,stage,encoded],{stdio:['ignore','ignore','pipe']});
  let stderr='';child.stderr.setEncoding('utf8');child.stderr.on('data',c=>stderr+=c);
  child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal,stderr}));
 });
}
async function reopen(dir){return DurableReviewerTrustRegistry.open(dir,{authorizeAdmin:auth,lockWaitMs:1500,lockRetryMs:5});}

test('crash after nonce-consumption bytes but before fsync reconciles to exactly one eventual consumption',async t=>{
 const f=await fixture(t),child=await crashChild(f.dir,'AFTER_WRITE_BEFORE_SYNC',f.args);
 assert.equal(child.code,73,child.stderr);
 const registry=await reopen(f.dir);t.after(()=>registry.close());
 const consumed=registry.getStats().consumedNonceCount;
 assert.ok(consumed===0||consumed===1,'unexpected consumed count '+consumed);
 if(consumed===0){
  const retry=await registry.verifyAndConsumeRecoveryCheckpoint(f.args);
  assert.equal(retry.ok,true,retry.errors?.join(','));
 }else{
  const replay=await registry.verifyAndConsumeRecoveryCheckpoint(f.args);
  assert.equal(replay.ok,false);assert.ok(replay.errors.includes('NONCE_ALREADY_CONSUMED'));
 }
 assert.equal(registry.getStats().consumedNonceCount,1);
});

test('crash after nonce-consumption fsync but before acknowledgement preserves exactly-once result',async t=>{
 const f=await fixture(t),child=await crashChild(f.dir,'AFTER_SYNC_BEFORE_ACK',f.args);
 assert.equal(child.code,73,child.stderr);
 const registry=await reopen(f.dir);t.after(()=>registry.close());
 assert.equal(registry.getStats().consumedNonceCount,1);
 const replay=await registry.verifyAndConsumeRecoveryCheckpoint(f.args);
 assert.equal(replay.ok,false);assert.ok(replay.errors.includes('NONCE_ALREADY_CONSUMED'));
 assert.equal(registry.getStats().consumedNonceCount,1);
});
