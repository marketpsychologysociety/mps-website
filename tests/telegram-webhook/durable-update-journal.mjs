import { createHash, randomUUID } from 'node:crypto';

const STATES = new Set(['RECEIVED', 'PROCESSING', 'RETRYABLE', 'DONE', 'REVIEW']);

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validUpdateId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0;
  return typeof value === 'string' && /^(0|[1-9]\\d{0,19})$/.test(value);
}

/**
 * Contract-level state machine. The supplied store MUST implement atomic(fn)
 * across all workers and durable get/put operations. Tests use a shared fake
 * store; production GAS must provide an independently validated adapter.
 */
export class DurableUpdateJournal {
  constructor(store, { leaseMs = 600_000, tokenFactory = randomUUID } = {}) {
    if (!store || typeof store.atomic !== 'function' ||
        typeof store.get !== 'function' || typeof store.put !== 'function') {
      throw new TypeError('A durable atomic store is required');
    }
    this.store = store;
    this.leaseMs = leaseMs;
    this.tokenFactory = tokenFactory;
  }

  async claim(update, now = Date.now()) {
    const rawId = update?.update_id;
    if (!validUpdateId(rawId)) throw new TypeError('INVALID_UPDATE_ID');
    const id = String(rawId);
    const payloadHash = digest(update);
    return this.store.atomic(async () => {
      const existing = await this.store.get(id);
      if (existing && existing.payloadHash !== payloadHash) {
        const quarantined = {
          ...existing, state: 'REVIEW', leaseExpiresAt: 0,
          claimToken: null, lastErrorCode: 'PAYLOAD_HASH_MISMATCH'
        };
        await this.store.put(id, quarantined);
        return { outcome: 'MANUAL_REVIEW' };
      }
      if (existing?.state === 'DONE') return { outcome: 'DUPLICATE_DONE' };
      if (existing?.state === 'REVIEW') return { outcome: 'MANUAL_REVIEW' };
      if (existing?.state === 'PROCESSING' && existing.leaseExpiresAt > now) {
        return { outcome: 'BUSY' };
      }
      const recovered = Boolean(existing && (
        existing.state === 'PROCESSING' || existing.state === 'RETRYABLE'
      ));
      const claimToken = this.tokenFactory();
      const row = {
        updateId: id,
        updateType: classify(update),
        payloadHash,
        state: 'PROCESSING',
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastAttemptAt: now,
        attemptCount: (existing?.attemptCount ?? 0) + 1,
        leaseExpiresAt: now + this.leaseMs,
        claimToken,
        completedAt: null,
        effectKeys: existing?.effectKeys ?? [],
        lastErrorCode: null
      };
      if (!STATES.has(row.state)) throw new Error('INVALID_STATE');
      await this.store.put(id, row);
      return { outcome: 'CLAIMED', recovered, row: structuredClone(row) };
    });
  }

  async finish(id, claimToken, now = Date.now(), effectKeys = []) {
    return this.#transition(id, claimToken, now, row => ({
      ...row, state: 'DONE', completedAt: now, leaseExpiresAt: 0,
      claimToken: null,
      effectKeys: [...new Set([...(row.effectKeys ?? []), ...effectKeys])].slice(-20),
      lastErrorCode: null
    }));
  }

  async retry(id, claimToken, now = Date.now(), errorCode = 'TRANSIENT') {
    return this.#transition(id, claimToken, now, row => ({
      ...row, state: 'RETRYABLE', leaseExpiresAt: 0, claimToken: null,
      lastErrorCode: sanitizeCode(errorCode)
    }));
  }

  async review(id, claimToken, now = Date.now(), errorCode = 'AMBIGUOUS') {
    return this.#transition(id, claimToken, now, row => ({
      ...row, state: 'REVIEW', leaseExpiresAt: 0, claimToken: null,
      lastErrorCode: sanitizeCode(errorCode)
    }));
  }

  async #transition(id, claimToken, now, transform) {
    return this.store.atomic(async () => {
      const key = String(id);
      const row = await this.store.get(key);
      if (!row || row.state !== 'PROCESSING' || !claimToken ||
          row.claimToken !== claimToken || row.leaseExpiresAt <= now) {
        throw new Error('STALE_OR_INVALID_CLAIM');
      }
      const next = transform(row);
      if (!STATES.has(next.state)) throw new Error('INVALID_STATE');
      await this.store.put(key, next);
      return structuredClone(next);
    });
  }
}

function classify(update) {
  if (update.chat_join_request) return 'CHAT_JOIN_REQUEST';
  if (update.chat_member) return 'CHAT_MEMBER';
  if (update.my_chat_member) return 'BOT_CHAT_MEMBER';
  if (update.message) return 'MESSAGE';
  return 'OTHER';
}

function sanitizeCode(code) {
  const value = String(code ?? '').toUpperCase();
  return /^[A-Z0-9_]{1,40}$/.test(value) ? value : 'UNCLASSIFIED';
}

/** Test-only durable adapter shared between journal instances (restart simulation). */
export class SharedMemoryJournalStore {
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
  async get(id) {
    const value = this.rows.get(String(id));
    return value ? structuredClone(value) : null;
  }
  async put(id, row) {
    this.rows.set(String(id), structuredClone(row));
  }
}

export async function executeWithReconciliation(journal, update, handler, now = Date.now()) {
  const claim = await journal.claim(update, now);
  if (claim.outcome !== 'CLAIMED') return claim.outcome;
  const id = update.update_id;
  const token = claim.row.claimToken;
  try {
    if (claim.recovered) {
      const reconciliation = await handler.reconcile(update, claim.row);
      if (reconciliation === 'APPLIED') {
        await journal.finish(id, token, now, handler.effectKeys ?? []);
        return 'RECOVERED_ALREADY_APPLIED';
      }
      if (reconciliation !== 'NOT_APPLIED') {
        await journal.review(id, token, now, 'AMBIGUOUS_EXTERNAL_STATE');
        return 'MANUAL_REVIEW';
      }
    }
    await handler.apply(update, claim.row);
    await journal.finish(id, token, now, handler.effectKeys ?? []);
    return 'PROCESSED';
  } catch (error) {
    if (error?.ambiguousExternalOutcome) {
      await journal.review(id, token, now, 'AMBIGUOUS_EXTERNAL_OUTCOME');
      return 'MANUAL_REVIEW';
    }
    await journal.retry(id, token, now, error?.code ?? 'HANDLER_FAILED');
    throw error;
  }
}
