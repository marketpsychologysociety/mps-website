/**
 * P1.24 SQLite transactional persistence adapter.
 * TEST ONLY — local synthetic fixtures; no OIDC, external provider, or production DB.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { canonicalJson } from './isolated-acceptance-harness.mjs';

const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const validText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

export class SQLiteTransactionalStore {
  #db;
  #closed = false;

  constructor(filename) {
    if (!validText(filename, 4096) || filename === ':memory:' || !path.isAbsolute(filename)) throw new TypeError('ABSOLUTE_DATABASE_FILE_REQUIRED');
    this.#db = new DatabaseSync(filename);
    this.#db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS draw_records (
        draw_id TEXT PRIMARY KEY,
        owner_subject TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('BEACON_COMMITTED','DRAWN_UNVERIFIED','RECONCILIATION_REQUIRED')),
        version INTEGER NOT NULL CHECK (version >= 1),
        updated_at_utc TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS idempotency_operations (
        operation_id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        draw_id TEXT NOT NULL REFERENCES draw_records(draw_id),
        idempotency_key TEXT NOT NULL,
        request_digest TEXT NOT NULL CHECK (length(request_digest) = 64),
        result_json TEXT NOT NULL,
        created_at_utc TEXT NOT NULL,
        UNIQUE(subject, draw_id, idempotency_key)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS notification_outbox (
        outbox_id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL UNIQUE REFERENCES idempotency_operations(operation_id),
        event_type TEXT NOT NULL CHECK (event_type = 'DRAW_EXECUTED'),
        delivery_state TEXT NOT NULL CHECK (delivery_state IN ('PENDING','ATTEMPTING','DELIVERED','RETRY_WAIT','DEAD_LETTER')),
        created_at_utc TEXT NOT NULL
      ) STRICT;
    `);
  }

  #assertOpen() { if (this.#closed) throw new Error('STORE_CLOSED'); }

  seedDraw({ drawId, ownerSubject, state = 'BEACON_COMMITTED', version = 1 }) {
    this.#assertOpen();
    if (!validText(drawId, 128) || !validText(ownerSubject, 256) ||
        !['BEACON_COMMITTED','DRAWN_UNVERIFIED','RECONCILIATION_REQUIRED'].includes(state) ||
        !Number.isSafeInteger(version) || version < 1) throw new TypeError('INVALID_SEED');
    this.#db.prepare("INSERT INTO draw_records(draw_id,owner_subject,state,version,updated_at_utc) VALUES(?,?,?,?,?)")
      .run(drawId, ownerSubject, state, version, new Date().toISOString());
  }

  execute({ drawId, subject, key, payload, expectedVersion, fault = '' }) {
    this.#assertOpen();
    if (!validText(drawId,128) || !validText(subject,256) || !validText(key,128) ||
        !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return { status:400, code:'INVALID_REQUEST' };
    let requestCanonical;
    try { requestCanonical = canonicalJson({ drawId, subject, expectedVersion, payload }); }
    catch { return { status:400, code:'INVALID_PAYLOAD' }; }
    const digest = sha256(requestCanonical);
    const now = new Date().toISOString();
    const operationId = 'op_' + sha256(JSON.stringify([subject,drawId,key])).slice(0,32);
    const outboxId = 'out_' + operationId.slice(3);

    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.#db.prepare("SELECT request_digest,result_json FROM idempotency_operations WHERE subject=? AND draw_id=? AND idempotency_key=?")
        .get(subject,drawId,key);
      if (previous) {
        this.#db.exec('COMMIT');
        if (previous.request_digest !== digest) return { status:409, code:'IDEMPOTENCY_CONFLICT' };
        return { status:200, replayed:true, result:JSON.parse(previous.result_json) };
      }
      const draw = this.#db.prepare("SELECT draw_id,owner_subject,state,version FROM draw_records WHERE draw_id=?").get(drawId);
      if (!draw || draw.owner_subject !== subject) {
        this.#db.exec('ROLLBACK');
        return { status:404, code:'NOT_FOUND' };
      }
      if (draw.version !== expectedVersion) {
        this.#db.exec('ROLLBACK');
        return { status:412, code:'VERSION_MISMATCH' };
      }
      if (draw.state !== 'BEACON_COMMITTED') {
        this.#db.exec('ROLLBACK');
        return { status:409, code:'INVALID_STATE' };
      }
      if (fault === 'before_commit') {
        this.#db.exec('ROLLBACK');
        return { status:503, code:'TRANSACTION_ABORTED' };
      }
      const result = { draw_id:drawId, state:'DRAWN_UNVERIFIED', version:draw.version + 1 };
      this.#db.prepare("UPDATE draw_records SET state='DRAWN_UNVERIFIED',version=?,updated_at_utc=? WHERE draw_id=? AND version=?")
        .run(result.version,now,drawId,expectedVersion);
      this.#db.prepare("INSERT INTO idempotency_operations(operation_id,subject,draw_id,idempotency_key,request_digest,result_json,created_at_utc) VALUES(?,?,?,?,?,?,?)")
        .run(operationId,subject,drawId,key,digest,JSON.stringify(result),now);
      this.#db.prepare("INSERT INTO notification_outbox(outbox_id,operation_id,event_type,delivery_state,created_at_utc) VALUES(?,?,'DRAW_EXECUTED','PENDING',?)")
        .run(outboxId,operationId,now);

      // P1.25 fault points are reachable only through the isolated child-process test worker.
      // process.exit() deliberately skips JS cleanup so SQLite must recover the open transaction.
      if (fault === 'crash_before_commit') process.exit(86);
      this.#db.exec('COMMIT');
      if (fault === 'crash_after_commit_before_ack') process.exit(87);
      if (fault === 'after_commit_before_ack') return { status:503, code:'ACKNOWLEDGMENT_LOST' };
      return { status:202, replayed:false, result };
    } catch (error) {
      try { this.#db.exec('ROLLBACK'); } catch {}
      if (String(error?.message || '').includes('UNIQUE constraint failed')) return { status:409, code:'IDEMPOTENCY_CONFLICT' };
      throw error;
    }
  }

  readDraw(drawId) {
    this.#assertOpen();
    const row=this.#db.prepare('SELECT draw_id,owner_subject,state,version FROM draw_records WHERE draw_id=?').get(drawId);
    return row ? { drawId:row.draw_id, ownerSubject:row.owner_subject, state:row.state, version:row.version } : null;
  }

  operationCount() { this.#assertOpen(); return this.#db.prepare('SELECT COUNT(*) AS n FROM idempotency_operations').get().n; }
  outboxRows() { this.#assertOpen(); return this.#db.prepare('SELECT event_type,delivery_state FROM notification_outbox ORDER BY created_at_utc,outbox_id').all().map(row => ({ event_type:row.event_type, delivery_state:row.delivery_state })); }
  close() { if (!this.#closed) { this.#db.close(); this.#closed=true; } }
}
