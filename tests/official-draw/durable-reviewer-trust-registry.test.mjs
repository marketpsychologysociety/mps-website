import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableReviewerTrustRegistry } from './durable-reviewer-trust-registry.mjs';
import { provenanceCanonicalJson, provenanceSha256 } from './gcs-evidence-provenance-verifier.mjs';

const NOW = Date.parse('2026-11-11T03:00:00.000Z');
const QUERY = 'a'.repeat(64);
const ADMIN = { actorSubject: 'trust-admin-subject-001' };
const ISSUER = 'https://identity.example.invalid/mps-reviewers';
const auth = async (context, action) => context?.actorSubject === ADMIN.actorSubject && ['REGISTER_KEY','REVOKE_KEY','ISSUE_NONCE'].includes(action);
function keypair() { const pair = generateKeyPairSync('ed25519'); return { ...pair, pem: pair.publicKey.export({ type:'spki', format:'pem' }) }; }
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-trust-registry-'));
  t.after(() => fs.rm(dir, { recursive:true, force:true }));
  let registry = await DurableReviewerTrustRegistry.open(dir, { authorizeAdmin: auth, lockWaitMs: 1000, lockRetryMs: 5 });
  t.after(() => registry.close().catch(() => {}));
  return { dir, registry, reopen: async () => { await registry.close(); registry = await DurableReviewerTrustRegistry.open(dir, { authorizeAdmin: auth, lockWaitMs: 1000, lockRetryMs: 5 }); return registry; } };
}
async function register(registry, pair, keyId='reviewer-key-001', notAfter='2026-11-11T03:00:00.000Z') {
  return registry.registerKey({ context:ADMIN, keyId, issuer:ISSUER, subject:'reviewer-subject-002', publicKeyPem:pair.pem, notBefore:'2026-01-01T00:00:00.000Z', notAfter });
}
function bundle() {
  return { schemaVersion:'mps-gcs-raw-audit/v1', source:{ projectId:'mps-synthetic-project', bucket:'mps-synthetic-evidence', windowStart:'2026-11-11T02:00:00.000Z', windowEnd:'2026-11-11T02:30:00.000Z', paginationComplete:true, finalNextPageToken:null }, expectedPrincipals:{ writer:'writer-subject-001', verifier:'reviewer-subject-002' }, expectedObjects:['mps/evidence/synthetic/one.json'], pages:[{pageIndex:0,entryCount:1}], rawEntries:[{pageIndex:0,rawJson:'{"synthetic":true}'}] };
}
function attestation(b, nonce, pair, options={}) {
  const payload = { schemaVersion:'mps-gcs-provenance-attestation/v1', keyId:options.keyId||'reviewer-key-001', issuer:ISSUER,
    reviewerSubject:'reviewer-subject-002', exporterSubject:'exporter-subject-001', retrievalPrincipal:'reviewer-subject-002',
    projectId:b.source.projectId, bucket:b.source.bucket, windowStart:b.source.windowStart, windowEnd:b.source.windowEnd,
    querySha256:QUERY, rawBundleSha256:provenanceSha256(provenanceCanonicalJson(b)), pageCount:b.pages.length, entryCount:b.rawEntries.length,
    paginationComplete:true, retrievalMethod:'google-cloud-logging-authenticated-api-v2', retrievedAt:'2026-11-11T02:45:00.000Z',
    reviewerAuthContext:'individually-authenticated-workforce-account-with-mfa', independentSourceAccessConfirmed:true,
    dataAccessCoverageConfirmed:true, nonce, issuedAt:options.issuedAt||'2026-11-11T02:50:00.000Z', expiresAt:options.expiresAt||'2026-11-11T03:10:00.000Z' };
  return { payload, signature:sign(null,Buffer.from(provenanceCanonicalJson(payload)),pair.privateKey).toString('base64') };
}
async function issued(registry, pair, opts={}) {
  await register(registry,pair,opts.keyId||'reviewer-key-001',opts.notAfter||'2026-11-11T03:00:00.000Z');
  const challenge=await registry.issueNonce({context:ADMIN,ttlMs:opts.ttlMs||60*60*1000,now:opts.nonceNow??NOW-5*60*1000});
  const b=bundle(), a=attestation(b,challenge.nonce,pair,{keyId:opts.keyId||'reviewer-key-001',issuedAt:opts.issuedAt||'2026-11-11T02:50:00.000Z',expiresAt:opts.expiresAt||'2026-11-11T03:10:00.000Z'});
  return {b,a,challenge};
}

