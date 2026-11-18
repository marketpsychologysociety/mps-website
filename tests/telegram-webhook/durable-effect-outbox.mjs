import { createHash, randomUUID } from 'node:crypto';

const STATES = new Set(['PENDING', 'PROCESSING', 'SENT', 'RETRYABLE', 'REVIEW']);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const normalized = {};
    Object.keys(value).sort().forEach(key => { normalized[key] = canonicalize(value[key]); });
    return normalized;
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function validKey(value) {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value);
}

function safeCode(value) {
  const code = String(value ?? '').toUpperCase();
  return /^[A-Z0-9_]{1,40}$/.test(code) ? code : 'UNCLASSIFIED';
}

/**
 * Effect-level outbox contract. A production store must provide durable,
 * cross-worker atomic(fn), get and put semantics. The test store below is
 * in-memory only and is not a production persistence adapter.
 */
export class DurableEffectOutbox {
  constructor(store, { leaseMs = 600_000, tokenFactory = randomUUID } = {}) {
    if (!store || typeof store.atomic !== 'function' ||
        typeof store.get !== 'function' || typeof store.put !== 'function') {
      throw new TypeError('A durable atomic outbox store is required');
    }
    this.store = store;
    this.leaseMs = leaseMs;
    this.tokenFactory = tokenFactory;
  }

  async enqueue({ effectKey, updateId, effectType, payload }, now = Date.now()) {
    if (!validKey(effectKey)) throw new TypeError('INVALID_EFFECT_KEY');
    if (!validKey(String(updateId))) throw new TypeError('INVALID_UPDATE_ID');
    if (!validKey(effectType)) throw new TypeError('INVALID_EFFECT_TYPE');
    if (!Number.isFinite(now) || now <= 0) throw new TypeError('INVALID_TIMESTAMP');
    const payloadHash = digest(payload);
    return this.store.atomic(async () => {
      const existing = await this.store.get(effectKey);
      if (existing) {
        if (existing.payloadHash !== payloadHash ||
            existing.updateId !== String(updateId) || existing.effectType !== effectType) {
          await this.store.put(effectKey, {
            ...existing, state: 'REVIEW', leaseExpiresAt: 0,
            claimToken: null, completedAt: null, providerReference: null,
            lastErrorCode: 'EFFECT_KEY_COLLISION'
          });
          return { outcome: 'MANUAL_REVIEW' };
        }
        return { outcome: 'EXISTS', state: existing.state };
      }
      const row = {
        effectKey, updateId: String(updateId), effectType, payloadHash,
        state: 'PENDING', attemptCount: 0, createdAt: now,
        lastAttemptAt: 0, leaseExpiresAt: 0, claimToken: null,
        completedAt: null, providerReference: null, lastErrorCode: null
      };
      await this.store.put(effectKey, row);
      return { outcome: 'ENQUEUED', row: structuredClone(row) };
    });
  }

  async claim(effectKey, now = Date.now()) {
    if (!validKey(effectKey)) throw new TypeError('INVALID_EFFECT_KEY');
    if (!Number.isFinite(now) || now <= 0) throw new TypeError('INVALID_TIMESTAMP');
    return this.store.atomic(async () => {
      const existing = await this.store.get(effectKey);
      if (!existing) return { outcome: 'NOT_FOUND' };
      if (existing.state === 'SENT') return { outcome: 'ALREADY_SENT' };
      if (existing.state === 'REVIEW') return { outcome: 'MANUAL_REVIEW' };
      if (existing.state === 'PROCESSING' && existing.leaseExpiresAt > now) {
        return { outcome: 'BUSY' };
      }
      if (!['PENDING', 'RETRYABLE', 'PROCESSING'].includes(existing.state)) {
        throw new Error('OUTBOX_ROW_CORRUPT');
      }
      const recovered = existing.state === 'PROCESSING';
      const claimToken = this.tokenFactory();
      if (!claimToken) throw new Error('CLAIM_TOKEN_UNAVAILABLE');
      const row = {
        ...existing, state: 'PROCESSING',
        attemptCount: existing.attemptCount + 1,
        lastAttemptAt: now, leaseExpiresAt: now + this.leaseMs,
        claimToken, lastErrorCode: null
      };
      await this.store.put(effectKey, row);
      return { outcome: 'CLAIMED', recovered, row: structuredClone(row) };
    });
  }

