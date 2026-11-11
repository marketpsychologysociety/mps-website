import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SQLiteTransactionalStore } from './sqlite-transactional-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.join(here, 'sqlite-contention-worker.mjs');
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mps-p125-sqlite-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'draw.sqlite');
  const store = new SQLiteTransactionalStore(file);
  store.seedDraw({ drawId: 'draw-p125', ownerSubject: 'operator-p125' });
  store.close();
  return { dir, file };
}
function launch(input) {
  const child = spawn(process.execPath, [worker], {
    env: { ...process.env, MPS_SQLITE_WORKER_INPUT: JSON.stringify(input) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '', stderr = '', readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  child.stdout.setEncoding('utf8').on('data', chunk => {
    stdout += chunk;
    if (stdout.includes('READY\n')) readyResolve();
  });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const done = new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr })));
  return { child, ready, done };
}
async function runPair(t, reqA, reqB) {
  const { dir, file } = await fixture(t);
  const gate = path.join(dir, 'release-gate');
  const a = launch({ file, waitForGate: gate, request: reqA });
  const b = launch({ file, waitForGate: gate, request: reqB });
  await Promise.all([a.ready, b.ready]);
  await writeFile(gate, 'go');
  const results = await Promise.all([a.done, b.done]);
  for (const r of results) assert.equal(r.code, 0, r.stderr);
  return { file, outputs: results.map(r => JSON.parse(r.stdout.trim().split('\n').at(-1))) };
}
function inspect(file) {
  const store = new SQLiteTransactionalStore(file);
  const state = { draw: store.readDraw('draw-p125'), operations: store.operationCount(), outbox: store.outboxRows() };
  store.close();
  return state;
}
const base = { drawId: 'draw-p125', subject: 'operator-p125', expectedVersion: 1 };

test('two independent processes with different keys serialize to exactly one version transition', async t => {
  const { file, outputs } = await runPair(t,
    { ...base, key: 'key-a', payload: { command: 'execute' } },
    { ...base, key: 'key-b', payload: { command: 'execute' } });
  assert.deepEqual(outputs.map(x => x.status).sort(), [202, 412]);
  const s = inspect(file);
  assert.equal(s.draw.version, 2);
  assert.equal(s.draw.state, 'DRAWN_UNVERIFIED');
  assert.equal(s.operations, 1);
  assert.equal(s.outbox.length, 1);
});

test('two independent processes using the same idempotency request produce one effect and one replay', async t => {
  const req = { ...base, key: 'same-key', payload: { stable: true } };
  const { file, outputs } = await runPair(t, req, req);
  assert.deepEqual(outputs.map(x => x.status).sort(), [200, 202]);
  assert.equal(outputs.filter(x => x.replayed === true).length, 1);
  const s = inspect(file);
  assert.equal(s.draw.version, 2);
  assert.equal(s.operations, 1);
  assert.equal(s.outbox.length, 1);
});

test('same idempotency key with conflicting payload across processes cannot duplicate the effect', async t => {
  const { file, outputs } = await runPair(t,
    { ...base, key: 'conflict-key', payload: { value: 'A' } },
    { ...base, key: 'conflict-key', payload: { value: 'B' } });
  assert.deepEqual(outputs.map(x => x.status).sort(), [202, 409]);
  const s = inspect(file);
  assert.equal(s.draw.version, 2);
  assert.equal(s.operations, 1);
  assert.equal(s.outbox.length, 1);
});

test('child process exit before COMMIT recovers to the complete pre-transaction state', async t => {
  const { file } = await fixture(t);
  const crashed = launch({ file, request: { ...base, key: 'crash-before', payload: {}, fault: 'crash_before_commit' } });
  const result = await crashed.done;
  assert.equal(result.code, 86, result.stderr);
  const afterCrash = inspect(file);
  assert.equal(afterCrash.draw.version, 1);
  assert.equal(afterCrash.draw.state, 'BEACON_COMMITTED');
  assert.equal(afterCrash.operations, 0);
  assert.equal(afterCrash.outbox.length, 0);
  const retry = new SQLiteTransactionalStore(file);
  assert.equal(retry.execute({ ...base, key: 'crash-before', payload: {} }).status, 202);
  retry.close();
  assert.equal(inspect(file).operations, 1);
});

test('child process exit after COMMIT but before response preserves one effect and replay', async t => {
  const { file } = await fixture(t);
  const request = { ...base, key: 'crash-after', payload: { durable: true }, fault: 'crash_after_commit_before_ack' };
  const crashed = launch({ file, request });
  const result = await crashed.done;
  assert.equal(result.code, 87, result.stderr);
  const afterCrash = inspect(file);
  assert.equal(afterCrash.draw.version, 2);
  assert.equal(afterCrash.draw.state, 'DRAWN_UNVERIFIED');
  assert.equal(afterCrash.operations, 1);
  assert.equal(afterCrash.outbox.length, 1);
  const retry = new SQLiteTransactionalStore(file);
  const replay = retry.execute({ ...request, fault: '' });
  assert.equal(replay.status, 200);
  assert.equal(replay.replayed, true);
  retry.close();
  const final = inspect(file);
  assert.equal(final.draw.version, 2);
  assert.equal(final.operations, 1);
  assert.equal(final.outbox.length, 1);
});