test('registers immutable reviewer keys and persists trust state after restart', async t => {
  const {registry,reopen}=await setup(t), pair=keypair();
  const created=await register(registry,pair);
  assert.equal(created.status,'ACTIVE');
  assert.equal(registry.getKey('reviewer-key-001').fingerprint,created.fingerprint);
  assert.equal(registry.getKey('reviewer-key-001').publicKeyPem,undefined);
  await assert.rejects(register(registry,pair),e=>e.code==='KEY_ID_CONFLICT');
  const after=await reopen(); assert.equal(after.getKey('reviewer-key-001').status,'ACTIVE');
});

test('rejects unauthorized, self-administered and malformed key registration', async t => {
  const {registry}=await setup(t), pair=keypair();
  await assert.rejects(registry.registerKey({context:{actorSubject:'attacker-subject-999'},keyId:'reviewer-key-001',issuer:ISSUER,subject:'reviewer-subject-002',publicKeyPem:pair.pem,notBefore:'2026-01-01T00:00:00.000Z',notAfter:'2027-01-01T00:00:00.000Z'}),e=>e.code==='FORBIDDEN');
  await assert.rejects(registry.registerKey({context:ADMIN,keyId:'reviewer-key-002',issuer:ISSUER,subject:ADMIN.actorSubject,publicKeyPem:pair.pem,notBefore:'2026-01-01T00:00:00.000Z',notAfter:'2027-01-01T00:00:00.000Z'}),e=>e.code==='SEPARATION_OF_DUTIES');
  await assert.rejects(registry.registerKey({context:ADMIN,keyId:'reviewer-key-003',issuer:ISSUER,subject:'reviewer-subject-002',publicKeyPem:'bad',notBefore:'2026-01-01T00:00:00.000Z',notAfter:'2027-01-01T00:00:00.000Z'}),e=>e.code==='VALIDATION_ERROR');
});

test('rotation preserves old keys and verifies historical evidence after expiry', async t => {
  const {registry}=await setup(t), oldPair=keypair(), newPair=keypair();
  const old=await issued(registry,oldPair,{notAfter:'2026-11-11T03:00:00.000Z'});
  await register(registry,newPair,'reviewer-key-002','2027-12-31T00:00:00.000Z');
  const result=await registry.verifyAndConsume({bundle:old.b,attestation:old.a,expectedProjectId:old.b.source.projectId,expectedBucket:old.b.source.bucket,expectedQuerySha256:QUERY,now:NOW});
  assert.equal(result.ok,true,result.errors?.join(','));
  assert.equal(registry.getKey('reviewer-key-001').status,'ACTIVE');
  assert.equal(registry.getKey('reviewer-key-002').status,'ACTIVE');
});

test('revocation blocks signatures at or after effective time but preserves earlier evidence', async t => {
  const {registry}=await setup(t), pair=keypair();
  const prior=await issued(registry,pair);
  await registry.revokeKey({context:ADMIN,keyId:'reviewer-key-001',effectiveAt:'2026-11-11T02:55:00.000Z'});
  const priorResult=await registry.verifyAndConsume({bundle:prior.b,attestation:prior.a,expectedProjectId:prior.b.source.projectId,expectedBucket:prior.b.source.bucket,expectedQuerySha256:QUERY,now:NOW});
  assert.equal(priorResult.ok,true,priorResult.errors?.join(','));
  const nextChallenge=await registry.issueNonce({context:ADMIN,ttlMs:60*60*1000,now:NOW-5*60*1000});
  const later=attestation(bundle(),nextChallenge.nonce,pair,{issuedAt:'2026-11-11T02:56:00.000Z',expiresAt:'2026-11-11T03:10:00.000Z'});
  const laterResult=await registry.verifyAndConsume({bundle:bundle(),attestation:later,expectedProjectId:'mps-synthetic-project',expectedBucket:'mps-synthetic-evidence',expectedQuerySha256:QUERY,now:NOW});
  assert.equal(laterResult.ok,false); assert.ok(laterResult.errors.includes('TRUST_KEY_REVOKED'));
});

test('rejects duplicate revocation and unknown keys', async t => {
  const {registry}=await setup(t), pair=keypair(); await register(registry,pair);
  await assert.rejects(registry.revokeKey({context:ADMIN,keyId:'missing-key-001',effectiveAt:'2026-11-11T02:00:00.000Z'}),e=>e.code==='KEY_NOT_FOUND');
  await registry.revokeKey({context:ADMIN,keyId:'reviewer-key-001',effectiveAt:'2026-11-11T02:00:00.000Z'});
  await assert.rejects(registry.revokeKey({context:ADMIN,keyId:'reviewer-key-001',effectiveAt:'2026-11-11T02:01:00.000Z'}),e=>e.code==='KEY_ALREADY_REVOKED');
});

