import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGcsRawAuditEvidence, gcsRawAuditSha256, gcsRawAuditCanonicalJson
} from './gcs-raw-audit-normalizer.mjs';

function fixture() {
  const projectId = 'mps-synthetic-project';
  const bucket = 'mps-synthetic-evidence';
  const principals = {
    writer: 'writer@mps-synthetic-project.iam.gserviceaccount.com',
    verifier: 'verifier@mps-synthetic-project.iam.gserviceaccount.com',
    storageAdmin: 'storage-admin@example.invalid'
  };
  const log = (action, principal, resourceName, statusCode = 0) => ({
    logName: 'projects/' + projectId + '/logs/cloudaudit.googleapis.com%2F' +
      (action === 'POLICY_CHANGE' ? 'activity' : action === 'OBJECT_DELETE' ? 'policy' : 'data_access'),
    resource: { type: 'gcs_bucket', labels: { project_id: projectId, bucket_name: bucket } },
    timestamp: '2026-11-11T01:00:00.000Z',
    receiveTimestamp: '2026-11-11T01:00:01.000Z',
    insertId: 'insert-' + action + '-' + principal,
    protoPayload: {
      '@type': 'type.googleapis.com/google.cloud.audit.AuditLog',
      serviceName: 'storage.googleapis.com',
      methodName: action === 'OBJECT_CREATE' ? 'storage.objects.create' :
        action === 'OBJECT_READ' ? 'storage.objects.get' :
        action === 'OBJECT_DELETE' ? 'storage.objects.delete' : 'storage.buckets.setIamPolicy',
      resourceName,
      authenticationInfo: { principalEmail: principal },
      authorizationInfo: statusCode === 7 ? [{ permission: 'storage.objects.delete', granted: false }] : [],
      status: { code: statusCode }
    }
  });
  const objectName = 'mps/evidence/evt-synthetic/000001.json';
  const objectResource = 'projects/_/buckets/' + bucket + '/objects/' + objectName;
  const records = [
    log('OBJECT_CREATE', principals.writer, objectResource),
    log('OBJECT_READ', principals.verifier, objectResource),
    log('OBJECT_DELETE', principals.writer, objectResource, 7),
    log('POLICY_CHANGE', principals.storageAdmin, 'projects/_/buckets/' + bucket)
  ];
  const rawEntries = records.map(record => {
    const rawJson = JSON.stringify(record);
    return { pageIndex: 0, rawJson, rawSha256: gcsRawAuditSha256(rawJson) };
  });
  const hashes = rawEntries.map(x => x.rawSha256);
  return {
    schemaVersion: 'mps-gcs-raw-audit/v1',
    source: {
      projectId, bucket, windowStart: '2026-11-11T00:59:00.000Z',
      windowEnd: '2026-11-11T01:01:00.000Z',
      expectedLogNames: [
        'projects/' + projectId + '/logs/cloudaudit.googleapis.com%2Fdata_access',
        'projects/' + projectId + '/logs/cloudaudit.googleapis.com%2Factivity',
        'projects/' + projectId + '/logs/cloudaudit.googleapis.com%2Fpolicy'
      ],
      paginationComplete: true, finalNextPageToken: null,
      independentExportRef: 'synthetic-export-001'
    },
    expectedPrincipals: principals,
    expectedObjects: [objectName],
    pages: [{
      pageIndex: 0, requestTokenHash: null, responseTokenHash: null,
      entryCount: hashes.length, responseSha256: gcsRawAuditSha256(gcsRawAuditCanonicalJson(hashes))
    }],
    rawEntries
  };
}

test('normalizes a complete synthetic raw audit bundle without claiming source authentication', () => {
  const result = normalizeGcsRawAuditEvidence(fixture());
  assert.equal(result.ok, true, result.errors.join(','));
  assert.equal(result.normalizedEvents.length, 4);
  assert.equal(result.sourceAuthenticated, false);
  assert.equal(result.assurance, 'STRUCTURAL_ONLY_SOURCE_AUTHENTICITY_NOT_VERIFIED');
  assert.match(result.warning, /do not authenticate Google Cloud/);
});

