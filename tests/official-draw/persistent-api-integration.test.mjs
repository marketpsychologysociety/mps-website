import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const adapterPath = path.join(here, 'persistent-local-sandbox-adapter.mjs');
const baseUrl = 'http://127.0.0.1:4179';
const operator = 'synthetic-token-operator-a';

async function waitForHealth(child) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Sandbox exited before becoming healthy: ' + child.exitCode);
    try {
      const response = await fetch(baseUrl + '/health');
      if (response.ok) return response.json();
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw new Error('Persistent sandbox did not become healthy.');
}
function startSandbox(directory, crashStage = '', faultStage = '', captureStderr = false) {
  const moduleUrl = pathToFileURL(adapterPath).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', 'import(' + JSON.stringify(moduleUrl) + ')'], {
    cwd: here,
    env: {
      ...process.env,
      MPS_DRAW_JOURNAL_DIR: directory,
      ...(crashStage ? { MPS_DRAW_CRASH_STAGE: crashStage } : { MPS_DRAW_CRASH_STAGE: '' }),
      ...(faultStage ? { MPS_DRAW_JOURNAL_FAULT_STAGE: faultStage } : { MPS_DRAW_JOURNAL_FAULT_STAGE: '' })
    },
    stdio: captureStderr ? ['ignore', 'ignore', 'pipe'] : 'ignore'
  });
  return child;
}
async function stopSandbox(child) {
  if (child.exitCode !== null) return child.exitCode;
  child.kill('SIGTERM');
  return await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(child.exitCode); }, 3000);
    child.once('exit', code => { clearTimeout(timer); resolve(code); });
  });
}
async function api(method, route, { body, key, version, token = operator } = {}) {
  const response = await fetch(baseUrl + route, {
    method,
    headers: {
      authorization: 'Bearer ' + token,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(key ? { 'idempotency-key': key } : {}),
      ...(version !== undefined ? { 'if-match': String(version) } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, body: await response.json() };
}
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-draw-api-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('HTTP draw state and idempotent operation survive a real process restart', async t => {
  const directory = await fixture(t);
  let child = startSandbox(directory);
  await waitForHealth(child);
  const seeded = await api('POST', '/__test/seed-draw', { body: {} });
  assert.equal(seeded.status, 201);
  const drawId = seeded.body.data.draw_id;
  const executed = await api('POST', '/api/v1/draws/' + drawId + '/execute', {
    body: {}, key: 'restart-idempotency-001', version: 1
  });
  assert.equal(executed.status, 202);
  assert.equal(executed.body.operation.state, 'COMPLETED');
  await stopSandbox(child);

  child = startSandbox(directory);
  await waitForHealth(child);
  t.after(() => stopSandbox(child));
  const status = await api('GET', '/api/v1/draws/' + drawId + '/status');
  assert.equal(status.status, 200);
  assert.equal(status.body.data.state, 'DRAWN_UNVERIFIED');
  assert.equal(status.body.data.version, 2);

  const replay = await api('POST', '/api/v1/draws/' + drawId + '/execute', {
    body: {}, key: 'restart-idempotency-001', version: 1
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.operation.replayed, true);
  const conflict = await api('POST', '/api/v1/draws/' + drawId + '/execute', {
    body: { changed: true }, key: 'restart-idempotency-001', version: 1
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, 'IDEMPOTENCY_CONFLICT');
});

test('crash after durable intent fails closed as RECONCILIATION_REQUIRED after restart', async t => {
  const directory = await fixture(t);
  let child = startSandbox(directory);
  await waitForHealth(child);
  const seeded = await api('POST', '/__test/seed-draw', { body: {} });
  assert.equal(seeded.status, 201);
  const drawId = seeded.body.data.draw_id;
  await stopSandbox(child);

  child = startSandbox(directory, 'after_intent');
  await waitForHealth(child);
  const crashExit = new Promise(resolve => child.once('exit', resolve));
  await assert.rejects(api('POST', '/api/v1/draws/' + drawId + '/execute', {
    body: {}, key: 'crash-after-intent-001', version: 1
  }));
  const crashCode = await crashExit;
  assert.equal(crashCode, 86);

  child = startSandbox(directory);
  await waitForHealth(child);
  t.after(() => stopSandbox(child));
  const status = await api('GET', '/api/v1/draws/' + drawId + '/status');
  assert.equal(status.status, 200);
  assert.equal(status.body.data.state, 'RECONCILIATION_REQUIRED');
  const retry = await api('POST', '/api/v1/draws/' + drawId + '/execute', {
    body: {}, key: 'crash-after-intent-001', version: 2
  });
  assert.equal(retry.status, 409);
  assert.equal(retry.body.error.code, 'RECONCILIATION_REQUIRED');
});


test('concurrent execute requests cannot create two transitions for one draw', async t => {
  const directory = await fixture(t);
  const child = startSandbox(directory);
  await waitForHealth(child);
  t.after(() => stopSandbox(child));
  const seeded = await api('POST', '/__test/seed-draw', { body: {} });
  assert.equal(seeded.status, 201);
  const drawId = seeded.body.data.draw_id;
  const results = await Promise.all([
    api('POST', '/api/v1/draws/' + drawId + '/execute', { body: {}, key: 'concurrent-a', version: 1 }),
    api('POST', '/api/v1/draws/' + drawId + '/execute', { body: {}, key: 'concurrent-b', version: 1 })
  ]);
  assert.equal(results.filter(item => item.status === 202).length, 1);
  assert.equal(results.filter(item => item.status === 409).length, 1);
  const status = await api('GET', '/api/v1/draws/' + drawId + '/status');
  assert.equal(status.body.data.state, 'DRAWN_UNVERIFIED');
  assert.equal(status.body.data.version, 2);
});


test('crash after in-memory state mutation but before completion remains fail-closed after restart', async t => {
  const directory = await fixture(t);
  let child = startSandbox(directory);
  await waitForHealth(child);
  const seeded = await api('POST', '/__test/seed-draw', { body: {} });
  assert.equal(seeded.status, 201);
  const drawId = seeded.body.data.draw_id;
  await stopSandbox(child);

  child = startSandbox(directory, 'after_state_mutation');
  await waitForHealth(child);
  const crashExit = new Promise(resolve => child.once('exit', resolve));
  await assert.rejects(api('POST', '/api/v1/draws/' + drawId + '/execute', {
    body: {}, key: 'crash-after-mutation-001', version: 1
  }));
  assert.equal(await crashExit, 87);

  child = startSandbox(directory);
  await waitForHealth(child);
  t.after(() => stopSandbox(child));
  const status = await api('GET', '/api/v1/draws/' + drawId + '/status');
  assert.equal(status.status, 200);
  assert.equal(status.body.data.state, 'RECONCILIATION_REQUIRED');
  const retry = await api('POST', '/api/v1/draws/' + drawId + '/execute', {
    body: {}, key: 'crash-after-mutation-001', version: 2
  });
  assert.equal(retry.status, 409);
  assert.equal(retry.body.error.code, 'RECONCILIATION_REQUIRED');
});


test('lost acknowledgement after completion fsync is recovered as completed, not rerun', async t => {
  const directory = await fixture(t);
  let child = startSandbox(directory);
  await waitForHealth(child);
  const seeded = await api('POST', '/__test/seed-draw', { body: {} });
  assert.equal(seeded.status, 201);
  const drawId = seeded.body.data.draw_id;
  await stopSandbox(child);

  child = startSandbox(directory, '', 'after_sync_before_ack');
  await waitForHealth(child);
  const uncertain = await api('POST', '/api/v1/draws/' + drawId + '/execute', {
    body: {}, key: 'lost-completion-ack-001', version: 1
  });
  assert.equal(uncertain.status, 503);
  assert.equal(uncertain.body.error.code, 'ACKNOWLEDGMENT_LOST');
  await stopSandbox(child);

  child = startSandbox(directory);
  await waitForHealth(child);
  t.after(() => stopSandbox(child));
  const status = await api('GET', '/api/v1/draws/' + drawId + '/status');
  assert.equal(status.status, 200);
  assert.equal(status.body.data.state, 'DRAWN_UNVERIFIED');
  assert.equal(status.body.data.version, 2);
  const replay = await api('POST', '/api/v1/draws/' + drawId + '/execute', {
    body: {}, key: 'lost-completion-ack-001', version: 1
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.operation.replayed, true);
});


test('a second sandbox process cannot acquire the same journal writer lease', async t => {
  const directory = await fixture(t);
  const first = startSandbox(directory);
  await waitForHealth(first);
  t.after(() => stopSandbox(first));

  const second = startSandbox(directory, '', '', true);
  let stderr = '';
  second.stderr.setEncoding('utf8');
  second.stderr.on('data', chunk => { stderr += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      second.kill('SIGKILL');
      reject(new Error('Second sandbox did not fail closed on the existing process lease.'));
    }, 4000);
    second.once('error', error => { clearTimeout(timer); reject(error); });
    second.once('exit', code => { clearTimeout(timer); resolve(code); });
  });
  assert.notEqual(exitCode, 0);
  assert.match(stderr, /JOURNAL_LOCKED/);
  const health = await fetch(baseUrl + '/health');
  assert.equal(health.status, 200);
});
