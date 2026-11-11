import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  verifyGcsEvidenceProvenance, provenanceCanonicalJson, provenanceSha256
} from './gcs-evidence-provenance-verifier.mjs';

const NOW = Date.parse('2026-11-11T03:00:00.000Z');
const QUERY = 'a'.repeat(64);
const NONCE = 'challenge-9d4a8f2c6b1e7a3d5f0c8b2a';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const trustBase = {
  keyId: 'reviewer-key-2026-01',
  issuer: 'https://identity.example.invalid/mps-reviewers',
  subject: 'reviewer-subject-002',
  publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
  notBefore: '2026-01-01T00:00:00.000Z',
  notAfter: '2027-01-01T00:00:00.000Z',
  revoked: false
};

function fixture() {
  const bundle = {
    schemaVersion: 'mps-gcs-raw-audit/v1',
    source: {
      projectId: 'mps-synthetic-project', bucket: 'mps-synthetic-evidence',
      windowStart: '2026-11-11T02:00:00.000Z', windowEnd: '2026-11-11T02:30:00.000Z',
      expectedLogNames: ['projects/mps-synthetic-project/logs/cloudaudit.googleapis.com%2Fdata_access'],
      paginationComplete: true, finalNextPageToken: null, independentExportRef: 'fixture-raw-export'
    },
    expectedPrincipals: { writer: 'writer@example.invalid', verifier: 'verifier@example.invalid', storageAdmin: 'admin@example.invalid' },
    expectedObjects: ['mps/evidence/synthetic/one.json'],
    pages: [{ pageIndex: 0, requestTokenHash: null, responseTokenHash: null, entryCount: 1, responseSha256: 'b'.repeat(64) }],
    rawEntries: [{ pageIndex: 0, rawJson: '{"synthetic":true}', rawSha256: 'c'.repeat(64) }]
  };
  const payload = {
    schemaVersion: 'mps-gcs-provenance-attestation/v1',
    keyId: trustBase.keyId,
    issuer: trustBase.issuer,
    reviewerSubject: trustBase.subject,
    exporterSubject: 'exporter-subject-001',
    retrievalPrincipal: trustBase.subject,
    projectId: bundle.source.projectId,
    bucket: bundle.source.bucket,
    windowStart: bundle.source.windowStart,
    windowEnd: bundle.source.windowEnd,
    querySha256: QUERY,
    rawBundleSha256: provenanceSha256(provenanceCanonicalJson(bundle)),
    pageCount: bundle.pages.length,
    entryCount: bundle.rawEntries.length,
    paginationComplete: true,
    retrievalMethod: 'google-cloud-logging-authenticated-api-v2',
    retrievedAt: '2026-11-11T02:45:00.000Z',
    reviewerAuthContext: 'individually-authenticated-workforce-account-with-mfa',
    independentSourceAccessConfirmed: true,
    dataAccessCoverageConfirmed: true,
    nonce: NONCE,
    issuedAt: '2026-11-11T02:50:00.000Z',
    expiresAt: '2026-11-11T03:10:00.000Z'
  };
  const signature = sign(null, Buffer.from(provenanceCanonicalJson(payload)), privateKey).toString('base64');
  return {
    bundle, payload, attestation: { payload, signature }, trust: { ...trustBase },
    options: { expectedNonce: NONCE, expectedProjectId: bundle.source.projectId,
      expectedBucket: bundle.source.bucket, expectedQuerySha256: QUERY, now: NOW }
  };
}

test('accepts a valid Ed25519 reviewer attestation bound to the exact bundle', () => {
  const f = fixture();
  const result = verifyGcsEvidenceProvenance(f.bundle, f.attestation, f.trust, f.options);
  assert.equal(result.ok, true, result.errors.join(','));
  assert.equal(result.provenanceVerified, true);
  assert.equal(result.googleSourceCryptographicallyAuthenticated, false);
  assert.equal(result.evidence.entryCount, 1);
});

test('rejects a changed raw evidence bundle', () => {
  const f = fixture();
  f.bundle.rawEntries[0].rawJson = '{"synthetic":false}';
  const r = verifyGcsEvidenceProvenance(f.bundle, f.attestation, f.trust, f.options);
  assert.ok(r.errors.includes('RAW_BUNDLE_DIGEST_MISMATCH'));
});

test('rejects a signature modified after signing', () => {
  const f = fixture();
  f.attestation.signature = Buffer.from(f.attestation.signature, 'base64').map((v,i)=>i===0?v^1:v).toString('base64');
  assert.ok(verifyGcsEvidenceProvenance(f.bundle, f.attestation, f.trust, f.options).errors.includes('ATTESTATION_SIGNATURE_INVALID'));
});

