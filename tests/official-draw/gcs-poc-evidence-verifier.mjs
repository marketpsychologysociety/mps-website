import { createHash } from 'node:crypto';

const TOP_KEYS = ['schemaVersion','project','principals','expectedSequences','objects','auditCoverage','auditEvents'];
const PRINCIPAL_KEYS = ['writer','verifier','storageAdmin','auditAdmin','recovery'];
const OBJECT_KEYS = ['name','generation','metageneration','createdAt','payload','sha256','previousReceiptHash','receiptHash'];
const PAYLOAD_KEYS = ['protocolVersion','eventRef','sequence','previousJournalHash','journalHash','operationRef'];
const AUDIT_KEYS = ['action','principalSubject','resourceName','outcome','timestamp'];
const COVERAGE_KEYS = ['adminActivity','dataRead','dataWrite','independentExport'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const isHex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isDecimal = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
const canonical = value => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
};
const receiptMaterial = object => ({
  name: object.name, generation: object.generation, metageneration: object.metageneration,
  createdAt: object.createdAt, payload: object.payload, sha256: object.sha256,
  previousReceiptHash: object.previousReceiptHash
});

/**
 * Verify a normalized, independently exported GCS PoC evidence bundle.
 * This function performs no network calls and does not authenticate GCP logs.
 * The export/normalization pipeline and source IAM/audit evidence must be reviewed separately.
 */
