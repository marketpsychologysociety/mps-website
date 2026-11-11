import { createHash } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const isoTime = value => nonEmpty(value) && !Number.isNaN(Date.parse(value));
const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const canonical = value => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
};
const auditType = 'type.googleapis.com/google.cloud.audit.AuditLog';
const allowedTop = ['schemaVersion','source','expectedPrincipals','expectedObjects','pages','rawEntries'];
const allowedSource = ['projectId','bucket','windowStart','windowEnd','expectedLogNames','paginationComplete','finalNextPageToken','independentExportRef'];
const allowedPage = ['pageIndex','requestTokenHash','responseTokenHash','entryCount','responseSha256'];
const allowedRaw = ['pageIndex','rawJson','rawSha256'];

function errorResult(errors) {
  return { ok: false, errors: [...new Set(errors)], normalizedEvents: [], sourceAuthenticated: false,
    assurance: 'STRUCTURAL_ONLY_SOURCE_AUTHENTICITY_NOT_VERIFIED' };
}

/**
 * Offline structural validator for raw Cloud Audit Logs captured as exact JSON strings.
 * It never authenticates Google as the source. A matching SHA-256 only binds the supplied
 * bytes to this bundle; it is not a Google signature or proof of export provenance.
 */
export function normalizeGcsRawAuditEvidence(bundle) {
  const errors = [];
  const fail = code => errors.push(code);
  if (!exactKeys(bundle, allowedTop)) return errorResult(['BUNDLE_SCHEMA_INVALID']);
  if (bundle.schemaVersion !== 'mps-gcs-raw-audit/v1') fail('SCHEMA_VERSION_UNSUPPORTED');
  const s = bundle.source;
  if (!exactKeys(s, allowedSource)) return errorResult([...errors, 'SOURCE_SCHEMA_INVALID']);
  if (![s.projectId,s.bucket,s.independentExportRef].every(nonEmpty) ||
      !isoTime(s.windowStart) || !isoTime(s.windowEnd) || Date.parse(s.windowStart) >= Date.parse(s.windowEnd)) {
    fail('SOURCE_DESCRIPTOR_INVALID');
  }
  const expectedData = 'projects/' + s.projectId + '/logs/cloudaudit.googleapis.com%2Fdata_access';
  const expectedActivity = 'projects/' + s.projectId + '/logs/cloudaudit.googleapis.com%2Factivity';
  const expectedPolicy = 'projects/' + s.projectId + '/logs/cloudaudit.googleapis.com%2Fpolicy';
  if (!Array.isArray(s.expectedLogNames) || s.expectedLogNames.length === 0 ||
      s.expectedLogNames.some(n => ![expectedData, expectedActivity, expectedPolicy].includes(n)) ||
      new Set(s.expectedLogNames).size !== s.expectedLogNames.length) fail('EXPECTED_LOG_NAMES_INVALID');
  if (s.paginationComplete !== true || s.finalNextPageToken !== null) fail('PAGINATION_INCOMPLETE');
  if (!exactKeys(bundle.expectedPrincipals, ['writer','verifier','storageAdmin']) ||
      !['writer','verifier','storageAdmin'].every(k => nonEmpty(bundle.expectedPrincipals[k]))) fail('EXPECTED_PRINCIPALS_INVALID');
  if (!Array.isArray(bundle.expectedObjects) || bundle.expectedObjects.length === 0 ||
      bundle.expectedObjects.some(x => !nonEmpty(x)) || new Set(bundle.expectedObjects).size !== bundle.expectedObjects.length) {
    fail('EXPECTED_OBJECTS_INVALID');
  }

  if (!Array.isArray(bundle.pages) || bundle.pages.length === 0) {
    fail('PAGE_MANIFEST_INVALID');
  } else {
    for (let i = 0; i < bundle.pages.length; i++) {
      const p = bundle.pages[i];
      if (!exactKeys(p, allowedPage) || p.pageIndex !== i ||
          !(p.requestTokenHash === null || hex64(p.requestTokenHash)) ||
          !(p.responseTokenHash === null || hex64(p.responseTokenHash)) ||
          !Number.isSafeInteger(p.entryCount) || p.entryCount < 0 || !hex64(p.responseSha256)) {
        fail('PAGE_MANIFEST_INVALID:' + i);
        continue;
      }
      if (i === 0 && p.requestTokenHash !== null) fail('FIRST_PAGE_TOKEN_INVALID');
      if (i > 0 && p.requestTokenHash !== bundle.pages[i - 1]?.responseTokenHash) fail('PAGE_TOKEN_CHAIN_GAP:' + i);
      if (i < bundle.pages.length - 1 && p.responseTokenHash === null) fail('PAGE_CHAIN_TERMINATED_EARLY:' + i);
      if (i === bundle.pages.length - 1 && p.responseTokenHash !== null) fail('LAST_PAGE_HAS_NEXT_TOKEN');
    }
  }

  if (!Array.isArray(bundle.rawEntries)) return errorResult([...errors, 'RAW_ENTRY_SET_INVALID']);
  const pageEntries = new Map((Array.isArray(bundle.pages) ? bundle.pages : []).map(p => [p?.pageIndex, []]));
  const seenInsertIds = new Set();
  const normalizedEvents = [];
  const expectedLogNames = new Set(Array.isArray(s?.expectedLogNames) ? s.expectedLogNames : []);
  const principals = bundle.expectedPrincipals || {};
  const expectedObjects = new Set(Array.isArray(bundle.expectedObjects) ? bundle.expectedObjects : []);
  const objectSuffix = '/buckets/' + s?.bucket + '/objects/';
  const expectedObjectForResource = resourceName => {
    if (!nonEmpty(resourceName)) return null;
    for (const name of expectedObjects) {
      const encoded = encodeURIComponent(name).replace(/%2F/g, '%2F');
      if (resourceName.endsWith(objectSuffix + name) || resourceName.endsWith(objectSuffix + encoded) ||
          resourceName === 'gs://' + s.bucket + '/' + name) return name;
    }
    return null;
  };

  for (let i = 0; i < bundle.rawEntries.length; i++) {
    const item = bundle.rawEntries[i];
    if (!exactKeys(item, allowedRaw) || !Number.isSafeInteger(item.pageIndex) ||
        typeof item.rawJson !== 'string' || !hex64(item.rawSha256)) {
      fail('RAW_ENTRY_SCHEMA_INVALID:' + i); continue;
    }
    const pageList = pageEntries.get(item.pageIndex);
    if (!pageList) { fail('RAW_ENTRY_PAGE_UNKNOWN:' + i); continue; }
    const actualDigest = sha256(item.rawJson);
    if (actualDigest !== item.rawSha256) { fail('RAW_ENTRY_DIGEST_MISMATCH:' + i); continue; }
    pageList.push(item.rawSha256);
    let entry;
    try { entry = JSON.parse(item.rawJson); } catch { fail('RAW_ENTRY_JSON_INVALID:' + i); continue; }
    const p = entry?.protoPayload;
    const resource = entry?.resource;
    if (!nonEmpty(entry?.logName) || !expectedLogNames.has(entry.logName)) fail('LOG_NAME_OUT_OF_SCOPE:' + i);
    if (entry?.logName !== expectedData && entry?.logName !== expectedActivity) fail('AUDIT_LOG_CATEGORY_INVALID:' + i);
    if (resource?.type !== 'gcs_bucket' || resource?.labels?.project_id !== s.projectId ||
        resource?.labels?.bucket_name !== s.bucket) fail('GCS_RESOURCE_SCOPE_MISMATCH:' + i);
    if (p?.['@type'] !== auditType || p?.serviceName !== 'storage.googleapis.com' ||
        !nonEmpty(p?.methodName) || !nonEmpty(p?.resourceName)) fail('AUDIT_PAYLOAD_INVALID:' + i);
    if (!isoTime(entry?.timestamp) || !isoTime(entry?.receiveTimestamp) ||
        Date.parse(entry.timestamp) < Date.parse(s.windowStart) || Date.parse(entry.timestamp) > Date.parse(s.windowEnd)) {
      fail('AUDIT_TIMESTAMP_OUT_OF_WINDOW:' + i);
    }
    if (!nonEmpty(entry?.insertId) || seenInsertIds.has(entry.insertId)) fail('INSERT_ID_MISSING_OR_DUPLICATE:' + i);
    else seenInsertIds.add(entry.insertId);
    const principal = p?.authenticationInfo?.principalEmail;
    if (!nonEmpty(principal)) fail('PRINCIPAL_IDENTITY_MISSING:' + i);
    const authz = Array.isArray(p?.authorizationInfo) ? p.authorizationInfo : [];
    const statusCode = Number.isInteger(p?.status?.code) ? p.status.code : 0;
    let action = null;
    if (/storage\.objects\.(create|insert)$/.test(p?.methodName || '')) action = 'OBJECT_CREATE';
    else if (/storage\.objects\.(get|download)$/.test(p?.methodName || '')) action = 'OBJECT_READ';
    else if (/storage\.objects\.(delete)$/.test(p?.methodName || '')) action = 'OBJECT_DELETE';
    else if (/storage\.buckets\.(setIamPolicy|update)$/.test(p?.methodName || '')) action = 'POLICY_CHANGE';
    if (!action) { fail('AUDIT_METHOD_UNMAPPED:' + i); continue; }
    const categoryMatches = action === 'POLICY_CHANGE' ? entry.logName === expectedActivity :
      action === 'OBJECT_DELETE' ? [expectedData, expectedPolicy].includes(entry.logName) : entry.logName === expectedData;
    if (!categoryMatches) fail('AUDIT_CATEGORY_ACTION_MISMATCH:' + i);

    let expectedRole = null;
    if (action === 'OBJECT_CREATE' || action === 'OBJECT_DELETE') expectedRole = 'writer';
    if (action === 'OBJECT_READ') expectedRole = 'verifier';
    if (action === 'POLICY_CHANGE') expectedRole = 'storageAdmin';
    if (principal !== principals[expectedRole]) fail('ACTOR_ROLE_MISMATCH:' + i);
    const objectName = action === 'POLICY_CHANGE' ? null : expectedObjectForResource(p.resourceName);
    if (action !== 'POLICY_CHANGE' && !objectName) fail('OBJECT_RESOURCE_OUT_OF_SCOPE:' + i);
    const denied = statusCode === 7 || authz.some(a => a?.granted === false);
    const success = statusCode === 0 && !denied;
    if (action === 'OBJECT_DELETE' && !denied) fail('DELETE_NOT_DENIED:' + i);
    if (action === 'POLICY_CHANGE' && !success) fail('POLICY_CHANGE_NOT_SUCCESSFUL:' + i);
    normalizedEvents.push({
      action, principalSubject: principal, resourceName: p.resourceName,
      objectName, outcome: denied ? 'DENIED' : success ? 'SUCCESS' : 'ERROR',
      timestamp: entry.timestamp, receiveTimestamp: entry.receiveTimestamp,
      insertId: entry.insertId, logName: entry.logName, methodName: p.methodName,
      statusCode, rawSha256: item.rawSha256
    });
  }

  if (Array.isArray(bundle.pages)) {
    for (const page of bundle.pages) {
      const hashes = pageEntries.get(page?.pageIndex) || [];
      if (hashes.length !== page?.entryCount || sha256(canonical(hashes)) !== page?.responseSha256) {
        fail('PAGE_CONTENT_MANIFEST_MISMATCH:' + page?.pageIndex);
      }
    }
  }
  for (const name of expectedObjects) {
    if (!normalizedEvents.some(e => e.action === 'OBJECT_CREATE' && e.objectName === name && e.outcome === 'SUCCESS')) fail('OBJECT_CREATE_EVIDENCE_MISSING:' + name);
    if (!normalizedEvents.some(e => e.action === 'OBJECT_READ' && e.objectName === name && e.outcome === 'SUCCESS')) fail('OBJECT_READ_EVIDENCE_MISSING:' + name);
  }
  if (!normalizedEvents.some(e => e.action === 'OBJECT_DELETE' && e.outcome === 'DENIED' &&
      e.principalSubject === principals.writer)) fail('WRITER_DELETE_DENIAL_EVIDENCE_MISSING');

  return errors.length ? errorResult(errors) : {
    ok: true, errors: [], normalizedEvents,
    sourceAuthenticated: false,
    assurance: 'STRUCTURAL_ONLY_SOURCE_AUTHENTICITY_NOT_VERIFIED',
    warning: 'Raw JSON hashes and export manifests do not authenticate Google Cloud as the source. Verify provenance independently using authenticated Cloud Logging access or provider-verifiable evidence.'
  };
}

export const gcsRawAuditSha256 = sha256;
export const gcsRawAuditCanonicalJson = canonical;
