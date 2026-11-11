/**
 * MPS Official Draw — durable synthetic audit journal.
 * TEST ONLY: local filesystem, synthetic metadata, no production integration.
 * The journal is an append-only, fsync-backed hash chain. It is not an
 * externally anchored or tamper-proof production audit system.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const GENESIS = 'GENESIS';
const MAX_LINE_BYTES = 64 * 1024;
const HASH_RE = /^[a-f0-9]{64}$/;
const RESULT_FIELDS = new Set(['state', 'status', 'code', 'synthetic', 'result_digest', 'proof_digest']);
const RECORD_FIELDS = new Set(['seq', 'type', 'operation_id', 'idempotency_key', 'actor_subject', 'target_id', 'payload_digest', 'result', 'created_at', 'prev_hash', 'hash']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function journalError(code, message) {
  return Object.assign(new Error(message), { code });
}

function recordCore(record) {
  return {
    seq: record.seq,
    type: record.type,
    operation_id: record.operation_id,
    idempotency_key: record.idempotency_key,
    actor_subject: record.actor_subject,
    target_id: record.target_id,
    payload_digest: record.payload_digest,
    result: record.result ?? null,
    created_at: record.created_at,
    prev_hash: record.prev_hash
  };
}

function validateText(value, field, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw journalError('VALIDATION_ERROR', `${field} must be a non-empty bounded string.`);
  }
  return value;
}

function safeJson(value, field) {
  let encoded;
  try { encoded = JSON.stringify(value); }
  catch { throw journalError('VALIDATION_ERROR', `${field} must be JSON serializable.`); }
  if (encoded === undefined || Buffer.byteLength(encoded) > 8 * 1024) {
    throw journalError('VALIDATION_ERROR', `${field} is missing or exceeds 8 KiB.`);
  }
  const parsed = JSON.parse(encoded);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
    throw journalError('VALIDATION_ERROR', `${field} must be a non-empty JSON object.`);
  }
  for (const [key, item] of Object.entries(parsed)) {
    if (!RESULT_FIELDS.has(key) || !['string', 'number', 'boolean'].includes(typeof item) ||
        (typeof item === 'string' && item.length > 256) || (typeof item === 'number' && !Number.isFinite(item))) {
      throw journalError('VALIDATION_ERROR', `${field} contains an unsupported field or value.`);
    }
  }
  return parsed;
}

export class DurableAuditJournal {
  static async open(directory, options = {}) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory)) {
      throw journalError('VALIDATION_ERROR', 'Journal directory must be an absolute local path.');
    }
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const journal = new DurableAuditJournal(directory, options);
    await journal.#recover();
    return journal;
  }

  constructor(directory, { faultInjector = null } = {}) {
    this.directory = directory;
    this.filePath = path.join(directory, 'audit.journal.jsonl');
    this.faultInjector = faultInjector;
    this.records = [];
    this.operations = new Map();
    this.idempotency = new Map();
    this.lastHash = GENESIS;
    this.closed = false;
    this.needsReopen = false;
    this.tail = Promise.resolve();
  }

  #serial(work) {
    const result = this.tail.then(work);
    this.tail = result.catch(() => {});
    return result;
  }

  async #recover() {
    let bytes;
    try { bytes = await fs.readFile(this.filePath); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const handle = await fs.open(this.filePath, 'wx', 0o600);
      await handle.sync();
      await handle.close();
      const directoryHandle = await fs.open(this.directory, 'r');
      await directoryHandle.sync();
      await directoryHandle.close();
      return;
    }

    let completeLength = bytes.length;
    if (bytes.length && bytes[bytes.length - 1] !== 0x0a) {
      const lastNewline = bytes.lastIndexOf(0x0a);
      completeLength = lastNewline < 0 ? 0 : lastNewline + 1;
      const handle = await fs.open(this.filePath, 'r+');
      await handle.truncate(completeLength);
      await handle.sync();
      await handle.close();
    }

    const complete = bytes.subarray(0, completeLength).toString('utf8');
    if (!complete) return;
    const lines = complete.split('\n');
    lines.pop();
    for (const line of lines) {
      if (!line || Buffer.byteLength(line) > MAX_LINE_BYTES) {
        throw journalError('JOURNAL_INTEGRITY_ERROR', 'Journal contains an empty or oversized record.');
      }
      let record;
      try { record = JSON.parse(line); }
      catch { throw journalError('JOURNAL_INTEGRITY_ERROR', 'Journal contains malformed complete JSON.'); }
      this.#verifyAndApply(record);
    }
  }

  #verifyAndApply(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        Object.keys(record).length !== RECORD_FIELDS.size || Object.keys(record).some(key => !RECORD_FIELDS.has(key)) ||
        !Number.isSafeInteger(record.seq) || record.seq !== this.records.length + 1 ||
        !['INTENT', 'COMPLETION'].includes(record.type) ||
        typeof record.operation_id !== 'string' || typeof record.idempotency_key !== 'string' ||
        typeof record.actor_subject !== 'string' || typeof record.target_id !== 'string' ||
        !HASH_RE.test(record.payload_digest) || typeof record.created_at !== 'string' ||
        record.prev_hash !== this.lastHash || !HASH_RE.test(record.hash)) {
      throw journalError('JOURNAL_INTEGRITY_ERROR', 'Journal sequence or record schema is invalid.');
    }
    if (record.type === 'INTENT' && record.result !== null) {
      throw journalError('JOURNAL_INTEGRITY_ERROR', 'Intent records must not contain a result.');
    }
    if (record.type === 'COMPLETION') {
      try { safeJson(record.result, 'journal completion result'); }
      catch { throw journalError('JOURNAL_INTEGRITY_ERROR', 'Completion result violates the journal allowlist.'); }
    }
    const expected = sha256(JSON.stringify(recordCore(record)));
    if (expected !== record.hash) {
      throw journalError('JOURNAL_INTEGRITY_ERROR', `Journal hash mismatch at sequence ${record.seq}.`);
    }
    const existing = this.operations.get(record.operation_id);
    const scope = `${record.target_id}:${record.actor_subject}:${record.idempotency_key}`;
    if (record.type === 'INTENT') {
      if (existing || this.idempotency.has(scope)) {
        throw journalError('JOURNAL_INTEGRITY_ERROR', 'Duplicate operation or idempotency key in journal.');
      }
      this.operations.set(record.operation_id, { intent: record, completion: null });
      this.idempotency.set(scope, record.operation_id);
    } else {
      if (!existing || existing.completion || existing.intent.payload_digest !== record.payload_digest ||
          existing.intent.idempotency_key !== record.idempotency_key ||
          existing.intent.actor_subject !== record.actor_subject || existing.intent.target_id !== record.target_id) {
        throw journalError('JOURNAL_INTEGRITY_ERROR', 'Completion has no matching unique intent.');
      }
      existing.completion = record;
    }
    this.records.push(record);
    this.lastHash = record.hash;
  }

  async #append(type, source, result = null, failAt = null) {
    if (this.closed) throw journalError('JOURNAL_CLOSED', 'Journal is closed.');
    if (this.needsReopen) throw journalError('RECONCILIATION_REQUIRED', 'Journal outcome is uncertain; reopen and reconcile before further writes.');
    const core = {
      seq: this.records.length + 1,
      type,
      operation_id: source.operation_id,
      idempotency_key: source.idempotency_key,
      actor_subject: source.actor_subject,
      target_id: source.target_id,
      payload_digest: source.payload_digest,
      result,
      created_at: new Date().toISOString(),
      prev_hash: this.lastHash
    };
    const record = { ...core, hash: sha256(JSON.stringify(core)) };
    const line = JSON.stringify(record) + '\n';
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) throw journalError('VALIDATION_ERROR', 'Journal record is too large.');

    const inject = async stage => {
      if (failAt === stage || this.faultInjector?.(stage, record) === true) {
        throw journalError('INJECTED_FAILURE', `Synthetic fault injected at ${stage}.`);
      }
    };

    await inject('before_append');
    const handle = await fs.open(this.filePath, 'a');
    try {
      await handle.write(line);
      try { await inject('after_write_before_sync'); }
      catch (error) {
        this.needsReopen = true;
        throw journalError('RECONCILIATION_REQUIRED', `Append outcome is uncertain after write: ${error.message}`);
      }
      await handle.sync();
    } catch (error) {
      if (!this.needsReopen && error.code !== 'INJECTED_FAILURE') this.needsReopen = true;
      throw error;
    } finally {
      await handle.close();
    }

    this.#verifyAndApply(record);
    try { await inject('after_sync_before_ack'); }
    catch (error) {
      throw journalError('ACKNOWLEDGMENT_LOST', `Record is durable but acknowledgement was lost: ${error.message}`);
    }
    return record;
  }

  beginOperation({ operationId = `op_${randomUUID()}`, idempotencyKey, actorSubject, targetId, payloadDigest, failAt = null }) {
    return this.#serial(async () => {
      validateText(operationId, 'operationId');
      validateText(idempotencyKey, 'idempotencyKey', 128);
      validateText(actorSubject, 'actorSubject');
      validateText(targetId, 'targetId');
      if (typeof payloadDigest !== 'string' || !HASH_RE.test(payloadDigest)) {
        throw journalError('VALIDATION_ERROR', 'payloadDigest must be a lowercase SHA-256 hex digest.');
      }
      const scope = `${targetId}:${actorSubject}:${idempotencyKey}`;
      const existingId = this.idempotency.get(scope);
      if (existingId) {
        const prior = this.operations.get(existingId);
        if (prior.intent.payload_digest !== payloadDigest) {
          throw journalError('IDEMPOTENCY_CONFLICT', 'Idempotency key was reused with a different payload.');
        }
        return { created: false, operation: this.#publicOperation(prior) };
      }
      if (this.operations.has(operationId)) throw journalError('OPERATION_CONFLICT', 'Operation ID already exists.');
      const source = { operation_id: operationId, idempotency_key: idempotencyKey, actor_subject: actorSubject, target_id: targetId, payload_digest: payloadDigest };
      const record = await this.#append('INTENT', source, null, failAt);
      return { created: true, operation: this.#publicOperation(this.operations.get(record.operation_id)) };
    });
  }

  completeOperation({ operationId, result, failAt = null }) {
    return this.#serial(async () => {
      validateText(operationId, 'operationId');
      const current = this.operations.get(operationId);
      if (!current) throw journalError('NOT_FOUND', 'Operation intent does not exist.');
      if (current.completion) return { created: false, operation: this.#publicOperation(current) };
      const safeResult = safeJson(result, 'result');
      const source = current.intent;
      await this.#append('COMPLETION', source, safeResult, failAt);
      return { created: true, operation: this.#publicOperation(this.operations.get(operationId)) };
    });
  }

  #publicOperation(operation) {
    return {
      operation_id: operation.intent.operation_id,
      idempotency_key: operation.intent.idempotency_key,
      actor_subject: operation.intent.actor_subject,
      target_id: operation.intent.target_id,
      payload_digest: operation.intent.payload_digest,
      state: operation.completion ? 'COMPLETED' : 'INTENT_RECORDED',
      result: operation.completion?.result ?? null
    };
  }

  getOperation(operationId) {
    const operation = this.operations.get(operationId);
    return operation ? this.#publicOperation(operation) : null;
  }

  getStats() {
    return { record_count: this.records.length, operation_count: this.operations.size, last_hash: this.lastHash };
  }

  async close() {
    await this.tail;
    this.closed = true;
  }
}
