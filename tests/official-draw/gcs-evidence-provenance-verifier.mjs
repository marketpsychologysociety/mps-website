import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isoTime = value => nonEmpty(value) && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function provenanceCanonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(provenanceCanonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key =>
      JSON.stringify(key) + ':' + provenanceCanonicalJson(value[key])
    ).join(',') + '}';
  }
  return JSON.stringify(value);
}

const payloadKeys = [
  'schemaVersion','keyId','issuer','reviewerSubject','exporterSubject','retrievalPrincipal',
  'projectId','bucket','windowStart','windowEnd','querySha256','rawBundleSha256',
  'pageCount','entryCount','paginationComplete','retrievalMethod','retrievedAt',
  'reviewerAuthContext','independentSourceAccessConfirmed','dataAccessCoverageConfirmed',
  'nonce','issuedAt','expiresAt'
];
const trustKeys = ['keyId','issuer','subject','publicKeyPem','notBefore','notAfter','revoked'];
const bundleKeys = ['schemaVersion','source','expectedPrincipals','expectedObjects','pages','rawEntries'];

function fail(errors) {
  return {
    ok: false, errors: [...new Set(errors)], provenanceVerified: false,
    googleSourceCryptographicallyAuthenticated: false,
    assurance: 'UNVERIFIED'
  };
}

/**
 * Verify a detached Ed25519 attestation from an independently pinned reviewer key.
 * This proves that the trusted reviewer key signed claims bound to this exact bundle.
 * It does NOT prove Google's cryptographic signature, nor make reviewer assertions true
 * without an independently governed identity/key-issuance and retrieval process.
 */