  async markSent(effectKey, claimToken, now = Date.now(), providerReference = '') {
    const reference = String(providerReference ?? '');
    if (reference && !/^[A-Za-z0-9:_-]{1,128}$/.test(reference)) {
      throw new TypeError('INVALID_PROVIDER_REFERENCE');
    }
    return this.#transition(effectKey, claimToken, now, row => ({
      ...row, state: 'SENT', leaseExpiresAt: 0, claimToken: null,
      completedAt: now, providerReference: reference || null, lastErrorCode: null
    }));
  }

  async retry(effectKey, claimToken, now = Date.now(), errorCode = 'CONFIRMED_NOT_SENT') {
    return this.#transition(effectKey, claimToken, now, row => ({
      ...row, state: 'RETRYABLE', leaseExpiresAt: 0, claimToken: null,
      lastErrorCode: safeCode(errorCode)
    }));
  }

  async review(effectKey, claimToken, now = Date.now(), errorCode = 'AMBIGUOUS_OUTCOME') {
    return this.#transition(effectKey, claimToken, now, row => ({
      ...row, state: 'REVIEW', leaseExpiresAt: 0, claimToken: null,
      lastErrorCode: safeCode(errorCode)
    }));
  }

  async #transition(effectKey, claimToken, now, transform) {
    if (!validKey(effectKey)) throw new TypeError('INVALID_EFFECT_KEY');
    if (!Number.isFinite(now) || now <= 0) throw new TypeError('INVALID_TIMESTAMP');
    return this.store.atomic(async () => {
      const row = await this.store.get(effectKey);
      if (!row || row.state !== 'PROCESSING' || !claimToken ||
          row.claimToken !== claimToken || row.leaseExpiresAt <= now) {
        throw new Error('STALE_OR_INVALID_CLAIM');
      }
      const next = transform(row);
      if (!STATES.has(next.state)) throw new Error('INVALID_STATE');
      await this.store.put(effectKey, next);
      return structuredClone(next);
    });
  }
}

/** Test-only store; never use as evidence of durable production storage. */
export class SharedMemoryEffectStore {
  constructor(shared = new Map()) {
    this.rows = shared;
    this.tail = Promise.resolve();
  }
  async atomic(fn) {
    let release;
    const previous = this.tail;
    this.tail = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await fn(); } finally { release(); }
  }
  async get(key) {
    const value = this.rows.get(String(key));
    return value ? structuredClone(value) : null;
  }
  async put(key, row) {
    this.rows.set(String(key), structuredClone(row));
  }
}

/**
 * Reconcile expired claims before retrying. An unknown result is quarantined.
 * An apply exception is retryable only when the adapter explicitly proves
 * that the remote side effect was not accepted (retryableNoEffect === true).
 */
export async function executeOutboxEffect(outbox, effectKey, adapter, now = Date.now()) {
  const claim = await outbox.claim(effectKey, now);
  if (claim.outcome !== 'CLAIMED') return claim.outcome;
  const token = claim.row.claimToken;
  try {
    if (claim.recovered) {
      const reconciliation = await adapter.reconcile(claim.row);
      if (reconciliation?.status === 'APPLIED') {
        await outbox.markSent(effectKey, token, now, reconciliation.providerReference ?? '');
        return 'RECOVERED_ALREADY_APPLIED';
      }
      if (reconciliation?.status !== 'NOT_APPLIED') {
        await outbox.review(effectKey, token, now, 'AMBIGUOUS_EXTERNAL_STATE');
        return 'MANUAL_REVIEW';
      }
    }
    const result = await adapter.apply(claim.row);
    await outbox.markSent(effectKey, token, now, result?.providerReference ?? '');
    return 'SENT';
  } catch (error) {
    if (error?.retryableNoEffect === true) {
      await outbox.retry(effectKey, token, now, error?.code ?? 'CONFIRMED_NOT_SENT');
      return 'RETRYABLE';
    }
    await outbox.review(effectKey, token, now, 'AMBIGUOUS_EXTERNAL_OUTCOME');
    return 'MANUAL_REVIEW';
  }
}