test('rejects raw JSON byte tampering even when parsed fields look valid', () => {
  const b = fixture();
  b.rawEntries[0].rawJson = b.rawEntries[0].rawJson.replace('mps-synthetic-project', 'other-project');
  assert.ok(normalizeGcsRawAuditEvidence(b).errors.includes('RAW_ENTRY_DIGEST_MISMATCH:0'));
});

test('rejects project or bucket resource substitution', () => {
  const b = fixture();
  const entry = JSON.parse(b.rawEntries[0].rawJson);
  entry.resource.labels.bucket_name = 'attacker-bucket';
  b.rawEntries[0].rawJson = JSON.stringify(entry);
  b.rawEntries[0].rawSha256 = gcsRawAuditSha256(b.rawEntries[0].rawJson);
  b.pages[0].responseSha256 = gcsRawAuditSha256(gcsRawAuditCanonicalJson(b.rawEntries.map(x => x.rawSha256)));
  assert.ok(normalizeGcsRawAuditEvidence(b).errors.includes('GCS_RESOURCE_SCOPE_MISMATCH:0'));
});

test('rejects principal spoofing and role substitution', () => {
  const b = fixture();
  const entry = JSON.parse(b.rawEntries[0].rawJson);
  entry.protoPayload.authenticationInfo.principalEmail = 'attacker@example.invalid';
  b.rawEntries[0].rawJson = JSON.stringify(entry);
  b.rawEntries[0].rawSha256 = gcsRawAuditSha256(b.rawEntries[0].rawJson);
  b.pages[0].responseSha256 = gcsRawAuditSha256(gcsRawAuditCanonicalJson(b.rawEntries.map(x => x.rawSha256)));
  assert.ok(normalizeGcsRawAuditEvidence(b).errors.includes('ACTOR_ROLE_MISMATCH:0'));
});

test('rejects missing pagination completion and a dangling next-page token', () => {
  const b = fixture();
  b.source.paginationComplete = false;
  b.source.finalNextPageToken = 'still-more';
  assert.ok(normalizeGcsRawAuditEvidence(b).errors.includes('PAGINATION_INCOMPLETE'));
});

test('rejects page-token chain gaps and page content count mismatch', () => {
  const b = fixture();
  b.pages = [
    { pageIndex: 0, requestTokenHash: null, responseTokenHash: 'a'.repeat(64), entryCount: 4, responseSha256: b.pages[0].responseSha256 },
    { pageIndex: 1, requestTokenHash: 'b'.repeat(64), responseTokenHash: null, entryCount: 0, responseSha256: gcsRawAuditSha256('[]') }
  ];
  assert.ok(normalizeGcsRawAuditEvidence(b).errors.some(x => x.startsWith('PAGE_TOKEN_CHAIN_GAP:1')));
});

test('rejects log category, timestamp, and insertId anomalies', () => {
  const b = fixture();
  const entry = JSON.parse(b.rawEntries[0].rawJson);
  entry.logName = 'projects/other/logs/cloudaudit.googleapis.com%2Fdata_access';
  entry.timestamp = '2020-01-01T00:00:00Z';
  entry.insertId = '';
  b.rawEntries[0].rawJson = JSON.stringify(entry);
  b.rawEntries[0].rawSha256 = gcsRawAuditSha256(b.rawEntries[0].rawJson);
  b.pages[0].responseSha256 = gcsRawAuditSha256(gcsRawAuditCanonicalJson(b.rawEntries.map(x => x.rawSha256)));
  const errors = normalizeGcsRawAuditEvidence(b).errors;
  assert.ok(errors.includes('LOG_NAME_OUT_OF_SCOPE:0'));
  assert.ok(errors.includes('AUDIT_TIMESTAMP_OUT_OF_WINDOW:0'));
  assert.ok(errors.includes('INSERT_ID_MISSING_OR_DUPLICATE:0'));
});

