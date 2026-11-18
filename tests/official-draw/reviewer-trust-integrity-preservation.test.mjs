import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableReviewerTrustRegistry } from './durable-reviewer-trust-registry.mjs';

const ADMIN={actorSubject:'trust-admin-subject-001'};
const auth=async(context,action)=>context?.actorSubject===ADMIN.actorSubject&&['REGISTER_KEY','REVOKE_KEY','ISSUE_NONCE'].includes(action);
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mps-trust-integrity-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const registry=await DurableReviewerTrustRegistry.open(dir,{authorizeAdmin:auth,lockWaitMs:500,lockRetryMs:5});
 const pair=generateKeyPairSync('ed25519');
 await registry.registerKey({context:ADMIN,keyId:'integrity-key-001',issuer:'https://identity.synthetic.invalid',subject:'reviewer:synthetic-z',publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}),notBefore:'2026-01-01T00:00:00.000Z',notAfter:'2027-01-01T00:00:00.000Z'});
 await registry.issueNonce({context:ADMIN,ttlMs:60000,now:Date.now()});
 await registry.close();
 return {dir,file:path.join(dir,'reviewer-trust.jsonl')};
}
async function assertPreservedFailure(t,mutate){
 const f=await fixture(t),original=await fs.readFile(f.file),changed=mutate(Buffer.from(original));
 await fs.writeFile(f.file,changed);
 const evidence=await fs.readFile(f.file);
 await assert.rejects(DurableReviewerTrustRegistry.open(f.dir,{authorizeAdmin:auth}),e=>e.code==='REGISTRY_INTEGRITY_ERROR');
 assert.deepEqual(await fs.readFile(f.file),evidence,'failed open must preserve exact journal bytes');
 assert.equal(await fs.readdir(f.dir).then(xs=>xs.some(x=>x.startsWith('reviewer-trust.jsonl.quarantine'))),false,'no automatic quarantine or mutation');
}

test('preserves complete malformed JSON record and fails closed',async t=>{
 await assertPreservedFailure(t,b=>Buffer.concat([b,Buffer.from('{not-json}\n')]));
});
test('preserves hash-chain corruption and fails closed',async t=>{
 await assertPreservedFailure(t,b=>{
  const rows=b.toString('utf8').trimEnd().split('\n').map(JSON.parse);
  rows[1].prev_hash='f'.repeat(64);
  return Buffer.from(rows.map(JSON.stringify).join('\n')+'\n');
 });
});
test('preserves sequence-gap corruption and fails closed',async t=>{
 await assertPreservedFailure(t,b=>{
  const rows=b.toString('utf8').trimEnd().split('\n').map(JSON.parse);
  rows[1].seq=9;
  return Buffer.from(rows.map(JSON.stringify).join('\n')+'\n');
 });
});
test('preserves incomplete trailing bytes and fails closed without truncation',async t=>{
 await assertPreservedFailure(t,b=>Buffer.concat([b,Buffer.from('{"seq":3,"partial":')]));
});
test('preserves unknown-field tampering and fails closed',async t=>{
 await assertPreservedFailure(t,b=>{
  const rows=b.toString('utf8').trimEnd().split('\n').map(JSON.parse);
  rows[0].operatorCanary='do-not-delete';
  return Buffer.from(rows.map(JSON.stringify).join('\n')+'\n');
 });
});
