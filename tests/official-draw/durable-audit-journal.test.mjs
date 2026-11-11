import test from 'node:test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DurableAuditJournal } from './durable-audit-journal.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const workerPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'journal-lock-worker.mjs');
const input = extra => ({
  operationId: 'op_synthetic_001', idempotencyKey: 'idem_synthetic_001',
  actorSubject: 'subject_synthetic_operator_A', targetId: 'draw_synthetic_001',
  payloadDigest: digest('synthetic-payload'), ...(extra || {})
});
async function setup(t, options) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-journal-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const journal = await DurableAuditJournal.open(dir, options || {});
  t.after(() => journal.close().catch(() => {}));
  return { dir, journal };
}

test('intent and completion survive restart with hash-chain verification', async t => {
  const { dir, journal } = await setup(t);
  await journal.beginOperation(input());
  await journal.completeOperation({ operationId: 'op_synthetic_001', result: { state: 'DRAWN_UNVERIFIED', synthetic: true } });
  const stats = journal.getStats();
  await journal.close();
  const reopened = await DurableAuditJournal.open(dir);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.getStats(), stats);
  assert.equal(reopened.getOperation('op_synthetic_001').state, 'COMPLETED');
});

test('idempotency replay is safe and changed payload is rejected', async t => {
  const { journal } = await setup(t);
  assert.equal((await journal.beginOperation(input())).created, true);
  assert.equal((await journal.beginOperation(input({ operationId: 'op_retry' }))).created, false);
  await assert.rejects(journal.beginOperation(input({ operationId: 'op_changed', payloadDigest: digest('changed') })),
    error => error.code === 'IDEMPOTENCY_CONFLICT');
  assert.equal(journal.getStats().record_count, 1);
});

test('concurrent duplicate intents serialize to one durable operation', async t => {
  const { journal } = await setup(t);
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
    journal.beginOperation(input({ operationId: 'op_concurrent_' + i }))));
  assert.equal(results.filter(item => item.created).length, 1);
  assert.equal(journal.getStats().record_count, 1);
});

test('write-before-fsync ambiguity blocks writes and reconciles after reopen', async t => {
  const { dir } = await setup(t);
  let once = true;
  const journal = await DurableAuditJournal.open(dir, { faultInjector: stage => {
    if (stage === 'after_write_before_sync' && once) { once = false; return true; }
    return false;
  }});
  await assert.rejects(journal.beginOperation(input()), error => error.code === 'RECONCILIATION_REQUIRED');
  await assert.rejects(journal.beginOperation(input()), error => error.code === 'RECONCILIATION_REQUIRED');
  await journal.close();
  const recovered = await DurableAuditJournal.open(dir);
  t.after(() => recovered.close());
  assert.equal((await recovered.beginOperation(input({ operationId: 'op_retry' }))).created, false);
  assert.equal(recovered.getStats().operation_count, 1);
});

test('fsync-before-ack failure is recovered without duplicate intent', async t => {
  const { dir } = await setup(t);
  let once = true;
  const journal = await DurableAuditJournal.open(dir, { faultInjector: stage => {
    if (stage === 'after_sync_before_ack' && once) { once = false; return true; }
    return false;
  }});
  await assert.rejects(journal.beginOperation(input()), error => error.code === 'ACKNOWLEDGMENT_LOST');
  await journal.close();
  const recovered = await DurableAuditJournal.open(dir);
  t.after(() => recovered.close());
  assert.equal((await recovered.beginOperation(input({ operationId: 'op_retry' }))).created, false);
  assert.equal(recovered.getStats().record_count, 1);
});

test('partial trailing record is discarded but tampered complete record fails closed', async t => {
  const { dir, journal } = await setup(t);
  await journal.beginOperation(input());
  await journal.close();
  const file = path.join(dir, 'audit.journal.jsonl');
  await fs.appendFile(file, '{"seq":2,"partial":');
  const recovered = await DurableAuditJournal.open(dir);
  t.after(() => recovered.close());
  assert.equal(recovered.getStats().record_count, 1);
  await recovered.close();
  const rows = (await fs.readFile(file, 'utf8')).trimEnd().split('\n');
  const record = JSON.parse(rows[0]);
  record.actor_subject = 'subject_synthetic_attacker';
  rows[0] = JSON.stringify(record);
  await fs.writeFile(file, rows.join('\n') + '\n');
  await assert.rejects(DurableAuditJournal.open(dir), error => error.code === 'JOURNAL_INTEGRITY_ERROR');
});

