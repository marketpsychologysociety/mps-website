import { createHash, createPublicKey, randomBytes, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyRecoveryCheckpointAttestation, recoveryCheckpointSha256 } from './recovery-checkpoint-attestation.mjs';

const HASH_RE = /^[a-f0-9]{64}$/;
const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const SUBJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,255}$/;
const FIELDS = [
  'seq','event','event_id','actor_subject','key_id','issuer','subject','public_key_pem',
  'key_fingerprint','not_before','not_after','effective_at','nonce','nonce_digest',
  'attestation_digest','bundle_digest','created_at','prev_hash','hash'
];
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
const publicPem = value => typeof value === 'string' && /^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----\s*$/.test(value) && !value.includes('PRIVATE KEY');
const exact = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
const err = (code, message) => Object.assign(new Error(message), { code });
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}' : JSON.stringify(value);

/**
 * Test-only durable trust registry and single-use nonce contract.
 * Authentication is an injected integration boundary, not implemented here.
 * Use only synthetic identities and a disposable local directory.
 */
export class DurableReviewerTrustRegistry {
  static async open(directory, options = {}) {
    const instance = new DurableReviewerTrustRegistry(directory, options);
    await instance.#initialize();
    return instance;
  }

  #dir; #file; #lock; #authorizeAdmin; #testFaultInjector; #records = []; #keys = new Map(); #nonces = new Map();
  #lastHash = '0'.repeat(64); #closed = false; #queue = Promise.resolve(); #lockWaitMs; #lockRetryMs;