export function verifyGcsPocEvidenceBundle(bundle) {
  const errors = [];
  const fail = message => errors.push(message);
  if (!exactKeys(bundle, TOP_KEYS)) return { ok: false, errors: ['BUNDLE_SCHEMA_INVALID'] };
  if (bundle.schemaVersion !== 'mps-gcs-poc-evidence/v1') fail('SCHEMA_VERSION_UNSUPPORTED');

  if (!bundle.project || !exactKeys(bundle.project, ['projectId','bucket','location']) ||
      !['projectId','bucket','location'].every(k => nonEmpty(bundle.project[k]))) fail('PROJECT_DESCRIPTOR_INVALID');

  if (!bundle.principals || !exactKeys(bundle.principals, PRINCIPAL_KEYS)) {
    fail('PRINCIPAL_SET_INVALID');
  } else {
    const subjects = [];
    const boundaries = [];
    for (const role of PRINCIPAL_KEYS) {
      const principal = bundle.principals[role];
      if (!exactKeys(principal, ['subject','adminBoundary']) || !nonEmpty(principal.subject) || !nonEmpty(principal.adminBoundary)) {
        fail('PRINCIPAL_DESCRIPTOR_INVALID:' + role);
      } else {
        subjects.push(principal.subject);
        boundaries.push(principal.adminBoundary);
      }
    }
    if (new Set(subjects).size !== subjects.length) fail('PRINCIPAL_SUBJECT_REUSED');
    if (new Set(boundaries).size !== boundaries.length) fail('ADMIN_BOUNDARY_REUSED');
  }

  if (!Array.isArray(bundle.expectedSequences) || bundle.expectedSequences.length === 0 ||
      bundle.expectedSequences.some(n => !Number.isSafeInteger(n) || n < 1) ||
      new Set(bundle.expectedSequences).size !== bundle.expectedSequences.length) {
    fail('EXPECTED_SEQUENCE_SET_INVALID');
  }
  if (!Array.isArray(bundle.objects) || bundle.objects.length === 0) {
    fail('OBJECT_SET_EMPTY');
  } else {
    const sorted = [...bundle.objects].sort((a,b) => (a?.payload?.sequence ?? 0) - (b?.payload?.sequence ?? 0));
    const names = new Set();
    let previousReceipt = 'GENESIS';
    for (const object of sorted) {
      if (!exactKeys(object, OBJECT_KEYS)) { fail('OBJECT_SCHEMA_INVALID'); continue; }
      if (!nonEmpty(object.name) || names.has(object.name)) fail('OBJECT_NAME_INVALID_OR_DUPLICATE');
      names.add(object.name);
      if (!isDecimal(object.generation) || object.generation === '0') fail('GENERATION_INVALID');
      if (!isDecimal(object.metageneration) || object.metageneration === '0') fail('METAGENERATION_INVALID');
      if (!nonEmpty(object.createdAt) || Number.isNaN(Date.parse(object.createdAt))) fail('OBJECT_TIMESTAMP_INVALID');
      if (!exactKeys(object.payload, PAYLOAD_KEYS)) { fail('PAYLOAD_SCHEMA_INVALID'); continue; }
      const p = object.payload;
      if (!nonEmpty(p.protocolVersion) || !nonEmpty(p.eventRef) || !Number.isSafeInteger(p.sequence) || p.sequence < 1 ||
          !isHex64(p.previousJournalHash) || !isHex64(p.journalHash) || !nonEmpty(p.operationRef)) fail('PAYLOAD_INVALID');
      const digest = sha256(canonical(p));
      if (object.sha256 !== digest) fail('PAYLOAD_DIGEST_MISMATCH:' + p.sequence);
      if (object.previousReceiptHash !== previousReceipt) fail('RECEIPT_CHAIN_GAP:' + p.sequence);
      const expectedReceipt = sha256(canonical(receiptMaterial(object)));
      if (object.receiptHash !== expectedReceipt) fail('RECEIPT_HASH_MISMATCH:' + p.sequence);
      previousReceipt = object.receiptHash;
    }
    const actual = sorted.map(o => o?.payload?.sequence);
    if (Array.isArray(bundle.expectedSequences) && canonical(actual) !== canonical([...bundle.expectedSequences].sort((a,b)=>a-b))) {
      fail('OBJECT_SEQUENCE_SET_MISMATCH');
    }
  }

  if (!exactKeys(bundle.auditCoverage, COVERAGE_KEYS) ||
      COVERAGE_KEYS.some(k => bundle.auditCoverage[k] !== true)) fail('AUDIT_COVERAGE_INCOMPLETE');
  if (!Array.isArray(bundle.auditEvents)) {
    fail('AUDIT_EVENT_SET_INVALID');
  } else {
    for (const event of bundle.auditEvents) {
      if (!exactKeys(event, AUDIT_KEYS) || !AUDIT_KEYS.every(k => nonEmpty(event[k]))) fail('AUDIT_EVENT_SCHEMA_INVALID');
    }
    const writer = bundle.principals?.writer?.subject;
    const verifier = bundle.principals?.verifier?.subject;
    const events = bundle.auditEvents;
    for (const object of bundle.objects || []) {
      const created = events.some(e => e?.action === 'OBJECT_CREATE' && e.principalSubject === writer &&
        e.resourceName === object.name && e.outcome === 'SUCCESS');
      const read = events.some(e => e?.action === 'OBJECT_READ' && e.principalSubject === verifier &&
        e.resourceName === object.name && e.outcome === 'SUCCESS');
      if (!created) fail('AUDIT_CREATE_MISSING:' + object.name);
      if (!read) fail('INDEPENDENT_READ_AUDIT_MISSING:' + object.name);
    }
    const deniedDelete = events.some(e => e?.action === 'OBJECT_DELETE' && e.principalSubject === writer && e.outcome === 'DENIED');
    if (!deniedDelete) fail('WRITER_DELETE_DENIAL_AUDIT_MISSING');
    const policyChange = events.some(e => e?.action === 'POLICY_CHANGE' &&
      e.principalSubject === bundle.principals?.storageAdmin?.subject && e.outcome === 'SUCCESS');
    if (!policyChange) fail('ADMIN_POLICY_AUDIT_MISSING');
  }

  return { ok: errors.length === 0, errors };
}

export const gcsPocCanonicalJson = canonical;
export const gcsPocSha256 = sha256;