test('unknown journal record fields fail closed on recovery', async t => {
  const { dir, journal } = await setup(t);
  await journal.beginOperation(input());
  await journal.close();
  const file = path.join(dir, 'audit.journal.jsonl');
  const rows = (await fs.readFile(file, 'utf8')).trimEnd().split('\n');
  const record = JSON.parse(rows[0]);
  record.unexpected_private_payload = 'SYNTHETIC_CANARY';
  rows[0] = JSON.stringify(record);
  await fs.writeFile(file, rows.join('\n') + '\n');
  await assert.rejects(DurableAuditJournal.open(dir), error => error.code === 'JOURNAL_INTEGRITY_ERROR');
});

test('completion requires intent and rejects private or unknown fields', async t => {
  const { journal } = await setup(t);
  await assert.rejects(journal.completeOperation({ operationId: 'missing', result: { state: 'DONE' } }),
    error => error.code === 'NOT_FOUND');
  await journal.beginOperation(input());
  await assert.rejects(journal.completeOperation({
    operationId: 'op_synthetic_001', result: { state: 'DONE', member_id: 'SYNTHETIC_PRIVATE_CANARY' }
  }), error => error.code === 'VALIDATION_ERROR');
  await journal.completeOperation({ operationId: 'op_synthetic_001', result: { state: 'DONE' } });
  assert.equal((await journal.completeOperation({ operationId: 'op_synthetic_001', result: { state: 'DONE' } })).created, false);
  assert.equal(journal.getStats().record_count, 2);
});


test('allowlisted aggregate state is replayable and unknown aggregate fields are rejected', async t => {
  const { dir, journal } = await setup(t);
  await journal.beginOperation(input());
  const aggregate = {
    kind: 'DRAW', entity_id: 'draw_synthetic_001', event_id: 'evt_synthetic_001',
    state: 'BEACON_COMMITTED', version: 1,
    owner_subject: 'subject_synthetic_operator_A', operation_count: 0
  };
  await assert.rejects(journal.completeOperation({
    operationId: 'op_synthetic_001',
    result: { state: 'SEEDED', synthetic: true, aggregate: { ...aggregate, raw_member_id: 'SYNTHETIC_PRIVATE_CANARY' } }
  }), error => error.code === 'VALIDATION_ERROR');
  await journal.completeOperation({
    operationId: 'op_synthetic_001',
    result: { state: 'SEEDED', synthetic: true, aggregate }
  });
  assert.equal(journal.getOperations()[0].result.aggregate.entity_id, 'draw_synthetic_001');
  await journal.close();
  const recovered = await DurableAuditJournal.open(dir);
  t.after(() => recovered.close());
  assert.equal(recovered.getOperations()[0].result.aggregate.state, 'BEACON_COMMITTED');
});


test('independent Node processes serialize journal appends without lost records', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-journal-multiprocess-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const runWorker = prefix => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, dir, prefix], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error('Journal worker failed: code=' + code + ' signal=' + signal));
    });
  });
  await Promise.all([runWorker('worker_a'), runWorker('worker_b')]);
  const recovered = await DurableAuditJournal.open(dir);
  t.after(() => recovered.close());
  assert.equal(recovered.getStats().operation_count, 20);
  assert.equal(recovered.getStats().record_count, 40);
  assert.equal(recovered.getOperations().filter(item => item.state === 'COMPLETED').length, 20);
});

test('exclusive server lease rejects a second writer process and releases cleanly', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-journal-server-lease-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const first = await DurableAuditJournal.open(dir, { exclusiveProcessLease: true, lockWaitMs: 25, lockRetryMs: 5 });
  await assert.rejects(
    DurableAuditJournal.open(dir, { exclusiveProcessLease: true, lockWaitMs: 35, lockRetryMs: 5 }),
    error => error.code === 'JOURNAL_LOCKED'
  );
  await first.close();
  const next = await DurableAuditJournal.open(dir, { exclusiveProcessLease: true, lockWaitMs: 100, lockRetryMs: 5 });
  await next.close();
});

test('dead same-host lock owner is atomically quarantined before recovery', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-journal-stale-lock-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const lockPath = path.join(dir, 'journal.lock');
  await fs.mkdir(lockPath, { mode: 0o700 });
  await fs.writeFile(path.join(lockPath, 'owner.json'), JSON.stringify({
    pid: 2147483647, hostname: os.hostname(), token: 'synthetic-dead-owner',
    started_at: new Date(0).toISOString()
  }), { mode: 0o600 });
  const journal = await DurableAuditJournal.open(dir, { lockWaitMs: 500, lockRetryMs: 5 });
  t.after(() => journal.close());
  assert.equal(journal.getStats().record_count, 0);
  await assert.rejects(fs.stat(lockPath), error => error.code === 'ENOENT');
});