test('rejects a delete attempt that was not denied', () => {
  const b = fixture();
  const entry = JSON.parse(b.rawEntries[2].rawJson);
  entry.protoPayload.status.code = 0;
  entry.protoPayload.authorizationInfo = [];
  b.rawEntries[2].rawJson = JSON.stringify(entry);
  b.rawEntries[2].rawSha256 = gcsRawAuditSha256(b.rawEntries[2].rawJson);
  b.pages[0].responseSha256 = gcsRawAuditSha256(gcsRawAuditCanonicalJson(b.rawEntries.map(x => x.rawSha256)));
  assert.ok(normalizeGcsRawAuditEvidence(b).errors.includes('DELETE_NOT_DENIED:2'));
});

test('rejects unrecognized method names and missing identity evidence', () => {
  const b = fixture();
  const entry = JSON.parse(b.rawEntries[1].rawJson);
  entry.protoPayload.methodName = 'unknown.operation';
  delete entry.protoPayload.authenticationInfo.principalEmail;
  b.rawEntries[1].rawJson = JSON.stringify(entry);
  b.rawEntries[1].rawSha256 = gcsRawAuditSha256(b.rawEntries[1].rawJson);
  b.pages[0].responseSha256 = gcsRawAuditSha256(gcsRawAuditCanonicalJson(b.rawEntries.map(x => x.rawSha256)));
  const errors = normalizeGcsRawAuditEvidence(b).errors;
  assert.ok(errors.includes('PRINCIPAL_IDENTITY_MISSING:1'));
  assert.ok(errors.includes('AUDIT_METHOD_UNMAPPED:1'));
});

test('rejects malformed JSON and unknown source schema fields', () => {
  const b = fixture();
  b.rawEntries[0].rawJson = '{not-json';
  b.rawEntries[0].rawSha256 = gcsRawAuditSha256(b.rawEntries[0].rawJson);
  b.pages[0].responseSha256 = gcsRawAuditSha256(gcsRawAuditCanonicalJson(b.rawEntries.map(x => x.rawSha256)));
  assert.ok(normalizeGcsRawAuditEvidence(b).errors.includes('RAW_ENTRY_JSON_INVALID:0'));
  const bad = fixture(); bad.source.untrustedClaim = true;
  assert.ok(normalizeGcsRawAuditEvidence(bad).errors.includes('SOURCE_SCHEMA_INVALID'));
});

test('fails closed on an empty raw export and duplicate insertIds', () => {
  const empty = fixture(); empty.rawEntries = [];
  empty.pages[0].entryCount = 0; empty.pages[0].responseSha256 = gcsRawAuditSha256('[]');
  assert.ok(normalizeGcsRawAuditEvidence(empty).errors.includes('OBJECT_CREATE_EVIDENCE_MISSING:mps/evidence/evt-synthetic/000001.json'));
  const dup = fixture(); dup.rawEntries[1].rawJson = dup.rawEntries[0].rawJson;
  dup.rawEntries[1].rawSha256 = gcsRawAuditSha256(dup.rawEntries[1].rawJson);
  dup.pages[0].responseSha256 = gcsRawAuditSha256(gcsRawAuditCanonicalJson(dup.rawEntries.map(x => x.rawSha256)));
  assert.ok(normalizeGcsRawAuditEvidence(dup).errors.includes('INSERT_ID_MISSING_OR_DUPLICATE:1'));
});


test('rejects operation recorded under the wrong audit category', () => {
  const b = fixture();
  const entry = JSON.parse(b.rawEntries[0].rawJson);
  entry.logName = 'projects/' + b.source.projectId + '/logs/cloudaudit.googleapis.com%2Factivity';
  b.rawEntries[0].rawJson = JSON.stringify(entry);
  b.rawEntries[0].rawSha256 = gcsRawAuditSha256(b.rawEntries[0].rawJson);
  b.pages[0].responseSha256 = gcsRawAuditSha256(gcsRawAuditCanonicalJson(b.rawEntries.map(x => x.rawSha256)));
  assert.ok(normalizeGcsRawAuditEvidence(b).errors.includes('AUDIT_CATEGORY_ACTION_MISMATCH:0'));
});