  constructor(directory, options) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw err('VALIDATION_ERROR', 'Registry directory must be an absolute local path.');
    if (typeof options.authorizeAdmin !== 'function') throw err('AUTHORIZATION_ADAPTER_REQUIRED', 'An independently authenticated admin authorization adapter is required.');
    this.#dir = directory; this.#file = path.join(directory, 'reviewer-trust.jsonl'); this.#lock = path.join(directory, 'reviewer-trust.lock');
    this.#authorizeAdmin = options.authorizeAdmin; this.#testFaultInjector = typeof options.testFaultInjector === 'function' ? options.testFaultInjector : null;
    this.#lockWaitMs = options.lockWaitMs ?? 2000; this.#lockRetryMs = options.lockRetryMs ?? 10;
  }

  async #initialize() {
    await fs.mkdir(this.#dir, { recursive: true, mode: 0o700 });
    await this.#withLock(async () => this.#reload());
  }

  #serial(task) {
    const next = this.#queue.then(task, task);
    this.#queue = next.catch(() => {});
    return next;
  }

  async #withLock(task) {
    const deadline = Date.now() + this.#lockWaitMs;
    let token;
    while (true) {
      let acquired = false;
      try {
        await fs.mkdir(this.#lock, { mode: 0o700 });
        acquired = true;
        token = randomBytes(24).toString('hex');
        await fs.writeFile(path.join(this.#lock, 'owner.json'), JSON.stringify({ pid: process.pid, hostname: os.hostname(), token }), { flag: 'wx', mode: 0o600 });
        break;
      } catch (error) {
        if (acquired) await fs.rm(this.#lock, { recursive: true, force: true }).catch(() => {});
        if (error.code !== 'EEXIST') throw error;
        try {
          const owner = JSON.parse(await fs.readFile(path.join(this.#lock, 'owner.json'), 'utf8'));
          if (Number.isSafeInteger(owner.pid) && owner.pid > 0 && owner.hostname === os.hostname()) {
            let alive = true;
            try { process.kill(owner.pid, 0); } catch (probe) { if (probe.code === 'ESRCH') alive = false; }
            if (!alive) {
              const quarantine = this.#lock + '.stale-' + randomBytes(8).toString('hex');
              try { await fs.rename(this.#lock, quarantine); await fs.rm(quarantine, { recursive: true, force: true }); continue; }
              catch (race) { if (!['ENOENT','EEXIST'].includes(race.code)) throw race; }
            }
          }
        } catch (ownerError) {
          if (ownerError.code === 'ENOENT') {
            // A competing process may have created the directory but not yet
            // written owner.json. Give that atomic-acquisition window a bounded
            // grace period; never steal the lock if the owner remains unknown.
            if (Date.now() >= deadline) throw err('LOCK_RECOVERY_REQUIRED', 'Registry lock owner record remained absent; refusing to steal an ambiguous lock. Manual reconciliation required.');
            await new Promise(resolve => setTimeout(resolve, this.#lockRetryMs));
            continue;
          }
          if (ownerError.code !== 'EEXIST') throw err('LOCK_RECOVERY_REQUIRED', 'Registry lock owner is missing or malformed; manual reconciliation required.');
        }
        if (Date.now() >= deadline) throw err('REGISTRY_LOCKED', 'Trust registry is locked by a live or foreign owner; no timeout-based lock stealing is allowed.');
        await new Promise(resolve => setTimeout(resolve, this.#lockRetryMs));
      }
    }
    try { return await task(); }
    finally {
      try {
        const owner = JSON.parse(await fs.readFile(path.join(this.#lock, 'owner.json'), 'utf8'));
        if (owner.pid === process.pid && owner.hostname === os.hostname() && owner.token === token) {
          await fs.rm(this.#lock, { recursive: true, force: true });
        }
      } catch { /* fail closed: leave an uncertain lock for operator reconciliation */ }
    }
  }

  async #reload() {
    this.#records = []; this.#keys.clear(); this.#nonces.clear(); this.#lastHash = '0'.repeat(64);
    let bytes;
    try { bytes = await fs.readFile(this.#file); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    const completeLength = bytes.lastIndexOf(10) + 1;
    if (completeLength !== bytes.length) {
      await fs.truncate(this.#file, completeLength);
      const handle = await fs.open(this.#file, 'r+'); try { await handle.sync(); } finally { await handle.close(); }
    }
    const lines = bytes.subarray(0, completeLength).toString('utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      if (Buffer.byteLength(line) > 32768) throw err('REGISTRY_INTEGRITY_ERROR', 'Registry record exceeds the size limit.');
      let record; try { record = JSON.parse(line); } catch { throw err('REGISTRY_INTEGRITY_ERROR', 'Malformed complete registry record.'); }
      this.#apply(record);
    }
  }

  #apply(record) {
    if (!exact(record, FIELDS) || !Number.isSafeInteger(record.seq) || record.seq !== this.#records.length + 1 ||
        !['KEY_REGISTERED','KEY_REVOKED','NONCE_ISSUED','NONCE_CONSUMED'].includes(record.event) ||
        typeof record.event_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(record.event_id) || typeof record.actor_subject !== 'string' || !SUBJECT_RE.test(record.actor_subject) || !iso(record.created_at) ||
        record.prev_hash !== this.#lastHash || !HASH_RE.test(record.hash)) throw err('REGISTRY_INTEGRITY_ERROR', 'Registry sequence or schema invalid.');
    const core = Object.fromEntries(FIELDS.filter(k => k !== 'hash').map(k => [k, record[k]]));
    if (sha256(canonical(core)) !== record.hash) throw err('REGISTRY_INTEGRITY_ERROR', 'Registry hash mismatch at sequence ' + record.seq + '.');
    if (record.event === 'KEY_REGISTERED') {
      if (record.effective_at !== null || record.nonce !== null || record.nonce_digest !== null || record.attestation_digest !== null || record.bundle_digest !== null ||
          !KEY_ID_RE.test(record.key_id || '') || !SUBJECT_RE.test(record.subject || '') || typeof record.issuer !== 'string' ||
          !publicPem(record.public_key_pem) || !HASH_RE.test(record.key_fingerprint || '') || !iso(record.not_before) || !iso(record.not_after) ||
          Date.parse(record.not_before) >= Date.parse(record.not_after) || this.#keys.has(record.key_id) || [...this.#keys.values()].some(existing => existing.key_fingerprint === record.key_fingerprint)) throw err('REGISTRY_INTEGRITY_ERROR', 'Invalid or duplicate key registration.');
      let key; try { key = createPublicKey(record.public_key_pem); } catch { throw err('REGISTRY_INTEGRITY_ERROR', 'Registered public key is malformed.'); }
      if (key.asymmetricKeyType !== 'ed25519' || sha256(key.export({ type: 'spki', format: 'der' }).toString('base64')) !== record.key_fingerprint) throw err('REGISTRY_INTEGRITY_ERROR', 'Registered public-key fingerprint mismatch.');
      this.#keys.set(record.key_id, { ...record, revokedAt: null });
    } else if (record.event === 'KEY_REVOKED') {
      if (record.issuer !== null || record.subject !== null || record.public_key_pem !== null || record.key_fingerprint !== null || record.not_before !== null || record.not_after !== null || record.nonce !== null || record.nonce_digest !== null || record.attestation_digest !== null || record.bundle_digest !== null) throw err('REGISTRY_INTEGRITY_ERROR', 'Revocation record contains unexpected fields.');
      const key = this.#keys.get(record.key_id);
      if (!key || key.revokedAt || !iso(record.effective_at)) throw err('REGISTRY_INTEGRITY_ERROR', 'Invalid or duplicate key revocation.');
      key.revokedAt = record.effective_at;
    } else if (record.event === 'NONCE_ISSUED') {
      if (record.key_id !== null || record.issuer !== null || record.subject !== null || record.public_key_pem !== null || record.key_fingerprint !== null || record.not_before !== null || record.not_after !== null || record.attestation_digest !== null || record.bundle_digest !== null ||
          record.nonce !== null || !HASH_RE.test(record.nonce_digest || '') || this.#nonces.has(record.nonce_digest) || !iso(record.effective_at)) throw err('REGISTRY_INTEGRITY_ERROR', 'Invalid or duplicate nonce issuance.');
      this.#nonces.set(record.nonce_digest, { issuedAt: record.created_at, expiresAt: record.effective_at, consumed: false });
    } else {
      if (record.key_id !== null || record.issuer !== null || record.subject !== null || record.public_key_pem !== null || record.key_fingerprint !== null || record.not_before !== null || record.not_after !== null || record.effective_at !== null || record.nonce !== null || !HASH_RE.test(record.nonce_digest || '')) throw err('REGISTRY_INTEGRITY_ERROR', 'Nonce consumption record contains unexpected fields.');
      const nonce = this.#nonces.get(record.nonce_digest);
      if (!nonce || nonce.consumed || !HASH_RE.test(record.attestation_digest || '') || !HASH_RE.test(record.bundle_digest || '')) throw err('REGISTRY_INTEGRITY_ERROR', 'Invalid or duplicate nonce consumption.');
      nonce.consumed = true; nonce.attestationDigest = record.attestation_digest; nonce.bundleDigest = record.bundle_digest;
    }
    this.#records.push(record); this.#lastHash = record.hash;
  }

  async #append(event, data) {
    if (this.#records.length >= 100000) throw err('REGISTRY_CAPACITY_REACHED', 'Trust registry record cap reached; controlled archival/migration required.');
    const core = {
      seq: this.#records.length + 1, event, event_id: randomUUID(), actor_subject: data.actorSubject,
      key_id: data.keyId ?? null, issuer: data.issuer ?? null, subject: data.subject ?? null,
      public_key_pem: data.publicKeyPem ?? null, key_fingerprint: data.keyFingerprint ?? null,
      not_before: data.notBefore ?? null, not_after: data.notAfter ?? null, effective_at: data.effectiveAt ?? null,
      nonce: data.nonce ?? null, nonce_digest: data.nonceDigest ?? null,
      attestation_digest: data.attestationDigest ?? null, bundle_digest: data.bundleDigest ?? null,
      created_at: new Date().toISOString(), prev_hash: this.#lastHash
    };
    const record = { ...core, hash: sha256(canonical(core)) };
    let existed = true;
    try { await fs.access(this.#file); } catch (error) { if (error.code === 'ENOENT') existed = false; else throw error; }
    const handle = await fs.open(this.#file, 'a', 0o600);
    try {
      await handle.writeFile(JSON.stringify(record) + '\n');
      if (this.#testFaultInjector) await this.#testFaultInjector('AFTER_WRITE_BEFORE_SYNC', event);
      await handle.sync();
    } catch (error) { throw err('RECONCILIATION_REQUIRED', 'Registry append outcome uncertain: ' + error.message); }
    finally { await handle.close(); }
    if (!existed) { const dirHandle = await fs.open(this.#dir, 'r'); try { await dirHandle.sync(); } finally { await dirHandle.close(); } }
    // Test-only crash seam: process may terminate after durable fsync but before
    // the caller receives an acknowledgement or in-memory state is updated.
    if (this.#testFaultInjector) await this.#testFaultInjector('AFTER_SYNC_BEFORE_ACK', event);
    this.#apply(record);
    return record;
  }

  async #admin(context, action) {
    if (!context || typeof context.actorSubject !== 'string' || !SUBJECT_RE.test(context.actorSubject) ||
        await this.#authorizeAdmin(context, action) !== true) throw err('FORBIDDEN', 'Independently authenticated trust-admin authorization required.');
    return context.actorSubject;
  }

  registerKey({ context, keyId, issuer, subject, publicKeyPem, notBefore, notAfter }) {
    return this.#serial(() => this.#withLock(async () => {
      if (this.#closed) throw err('REGISTRY_CLOSED', 'Registry is closed.');
      await this.#reload(); const actorSubject = await this.#admin(context, 'REGISTER_KEY');
      if (!KEY_ID_RE.test(keyId || '') || !SUBJECT_RE.test(subject || '') || typeof issuer !== 'string' || !issuer.trim() ||
          !iso(notBefore) || !iso(notAfter) || Date.parse(notBefore) >= Date.parse(notAfter) || !publicPem(publicKeyPem)) throw err('VALIDATION_ERROR', 'Invalid key registration fields.');
      if (this.#keys.has(keyId)) throw err('KEY_ID_CONFLICT', 'Key IDs are immutable and can never be reused.');
      let key; try { key = createPublicKey(publicKeyPem); } catch { throw err('VALIDATION_ERROR', 'Public key is invalid.'); }
      if (key.asymmetricKeyType !== 'ed25519') throw err('VALIDATION_ERROR', 'Only Ed25519 public keys are accepted.');
      if (actorSubject === subject) throw err('SEPARATION_OF_DUTIES', 'Trust administrator cannot register their own reviewer identity.');
      const fingerprint = sha256(key.export({ type: 'spki', format: 'der' }).toString('base64'));
      if ([...this.#keys.values()].some(existing => existing.key_fingerprint === fingerprint)) throw err('KEY_MATERIAL_REUSE', 'A public key fingerprint already exists in this registry; generate a new key pair for rotation.');
      await this.#append('KEY_REGISTERED', { actorSubject, keyId, issuer, subject, publicKeyPem, keyFingerprint: fingerprint, notBefore, notAfter });
      return { keyId, issuer, subject, fingerprint, status: 'ACTIVE' };
    }));
  }

  revokeKey({ context, keyId, effectiveAt }) {
    return this.#serial(() => this.#withLock(async () => {
      if (this.#closed) throw err('REGISTRY_CLOSED', 'Registry is closed.');
      await this.#reload(); const actorSubject = await this.#admin(context, 'REVOKE_KEY');
      const key = this.#keys.get(keyId);
      if (!key) throw err('KEY_NOT_FOUND', 'Reviewer key not found.');
      if (key.revokedAt) throw err('KEY_ALREADY_REVOKED', 'Reviewer key is already revoked.');
      if (!iso(effectiveAt)) throw err('VALIDATION_ERROR', 'Revocation effectiveAt must be an ISO UTC timestamp.');
      await this.#append('KEY_REVOKED', { actorSubject, keyId, effectiveAt });
      return { keyId, status: 'REVOKED', effectiveAt };
    }));
  }

  issueNonce({ context, ttlMs = 10 * 60 * 1000, now = Date.now() }) {
    return this.#serial(() => this.#withLock(async () => {
      if (this.#closed) throw err('REGISTRY_CLOSED', 'Registry is closed.');
      await this.#reload(); const actorSubject = await this.#admin(context, 'ISSUE_NONCE');
      if (!Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 60 * 60 * 1000 || !Number.isFinite(now)) throw err('VALIDATION_ERROR', 'Nonce TTL must be 1 second to 1 hour.');
      const nonce = randomBytes(32).toString('base64url');
      await this.#append('NONCE_ISSUED', { actorSubject, nonce: null, nonceDigest: sha256(nonce), effectiveAt: new Date(now + ttlMs).toISOString() });
      return { nonce, expiresAt: new Date(now + ttlMs).toISOString() };
    }));
  }

  verifyAndConsume({ bundle, attestation, expectedProjectId, expectedBucket, expectedQuerySha256, now = Date.now() }) {
    return this.#serial(() => this.#withLock(async () => {
      if (this.#closed) throw err('REGISTRY_CLOSED', 'Registry is closed.');
      await this.#reload();
      const payload = attestation?.payload;
      const key = payload && this.#keys.get(payload.keyId);
      if (!key) return { ok: false, errors: ['TRUST_KEY_NOT_REGISTERED'], provenanceVerified: false, googleSourceCryptographicallyAuthenticated: false };
      const nonceDigest = typeof payload.nonce === 'string' ? sha256(payload.nonce) : null;
      const nonce = nonceDigest ? this.#nonces.get(nonceDigest) : null;
      if (!nonce) return { ok: false, errors: ['NONCE_NOT_ISSUED'], provenanceVerified: false, googleSourceCryptographicallyAuthenticated: false };
      if (nonce.consumed) return { ok: false, errors: ['NONCE_ALREADY_CONSUMED'], provenanceVerified: false, googleSourceCryptographicallyAuthenticated: false };
      if (now >= Date.parse(nonce.expiresAt)) return { ok: false, errors: ['NONCE_EXPIRED'], provenanceVerified: false, googleSourceCryptographicallyAuthenticated: false };
      if (!iso(payload.issuedAt) || Date.parse(payload.issuedAt) < Date.parse(nonce.issuedAt) || Date.parse(payload.expiresAt) > Date.parse(nonce.expiresAt)) return { ok: false, errors: ['NONCE_TIME_SCOPE_INVALID'], provenanceVerified: false, googleSourceCryptographicallyAuthenticated: false };
      const { verifyGcsEvidenceProvenance } = await import('./gcs-evidence-provenance-verifier.mjs');
      const issuedAt = Date.parse(payload.issuedAt);
      const revokedAt = key.revokedAt ? Date.parse(key.revokedAt) : Infinity;
      const trust = { keyId: key.key_id, issuer: key.issuer, subject: key.subject, publicKeyPem: key.public_key_pem,
        notBefore: key.not_before, notAfter: key.not_after, revoked: !!key.revokedAt && issuedAt >= revokedAt };
      const result = verifyGcsEvidenceProvenance(bundle, attestation, trust, {
        expectedNonce: payload.nonce, expectedProjectId, expectedBucket, expectedQuerySha256, now
      });
      if (!result.ok) return result;
      const attestationDigest = sha256(canonical(attestation));
      const bundleDigest = sha256(canonical(bundle));
      await this.#append('NONCE_CONSUMED', { actorSubject: 'system:provenance-verifier', nonce: null, nonceDigest, attestationDigest, bundleDigest });
      return { ...result, nonceConsumed: true, nonceDigest };
    }));
  }

  verifyAndConsumeRecoveryCheckpoint({ checkpoint, attestation, expectedCheckpointId, expectedSourceId, now = Date.now() }) {
    return this.#serial(() => this.#withLock(async () => {
      if (this.#closed) throw err('REGISTRY_CLOSED', 'Registry is closed.');
      await this.#reload();
      const payload = attestation?.payload;
      const key = payload && this.#keys.get(payload.keyId);
      if (!key) return { ok: false, errors: ['TRUST_KEY_NOT_REGISTERED'], checkpointAttestationVerified: false, assurance: 'UNVERIFIED' };
      const nonceDigest = typeof payload.nonce === 'string' ? sha256(payload.nonce) : null;
      const nonce = nonceDigest ? this.#nonces.get(nonceDigest) : null;
      if (!nonce) return { ok: false, errors: ['NONCE_NOT_ISSUED'], checkpointAttestationVerified: false, assurance: 'UNVERIFIED' };
      if (nonce.consumed) return { ok: false, errors: ['NONCE_ALREADY_CONSUMED'], checkpointAttestationVerified: false, assurance: 'UNVERIFIED' };
      if (!Number.isFinite(now) || now >= Date.parse(nonce.expiresAt)) return { ok: false, errors: ['NONCE_EXPIRED'], checkpointAttestationVerified: false, assurance: 'UNVERIFIED' };
      if (!iso(payload.issuedAt) || !iso(payload.expiresAt) ||
          Date.parse(payload.issuedAt) < Date.parse(nonce.issuedAt) ||
          Date.parse(payload.expiresAt) > Date.parse(nonce.expiresAt)) {
        return { ok: false, errors: ['NONCE_TIME_SCOPE_INVALID'], checkpointAttestationVerified: false, assurance: 'UNVERIFIED' };
      }
      const issuedAt = Date.parse(payload.issuedAt);
      const revokedAt = key.revokedAt ? Date.parse(key.revokedAt) : Infinity;
      const trust = {
        keyId: key.key_id, issuer: key.issuer, subject: key.subject,
        publicKeyPem: key.public_key_pem, notBefore: key.not_before,
        notAfter: key.not_after, revoked: !!key.revokedAt && issuedAt >= revokedAt
      };
      const result = verifyRecoveryCheckpointAttestation(checkpoint, attestation, trust, {
        expectedCheckpointId, expectedSourceId, expectedNonce: payload.nonce, now
      });
      if (!result.ok) return result;
      const attestationDigest = sha256(canonical(attestation));
      const checkpointDigest = recoveryCheckpointSha256(checkpoint);
      await this.#append('NONCE_CONSUMED', {
        actorSubject: 'system:recovery-checkpoint-verifier',
        nonce: null, nonceDigest, attestationDigest, bundleDigest: checkpointDigest
      });
      return { ...result, nonceConsumed: true, nonceDigest };
    }));
  }

  getKey(keyId) {
    const key = this.#keys.get(keyId);
    if (!key) return null;
    return { keyId: key.key_id, issuer: key.issuer, subject: key.subject, fingerprint: key.key_fingerprint,
      notBefore: key.not_before, notAfter: key.not_after, revokedAt: key.revokedAt, status: key.revokedAt ? 'REVOKED' : 'ACTIVE' };
  }
  getStats() { return { recordCount: this.#records.length, keyCount: this.#keys.size, nonceCount: this.#nonces.size, consumedNonceCount: [...this.#nonces.values()].filter(n => n.consumed).length, lastHash: this.#lastHash }; }
  async close() { await this.#queue; this.#closed = true; }
}
