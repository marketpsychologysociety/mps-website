import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyRecoveryCheckpointAttestation,recoveryCheckpointCanonicalJson,recoveryCheckpointSha256} from './recovery-checkpoint-attestation.mjs';
const checkpoint={formatVersion:1,schemaSha256:'1'.repeat(64),logicalSha256:'2'.repeat(64),tableCounts:{draw_records:1,idempotency_operations:2,notification_outbox:1,participants:25}};
const now=Date.parse('2026-11-11T05:00:00.000Z');
const options={expectedCheckpointId:'CP-SYN-2026-11-001',expectedSourceId:'DB-SYN-01',expectedNonce:'nonce-synthetic-one-time',now};
function fixture(changes={}){
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const trust={keyId:'reviewer-key-001',issuer:'https://identity.synthetic.invalid',subject:'reviewer:synthetic-b',publicKeyPem:publicKey.export({type:'spki',format:'pem'}),notBefore:'2026-01-01T00:00:00.000Z',notAfter:'2027-01-01T00:00:00.000Z',revoked:false};
 const payload={schemaVersion:'mps-recovery-checkpoint-attestation/v1',keyId:trust.keyId,issuer:trust.issuer,reviewerSubject:trust.subject,exporterSubject:'operator:synthetic-a',checkpointId:options.expectedCheckpointId,sourceId:options.expectedSourceId,checkpointSha256:recoveryCheckpointSha256(checkpoint),nonce:options.expectedNonce,issuedAt:'2026-11-11T04:59:00.000Z',expiresAt:'2026-11-11T05:09:00.000Z',reviewerAuthContext:'synthetic-mfa-step-up',...changes};
 const signature=sign(null,Buffer.from(recoveryCheckpointCanonicalJson(payload),'utf8'),privateKey).toString('base64');
 return {trust,attestation:{payload,signature}};
}
const verify=(f,cp=checkpoint,opts=options)=>verifyRecoveryCheckpointAttestation(cp,f.attestation,f.trust,opts);
test('accepts valid signed checkpoint bound to exact source and nonce',()=>{const f=fixture();const r=verify(f);assert.equal(r.ok,true);assert.equal(r.checkpoint.logicalSha256,checkpoint.logicalSha256);});
test('rejects checkpoint content tampering',()=>{const f=fixture();assert.ok(verify(f,{...checkpoint,logicalSha256:'f'.repeat(64)}).errors.includes('CHECKPOINT_DIGEST_MISMATCH'));});
test('rejects source/checkpoint scope substitution',()=>{const f=fixture();assert.ok(verify(f,checkpoint,{...options,expectedSourceId:'DB-SYN-02'}).errors.includes('CHECKPOINT_SCOPE_MISMATCH'));});
test('rejects nonce mismatch and replay context',()=>{const f=fixture();assert.ok(verify(f,checkpoint,{...options,expectedNonce:'other-nonce'}).errors.includes('NONCE_MISMATCH'));});
test('rejects reviewer/exporter identity collision',()=>{const f=fixture({exporterSubject:'reviewer:synthetic-b'});assert.ok(verify(f).errors.includes('REVIEWER_NOT_INDEPENDENT'));});
test('rejects revoked key',()=>{const f=fixture();f.trust.revoked=true;assert.ok(verify(f).errors.includes('TRUST_KEY_REVOKED'));});
test('rejects modified signature',()=>{const f=fixture();f.attestation.signature='A'.repeat(88);assert.ok(verify(f).errors.includes('ATTESTATION_SIGNATURE_INVALID')||verify(f).errors.includes('SIGNATURE_ENCODING_INVALID'));});
test('rejects expired, future and overlong attestation windows',()=>{for(const c of [{issuedAt:'2026-11-11T03:00:00.000Z',expiresAt:'2026-11-11T04:00:00.000Z'},{issuedAt:'2026-11-11T05:01:00.000Z',expiresAt:'2026-11-11T05:09:00.000Z'},{issuedAt:'2026-11-10T00:00:00.000Z',expiresAt:'2026-11-12T00:00:00.000Z'}]){const f=fixture(c);assert.ok(verify(f).errors.includes('ATTESTATION_TIME_INVALID'));}});
test('rejects malformed checkpoint and unknown checkpoint fields',()=>{const f=fixture();assert.ok(verify(f,{...checkpoint,unexpected:true}).errors.includes('CHECKPOINT_SCHEMA_INVALID'));});
test('rejects unknown payload fields even when signed',()=>{const f=fixture({unexpected:'not-allowed'});assert.ok(verify(f).errors.includes('ATTESTATION_SCHEMA_INVALID'));});
test('rejects trust identity mismatch',()=>{const f=fixture();f.trust.subject='reviewer:other';assert.ok(verify(f).errors.includes('REVIEWER_IDENTITY_MISMATCH'));});
test('rejects invalid verifier context',()=>{const f=fixture();assert.ok(verify(f,checkpoint,{...options,expectedNonce:''}).errors.includes('VERIFIER_CONTEXT_INVALID'));});