test('consumes a valid nonce once and preserves consumption after restart', async t => {
  const {registry,reopen}=await setup(t), pair=keypair(), f=await issued(registry,pair);
  const args={bundle:f.b,attestation:f.a,expectedProjectId:f.b.source.projectId,expectedBucket:f.b.source.bucket,expectedQuerySha256:QUERY,now:NOW};
  const first=await registry.verifyAndConsume(args); assert.equal(first.ok,true); assert.equal(first.nonceConsumed,true);
  const second=await registry.verifyAndConsume(args); assert.equal(second.ok,false); assert.ok(second.errors.includes('NONCE_ALREADY_CONSUMED'));
  const after=await reopen(); const third=await after.verifyAndConsume(args); assert.equal(third.ok,false); assert.ok(third.errors.includes('NONCE_ALREADY_CONSUMED'));
  assert.equal(after.getStats().consumedNonceCount,1);
});

test('independent registry instances serialize concurrent replay to one consumption', async t => {
  const {registry,dir}=await setup(t), pair=keypair(), f=await issued(registry,pair);
  const second=await DurableReviewerTrustRegistry.open(dir,{authorizeAdmin:auth,lockWaitMs:1000,lockRetryMs:5}); t.after(()=>second.close());
  const args={bundle:f.b,attestation:f.a,expectedProjectId:f.b.source.projectId,expectedBucket:f.b.source.bucket,expectedQuerySha256:QUERY,now:NOW};
  const results=await Promise.all([registry.verifyAndConsume(args),second.verifyAndConsume(args)]);
  assert.equal(results.filter(r=>r.ok).length,1); assert.equal(second.getStats().consumedNonceCount,1);
});

test('invalid signature does not burn nonce', async t => {
  const {registry}=await setup(t), pair=keypair(), f=await issued(registry,pair);
  const bad={payload:f.a.payload,signature:Buffer.alloc(64).toString('base64')};
  const args={bundle:f.b,attestation:bad,expectedProjectId:f.b.source.projectId,expectedBucket:f.b.source.bucket,expectedQuerySha256:QUERY,now:NOW};
  assert.equal((await registry.verifyAndConsume(args)).ok,false);
  const good=await registry.verifyAndConsume({...args,attestation:f.a}); assert.equal(good.ok,true,good.errors?.join(','));
});

test('nonce expires and plaintext nonce is not stored', async t => {
  const {registry,dir}=await setup(t), pair=keypair(), f=await issued(registry,pair,{ttlMs:60*1000});
  const args={bundle:f.b,attestation:f.a,expectedProjectId:f.b.source.projectId,expectedBucket:f.b.source.bucket,expectedQuerySha256:QUERY,now:NOW};
  const expired=await registry.verifyAndConsume({...args,now:NOW+60*60*1000});
  assert.ok(expired.errors.includes('NONCE_EXPIRED'));
  const raw=await fs.readFile(path.join(dir,'reviewer-trust.jsonl'),'utf8');
  assert.equal(raw.includes(f.challenge.nonce),false);
});

test('fails closed on complete-record tampering and unknown journal fields', async t => {
  const {registry,dir}=await setup(t), pair=keypair(); await register(registry,pair); await registry.close();
  const file=path.join(dir,'reviewer-trust.jsonl'), rows=(await fs.readFile(file,'utf8')).trimEnd().split('\n');
  const record=JSON.parse(rows[0]); record.unexpected='SYNTHETIC_PRIVATE_CANARY'; rows[0]=JSON.stringify(record); await fs.writeFile(file,rows.join('\n')+'\n');
  await assert.rejects(DurableReviewerTrustRegistry.open(dir,{authorizeAdmin:auth}),e=>e.code==='REGISTRY_INTEGRITY_ERROR');
});

test('recovers committed state after incomplete trailing record', async t => {
  const {registry,dir,reopen}=await setup(t), pair=keypair(); await register(registry,pair); await registry.close();
  await fs.appendFile(path.join(dir,'reviewer-trust.jsonl'),' {"partial":');
  const after=await reopen(); assert.equal(after.getKey('reviewer-key-001').status,'ACTIVE');
  const bytes=await fs.readFile(path.join(dir,'reviewer-trust.jsonl'),'utf8'); assert.equal(bytes.endsWith('\n'),true); assert.equal(bytes.includes('partial'),false);
});

test('reclaims a dead same-host lock after process crash', async t => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mps-trust-stale-lock-')); t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const lock=path.join(dir,'reviewer-trust.lock'); await fs.mkdir(lock,{mode:0o700});
  await fs.writeFile(path.join(lock,'owner.json'),JSON.stringify({pid:2147483647,hostname:os.hostname(),token:'synthetic-dead-token'}));
  const registry=await DurableReviewerTrustRegistry.open(dir,{authorizeAdmin:auth,lockWaitMs:500,lockRetryMs:5});
  assert.equal(registry.getStats().recordCount,0); await registry.close();
});
