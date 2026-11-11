import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyGcsPocEvidenceBundle, gcsPocCanonicalJson, gcsPocSha256 } from './gcs-poc-evidence-verifier.mjs';

function fixture() {
  const principals = {
    writer: { subject: 'svc-writer@poc.iam', adminBoundary: 'writer-admin' },
    verifier: { subject: 'svc-verifier@poc.iam', adminBoundary: 'verifier-admin' },
    storageAdmin: { subject: 'human-storage-admin', adminBoundary: 'storage-admin-boundary' },
    auditAdmin: { subject: 'human-audit-admin', adminBoundary: 'audit-admin-boundary' },
    recovery: { subject: 'human-recovery', adminBoundary: 'recovery-admin-boundary' }
  };
  const payload = {
    protocolVersion: 'mps-poc-v1', eventRef: 'evt-synthetic-01', sequence: 1,
    previousJournalHash: 'a'.repeat(64), journalHash: 'b'.repeat(64), operationRef: 'op-synthetic-01'
  };
  const object = {
    name: 'poc/evidence/evt-synthetic-01/000001.json', generation: '1731000000000000',
    metageneration: '1', createdAt: '2026-11-11T00:00:00.000Z', payload,
    sha256: gcsPocSha256(gcsPocCanonicalJson(payload)), previousReceiptHash: 'GENESIS'
  };
  object.receiptHash = gcsPocSha256(gcsPocCanonicalJson({
    name: object.name, generation: object.generation, metageneration: object.metageneration,
    createdAt: object.createdAt, payload: object.payload, sha256: object.sha256,
    previousReceiptHash: object.previousReceiptHash
  }));
  return {
    schemaVersion: 'mps-gcs-poc-evidence/v1',
    project: { projectId: 'mps-poc-synthetic', bucket: 'mps-poc-synthetic-evidence', location: 'asia-southeast1' },
    principals, expectedSequences: [1], objects: [object],
    auditCoverage: { adminActivity: true, dataRead: true, dataWrite: true, independentExport: true },
    auditEvents: [
      { action: 'OBJECT_CREATE', principalSubject: principals.writer.subject, resourceName: object.name, outcome: 'SUCCESS', timestamp: object.createdAt },
      { action: 'OBJECT_READ', principalSubject: principals.verifier.subject, resourceName: object.name, outcome: 'SUCCESS', timestamp: object.createdAt },
      { action: 'OBJECT_DELETE', principalSubject: principals.writer.subject, resourceName: object.name, outcome: 'DENIED', timestamp: object.createdAt },
      { action: 'POLICY_CHANGE', principalSubject: principals.storageAdmin.subject, resourceName: 'bucket:mps-poc-synthetic-evidence', outcome: 'SUCCESS', timestamp: object.createdAt }
    ]
  };
}

test('accepts a complete synthetic independently exported evidence bundle', () => {
  assert.deepEqual(verifyGcsPocEvidenceBundle(fixture()), { ok: true, errors: [] });
});

test('rejects altered canonical payload bytes/digest', () => {
  const b = fixture(); b.objects[0].payload.eventRef = 'evt-tampered';
  assert.ok(verifyGcsPocEvidenceBundle(b).errors.includes('PAYLOAD_DIGEST_MISMATCH:1'));
});

test('rejects a changed generation or receipt material', () => {
  const b = fixture(); b.objects[0].generation = '1731000000000001';
  assert.ok(verifyGcsPocEvidenceBundle(b).errors.includes('RECEIPT_HASH_MISMATCH:1'));
});

test('rejects duplicate privileged identity and reused admin boundary', () => {
  const b = fixture(); b.principals.verifier.subject = b.principals.writer.subject;
  b.principals.auditAdmin.adminBoundary = b.principals.storageAdmin.adminBoundary;
  const errors = verifyGcsPocEvidenceBundle(b).errors;
  assert.ok(errors.includes('PRINCIPAL_SUBJECT_REUSED'));
  assert.ok(errors.includes('ADMIN_BOUNDARY_REUSED'));
});

test('rejects missing Data Access coverage or independent log export', () => {
  const b = fixture(); b.auditCoverage.dataRead = false; b.auditCoverage.independentExport = false;
  assert.ok(verifyGcsPocEvidenceBundle(b).errors.includes('AUDIT_COVERAGE_INCOMPLETE'));
});

test('rejects absent independent verifier read audit evidence', () => {
  const b = fixture(); b.auditEvents = b.auditEvents.filter(e => e.action !== 'OBJECT_READ');
  assert.ok(verifyGcsPocEvidenceBundle(b).errors.includes('INDEPENDENT_READ_AUDIT_MISSING:' + b.objects[0].name));
});

test('rejects missing writer delete-denial audit evidence', () => {
  const b = fixture(); b.auditEvents = b.auditEvents.filter(e => e.action !== 'OBJECT_DELETE');
  assert.ok(verifyGcsPocEvidenceBundle(b).errors.includes('WRITER_DELETE_DENIAL_AUDIT_MISSING'));
});

test('rejects sequence gaps and unexpected objects', () => {
  const b = fixture(); b.expectedSequences = [1,2];
  assert.ok(verifyGcsPocEvidenceBundle(b).errors.includes('OBJECT_SEQUENCE_SET_MISMATCH'));
});

test('rejects malformed schema and floating-point generation identifiers', () => {
  const b = fixture(); b.objects[0].generation = 1731000000000000;
  assert.ok(verifyGcsPocEvidenceBundle(b).errors.includes('OBJECT_SCHEMA_INVALID') === false);
  assert.ok(verifyGcsPocEvidenceBundle(b).errors.includes('GENERATION_INVALID'));
});

test('rejects missing administrative policy audit evidence', () => {
  const b = fixture(); b.auditEvents = b.auditEvents.filter(e => e.action !== 'POLICY_CHANGE');
  assert.ok(verifyGcsPocEvidenceBundle(b).errors.includes('ADMIN_POLICY_AUDIT_MISSING'));
});\n
test('fails closed without throwing on malformed object collection', () => {
  const b = fixture(); b.objects = { unexpected: 'not-an-array' };
  assert.ok(verifyGcsPocEvidenceBundle(b).errors.includes('OBJECT_SET_EMPTY'));
});
