import { createHash } from 'node:crypto';

const STATES = new Set(['RECEIVED', 'PROCESSING', 'RETRYABLE', 'DONE', 'REVIEW']);

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validUpdateId(value) {
  return /^(0|[1-9]\d{0,19})$/.test(String(value ?? ''));
}

/**
 * Contract-level state machine. The supplied store MUST implement atomic(fn)
 * across all workers and durable get/put operations. Tests use a shared fake
 * store; production GAS must provide an independently validated adapter.
 */
export class DurableUpdateJournal {
  constructor(store, { leaseMs = 600_000 } = {}) {
    if (!store || typeof store.atomic !== 'function' ||
        typeof store.get !== 'function' || typeof store.put !== 'function') {
      throw new TypeError('A durable atomic store is required');
    }
    this.store = store;
    this.leaseMs = leaseMs;
  }

  async claim(update, now = Date.now()) {
    const id = String(update?.update_id ?? '');
    if (!validUpdateId(id)) throw new TypeError('INVALID_UPDATE_ID');
    const payloadHash = digest(update);
    return this.store.atomic(async () => {
      const existing = await this.store.get(id);
      if (existing?.state === 'DONE') return { outcome: 'DUPLICATE_DONE' };
      if (existing?.state === 'REVIEW') return { outcome: 'MANUAL_REVIEW' };
      if (existing?.state === 'PROCESSING' && existing.leaseExpiresAt > now) {
        return { outcome: 'BUSY' };
      }
      const recovered = Boolean(existing && (
        existing.state === 'PROCESSING' || existing.state === 'RETRYABLE'
      ));
      const row = {
        updateId: id,
        updateType: classify(update),
        payloadHash,
        state: 'PROCESSING',
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastAttemptAt: now,
        attemptCount: (existing?.attemptCount ?? 0) + 1,
        leaseExpiresAt: now + this.leaseMs,
        completedAt: null,
        effectKeys: existing?.effectKeys ?? [],
        lastErrorCode: null
      };
      if (!STATES.has(row.state)) throw new Error('INVALID_STATE');
      await this.store.put(id, row);
      return { outcome: 'CLAIMED', recovered, row: structuredClone(row) };
    });
  }

  async finish(id, now = Date.now(), effectKeys = []) {
    return this.#transition(id, now, row => ({
      ...row, state: 'DONE', completedAt: now, leaseExpiresAt: 0,
      effectKeys: [...new Set([...(row.effectKeys ?? []), ...effectKeys])].slice(-20),
      lastErrorCode: null
    }));
  }

  async retry(id, now = Date.now(), errorCode = 'TRANSIENT') {
    return this.#transition(id, now, row => ({
      ...row, state: 'RETRYABLE', leaseExpiresAt: 0,
      lastErrorCode: sanitizeCode(errorCode)
    }));
  }

  async review(id, now = Date.now(), errorCode = 'AMBIGUOUS') {
    return this.#transition(id, now, row => ({
      ...row, state: 'REVIEW', leaseExpiresAt: 0,
      lastErrorCode: sanitizeCode(errorCode)
    }));
  }

  async #transition(id, now, transform) {
    return this.store.atomic(async () => {
      const row = await this.store.get(String(id));
      if (!row || row.state !== 'PROCESSING') throw new Error('NOT_PROCESSING');
      const next = transform(row);
      if (!STATES.has(next.state)) throw new Error('INVALID_STATE');
      await this.store.put(String(id), next);
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
  try {
    if (claim.recovered) {
      const reconciliation = await handler.reconcile(update, claim.row);
      if (reconciliation === 'APPLIED') {
        await journal.finish(update.update_id, now, handler.effectKeys ?? []);
        return 'RECOVERED_ALREADY_APPLIED';
      }
      if (reconciliation !== 'NOT_APPLIED') {
        await journal.review(update.update_id, now, 'AMBIGUOUS_EXTERNAL_STATE');
        return 'MANUAL_REVIEW';
      }
    }
    await handler.apply(update, claim.row);
    await journal.finish(update.update_id, now, handler.effectKeys ?? []);
    return 'PROCESSED';
  } catch (error) {
    if (error?.ambiguousExternalOutcome) {
      await journal.review(update.update_id, now, 'AMBIGUOUS_EXTERNAL_OUTCOME');
      return 'MANUAL_REVIEW';
    }
    await journal.retry(update.update_id, now, error?.code ?? 'HANDLER_FAILED');
    throw error;
  }
}