export function verifyGcsEvidenceProvenance(bundle, attestation, trust, options = {}) {
  const errors = [];
  const requiredOptions = ['expectedNonce','expectedProjectId','expectedBucket','expectedQuerySha256','now'];
  if (!exactKeys(options, requiredOptions) || !nonEmpty(options.expectedNonce) ||
      !nonEmpty(options.expectedProjectId) || !nonEmpty(options.expectedBucket) ||
      !hex64(options.expectedQuerySha256) || !Number.isFinite(options.now)) {
    return fail(['VERIFIER_CONTEXT_INVALID']);
  }
  if (!exactKeys(bundle, bundleKeys) || bundle.schemaVersion !== 'mps-gcs-raw-audit/v1' ||
      !bundle.source || !Array.isArray(bundle.pages) || !Array.isArray(bundle.rawEntries)) {
    return fail(['RAW_BUNDLE_INVALID']);
  }
  if (!exactKeys(attestation, ['payload','signature']) ||
      !exactKeys(attestation.payload, payloadKeys) || !nonEmpty(attestation.signature)) {
    return fail(['ATTESTATION_SCHEMA_INVALID']);
  }
  if (!exactKeys(trust, trustKeys) || !nonEmpty(trust.keyId) || !nonEmpty(trust.issuer) ||
      !nonEmpty(trust.subject) || !nonEmpty(trust.publicKeyPem) ||
      !isoTime(trust.notBefore) || !isoTime(trust.notAfter) || typeof trust.revoked !== 'boolean') {
    return fail(['TRUST_ANCHOR_INVALID']);
  }

  const p = attestation.payload;
  const now = options.now;
  const issued = Date.parse(p.issuedAt);
  const expires = Date.parse(p.expiresAt);
  if (p.schemaVersion !== 'mps-gcs-provenance-attestation/v1') errors.push('ATTESTATION_VERSION_UNSUPPORTED');
  if (p.keyId !== trust.keyId) errors.push('TRUST_KEY_ID_MISMATCH');
  if (p.issuer !== trust.issuer || p.reviewerSubject !== trust.subject || p.retrievalPrincipal !== p.reviewerSubject) {
    errors.push('REVIEWER_IDENTITY_MISMATCH');
  }
  if (trust.revoked) errors.push('TRUST_KEY_REVOKED');
  if (!isoTime(trust.notBefore) || !isoTime(trust.notAfter) ||
      issued < Date.parse(trust.notBefore) || issued > Date.parse(trust.notAfter) ||
      now < Date.parse(trust.notBefore) || now > Date.parse(trust.notAfter)) errors.push('TRUST_KEY_OUTSIDE_VALIDITY');
  if (!isoTime(p.issuedAt) || !isoTime(p.expiresAt) || issued > now || expires <= now ||
      expires <= issued || expires - issued > 24 * 60 * 60 * 1000) errors.push('ATTESTATION_TIME_INVALID');
  if (!nonEmpty(p.nonce) || p.nonce !== options.expectedNonce) errors.push('NONCE_MISMATCH');
  if (p.projectId !== options.expectedProjectId || p.bucket !== options.expectedBucket ||
      p.projectId !== bundle.source.projectId || p.bucket !== bundle.source.bucket) errors.push('SOURCE_SCOPE_MISMATCH');
  if (p.windowStart !== bundle.source.windowStart || p.windowEnd !== bundle.source.windowEnd ||
      !isoTime(p.windowStart) || !isoTime(p.windowEnd) || Date.parse(p.windowStart) >= Date.parse(p.windowEnd)) {
    errors.push('SOURCE_WINDOW_MISMATCH');
  }
  if (p.querySha256 !== options.expectedQuerySha256 || !hex64(p.querySha256)) errors.push('QUERY_DIGEST_MISMATCH');
  const bundleDigest = sha256(provenanceCanonicalJson(bundle));
  if (!hex64(p.rawBundleSha256) || p.rawBundleSha256 !== bundleDigest) errors.push('RAW_BUNDLE_DIGEST_MISMATCH');
  if (!Number.isSafeInteger(p.pageCount) || p.pageCount !== bundle.pages.length ||
      !Number.isSafeInteger(p.entryCount) || p.entryCount !== bundle.rawEntries.length) errors.push('EVIDENCE_COUNT_MISMATCH');
  if (p.paginationComplete !== true || bundle.source.paginationComplete !== true ||
      bundle.source.finalNextPageToken !== null) errors.push('PAGINATION_NOT_COMPLETE');
  if (p.retrievalMethod !== 'google-cloud-logging-authenticated-api-v2' ||
      p.independentSourceAccessConfirmed !== true || p.dataAccessCoverageConfirmed !== true ||
      !nonEmpty(p.reviewerAuthContext) || !isoTime(p.retrievedAt) ||
      Date.parse(p.retrievedAt) > issued || Date.parse(p.retrievedAt) < Date.parse(p.windowStart)) {
    errors.push('INDEPENDENT_RETRIEVAL_CLAIMS_INVALID');
  }
  if (!nonEmpty(p.exporterSubject) || p.exporterSubject === p.reviewerSubject) errors.push('REVIEWER_NOT_INDEPENDENT');

  let publicKey;
  let signature;
  try {
    publicKey = createPublicKey(trust.publicKeyPem);
    if (publicKey.asymmetricKeyType !== 'ed25519') errors.push('TRUST_KEY_ALGORITHM_INVALID');
  } catch { errors.push('TRUST_PUBLIC_KEY_INVALID'); }
  try {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attestation.signature)) {
      throw new Error('bad base64');
    }
    signature = Buffer.from(attestation.signature, 'base64');
    if (signature.length !== 64 || signature.toString('base64') !== attestation.signature) throw new Error('bad signature encoding');
  } catch { errors.push('SIGNATURE_ENCODING_INVALID'); }

  if (publicKey && signature) {
    let valid = false;
    try { valid = verifySignature(null, Buffer.from(provenanceCanonicalJson(p), 'utf8'), publicKey, signature); }
    catch { valid = false; }
    if (!valid) errors.push('ATTESTATION_SIGNATURE_INVALID');
  }
  if (errors.length) return fail(errors);
  return {
    ok: true, errors: [], provenanceVerified: true,
    googleSourceCryptographicallyAuthenticated: false,
    assurance: 'PINNED_INDEPENDENT_REVIEWER_ATTESTATION_VERIFIED',
    reviewer: { issuer: p.issuer, subject: p.reviewerSubject, keyId: trust.keyId },
    evidence: { projectId: p.projectId, bucket: p.bucket, pageCount: p.pageCount, entryCount: p.entryCount, rawBundleSha256: p.rawBundleSha256 },
    warning: 'This verifies a trusted reviewer signature and its binding to the exact evidence bundle. It does not cryptographically authenticate Google or independently prove that the reviewer claims are true. Trust-key governance, authenticated retrieval, durable nonce consumption, and independent operational review remain required.'
  };
}

export const provenanceSha256 = sha256;