test('rejects an untrusted or substituted reviewer identity', () => {
  const f = fixture();
  f.payload.reviewerSubject = 'attacker-subject';
  f.attestation = { payload: f.payload, signature: sign(null, Buffer.from(provenanceCanonicalJson(f.payload)), privateKey).toString('base64') };
  assert.ok(verifyGcsEvidenceProvenance(f.bundle, f.attestation, f.trust, f.options).errors.includes('REVIEWER_IDENTITY_MISMATCH'));
});

test('rejects a revoked trust key', () => {
  const f = fixture(); f.trust.revoked = true;
  assert.ok(verifyGcsEvidenceProvenance(f.bundle, f.attestation, f.trust, f.options).errors.includes('TRUST_KEY_REVOKED'));
});

test('rejects an expired, future-issued, or overlong attestation', () => {
  const f = fixture();
  f.payload.expiresAt = '2026-11-11T02:49:00.000Z';
  f.attestation = { payload: f.payload, signature: sign(null, Buffer.from(provenanceCanonicalJson(f.payload)), privateKey).toString('base64') };
  assert.ok(verifyGcsEvidenceProvenance(f.bundle, f.attestation, f.trust, f.options).errors.includes('ATTESTATION_TIME_INVALID'));
});

test('rejects nonce replay or wrong challenge', () => {
  const f = fixture(); f.options.expectedNonce = 'different-one-time-challenge';
  assert.ok(verifyGcsEvidenceProvenance(f.bundle, f.attestation, f.trust, f.options).errors.includes('NONCE_MISMATCH'));
});

test('rejects incomplete pagination claims', () => {
  const f = fixture(); f.bundle.source.paginationComplete = false;
  assert.ok(verifyGcsEvidenceProvenance(f.bundle, f.attestation, f.trust, f.options).errors.includes('PAGINATION_NOT_COMPLETE'));
});

test('rejects project, bucket, query, and time-window substitution', () => {
  const f = fixture();
  f.options.expectedProjectId = 'different-project';
  const r = verifyGcsEvidenceProvenance(f.bundle, f.attestation, f.trust, f.options);
  assert.ok(r.errors.includes('SOURCE_SCOPE_MISMATCH'));
  const g = fixture(); g.options.expectedQuerySha256 = 'd'.repeat(64);
  assert.ok(verifyGcsEvidenceProvenance(g.bundle, g.attestation, g.trust, g.options).errors.includes('QUERY_DIGEST_MISMATCH'));
});

test('rejects reviewer/exporter identity reuse', () => {
  const f = fixture(); f.payload.exporterSubject = f.payload.reviewerSubject;
  f.attestation = { payload: f.payload, signature: sign(null, Buffer.from(provenanceCanonicalJson(f.payload)), privateKey).toString('base64') };
  assert.ok(verifyGcsEvidenceProvenance(f.bundle, f.attestation, f.trust, f.options).errors.includes('REVIEWER_NOT_INDEPENDENT'));
});

test('rejects missing independent source access or Data Access coverage assertion', () => {
  const f = fixture(); f.payload.dataAccessCoverageConfirmed = false;
  f.attestation = { payload: f.payload, signature: sign(null, Buffer.from(provenanceCanonicalJson(f.payload)), privateKey).toString('base64') };
  assert.ok(verifyGcsEvidenceProvenance(f.bundle, f.attestation, f.trust, f.options).errors.includes('INDEPENDENT_RETRIEVAL_CLAIMS_INVALID'));
});

test('rejects a trust key outside its validity window and invalid algorithm', () => {
  const f = fixture(); f.trust.notAfter = '2026-11-10T00:00:00.000Z';
  assert.ok(verifyGcsEvidenceProvenance(f.bundle, f.attestation, f.trust, f.options).errors.includes('TRUST_KEY_OUTSIDE_VALIDITY'));
  const g = fixture(); g.trust.publicKeyPem = 'not-a-key';
  assert.ok(verifyGcsEvidenceProvenance(g.bundle, g.attestation, g.trust, g.options).errors.includes('TRUST_PUBLIC_KEY_INVALID'));
});

test('fails closed on malformed schemas and missing verifier context', () => {
  const f = fixture(); f.attestation.untrusted = true;
  assert.ok(verifyGcsEvidenceProvenance(f.bundle, f.attestation, f.trust, f.options).errors.includes('ATTESTATION_SCHEMA_INVALID'));
  const g = fixture();
  assert.ok(verifyGcsEvidenceProvenance(g.bundle, g.attestation, g.trust, {}).errors.includes('VERIFIER_CONTEXT_INVALID'));
});


test('rejects a key identifier that does not match the pinned trust record', () => {
  const f = fixture();
  f.payload.keyId = 'untrusted-key-version';
  f.attestation = { payload: f.payload, signature: sign(null, Buffer.from(provenanceCanonicalJson(f.payload)), privateKey).toString('base64') };
  assert.ok(verifyGcsEvidenceProvenance(f.bundle, f.attestation, f.trust, f.options).errors.includes('TRUST_KEY_ID_MISMATCH'));
});
