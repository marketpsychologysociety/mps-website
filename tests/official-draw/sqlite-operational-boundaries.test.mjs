import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.join(here, 'sqlite-boundary-worker.mjs');

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mps-p126-sqlite-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'boundary.sqlite');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE sample(id INTEGER PRIMARY KEY, value INTEGER NOT NULL) STRICT; INSERT INTO sample VALUES(1,1);');
  db.close();
  return { dir, file };
}
function launch(input) {
  const child = spawn(process.execPath, [worker], {
    env: { ...process.env, MPS_SQLITE_BOUNDARY_INPUT: JSON.stringify(input) },
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
async function inspect(file) {
  const db = new DatabaseSync(file);
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get();
    return { integrity: Object.values(integrity)[0], value: db.prepare('SELECT value FROM sample WHERE id=1').get().value };
  } finally { db.close(); }
}
function checkpoint(db, mode='TRUNCATE') {
  return db.prepare('PRAGMA wal_checkpoint('+mode+')').get();
}

test('BEGIN IMMEDIATE lock contention times out safely and succeeds after lock release', async t => {
  const { dir, file } = await fixture(t);
  const gate = path.join(dir, 'release-lock');
  const holder = launch({ file, mode: 'hold-write-lock', releaseGate: gate });
  await holder.ready;
  const contender = new DatabaseSync(file);
  contender.exec('PRAGMA busy_timeout=100');
  const started = Date.now();
  assert.throws(() => contender.exec('BEGIN IMMEDIATE'), /busy|locked/i);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 70 && elapsed < 3000, 'busy_timeout should bound lock wait');
  contender.close();
  await writeFile(gate, 'release');
  const held = await holder.done;
  assert.equal(held.code, 0, held.stderr);
  const retry = new DatabaseSync(file);
  retry.exec('PRAGMA busy_timeout=1000; BEGIN IMMEDIATE; COMMIT;');
  retry.close();
  assert.equal((await inspect(file)).integrity, 'ok');
});

test('WAL reader retains a consistent snapshot while another process commits a write', async t => {
  const { dir, file } = await fixture(t);
  const gate = path.join(dir, 'release-reader');
  const reader = launch({ file, mode: 'reader-snapshot', releaseGate: gate });
  await reader.ready;
  const writer = new DatabaseSync(file);
  writer.exec('PRAGMA busy_timeout=1000; BEGIN IMMEDIATE; UPDATE sample SET value=2 WHERE id=1; COMMIT;');
  assert.equal(writer.prepare('SELECT value FROM sample WHERE id=1').get().value, 2);
  const blockedCheckpoint = checkpoint(writer);
  assert.equal(blockedCheckpoint.busy, 1);
  await writeFile(gate, 'release');
  const result = await reader.done;
  assert.equal(result.code, 0, result.stderr);
  const snapshot = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.deepEqual(snapshot, { before: 1, during: 1, after: 2 });
  const completedCheckpoint = checkpoint(writer);
  assert.equal(completedCheckpoint.busy, 0);
  writer.close();
  assert.deepEqual(await inspect(file), { integrity: 'ok', value: 2 });
});

test('VACUUM INTO backup captures committed WAL data and restores an integrity-checked snapshot', async t => {
  const { dir, file } = await fixture(t);
  const source = new DatabaseSync(file);
  source.exec('UPDATE sample SET value=7 WHERE id=1;');
  const walPath = file + '-wal';
  assert.ok((await stat(walPath)).size > 0, 'committed data should still be represented in WAL before checkpoint');
  const backup = path.join(dir, 'snapshot.sqlite');
  const escaped = backup.replaceAll("'", "''");
  source.exec("VACUUM INTO '"+escaped+"'");
  const snapshot = await inspect(backup);
  assert.deepEqual(snapshot, { integrity: 'ok', value: 7 });
  assert.deepEqual(await inspect(file), { integrity: 'ok', value: 7 });
  source.close();
});

test('VACUUM INTO refuses an existing destination and preserves its bytes', async t => {
  const { dir, file } = await fixture(t);
  const source = new DatabaseSync(file);
  const destination = path.join(dir, 'already-exists.sqlite');
  await writeFile(destination, 'do-not-overwrite');
  assert.throws(() => source.exec("VACUUM INTO '"+destination.replaceAll("'", "''")+"'"));
  assert.equal(await readFile(destination, 'utf8'), 'do-not-overwrite');
  source.close();
});

test('PASSIVE checkpoint reports a complete database and integrity remains valid', async t => {
  const { file } = await fixture(t);
  const db = new DatabaseSync(file);
  for (let i=2;i<=25;i++) db.prepare('INSERT INTO sample(id,value) VALUES(?,?)').run(i,i);
  const result = checkpoint(db, 'PASSIVE');
  assert.equal(result.busy, 0);
  assert.ok(result.checkpointed <= result.log);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  db.close();
});
