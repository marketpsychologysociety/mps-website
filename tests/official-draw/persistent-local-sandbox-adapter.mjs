/**
 * Persistent MPS Draw API sandbox — TEST ONLY.
 * Loopback-only, synthetic actors/data, local single-process JSONL journal.
 * Not OIDC, not multi-process safe, not production suitable.
 */
import http from 'node:http';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableAuditJournal } from './durable-audit-journal.mjs';

const HOST = '127.0.0.1';
const PORT = 4179;
const MAX_BODY = 16 * 1024;
const journalDir = process.env.MPS_DRAW_JOURNAL_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'mps-draw-persistent-'));
if (!path.isAbsolute(journalDir)) throw new Error('MPS_DRAW_JOURNAL_DIR must be an absolute path.');
const actors = Object.freeze({
  operatorA: Object.freeze({ token: 'synthetic-token-operator-a', issuer: 'https://issuer.test.invalid/', subject: 'subject_synthetic_operator_A', roles: ['DRAW_OPERATOR'] }),
  reviewerB: Object.freeze({ token: 'synthetic-token-reviewer-b', issuer: 'https://issuer.test.invalid/', subject: 'subject_synthetic_reviewer_B', roles: ['DRAW_REVIEWER'] }),
  reviewerSameSubjectAsA: Object.freeze({ token: 'synthetic-token-second-session-same-subject', issuer: 'https://issuer.test.invalid/', subject: 'subject_synthetic_operator_A', roles: ['DRAW_REVIEWER'] }),
  publisherC: Object.freeze({ token: 'synthetic-token-publisher-c', issuer: 'https://issuer.test.invalid/', subject: 'subject_synthetic_publisher_C', roles: ['DRAW_PUBLISHER'] }),
  auditorD: Object.freeze({ token: 'synthetic-token-auditor-d', issuer: 'https://issuer.test.invalid/', subject: 'subject_synthetic_auditor_D', roles: ['DRAW_AUDITOR'] })
});
const tokenMap = new Map(Object.values(actors).map(actor => [actor.token, actor]));
const sha = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const journalFaultStage = process.env.MPS_DRAW_JOURNAL_FAULT_STAGE || '';
let journal = await DurableAuditJournal.open(journalDir, {
  faultInjector: (stage, record) => Boolean(
    journalFaultStage && stage === journalFaultStage &&
    record.type === 'COMPLETION' && !record.idempotency_key.startsWith('fixture:')
  )
});
const draws = new Map();
const busyDraws = new Set();

function applyAggregate(aggregate) {
  if (!aggregate || aggregate.kind !== 'DRAW') return;
  draws.set(aggregate.entity_id, {
    draw_id: aggregate.entity_id,
    event_id: aggregate.event_id,
    state: aggregate.state,
    version: aggregate.version,
    owner_subject: aggregate.owner_subject,
    operation_count: aggregate.operation_count || 0
  });
}
function restoreState() {
  draws.clear();
  const operations = journal.getOperations();
  for (const operation of operations) {
    if (operation.state === 'COMPLETED' && operation.result?.aggregate) applyAggregate(operation.result.aggregate);
  }
  for (const operation of operations) {
    if (operation.state === 'INTENT_RECORDED' && draws.has(operation.target_id)) {
      const draw = draws.get(operation.target_id);
      draw.state = 'RECONCILIATION_REQUIRED';
      draw.version++;
    }
  }
}
restoreState();

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer'
  });
  res.end(JSON.stringify(body));
}
function fail(res, status, code, message) {
  return json(res, status, { ok: false, error: { code, message, retryable: false } });
}
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw Object.assign(new Error('JSON required'), { status: 415 });
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}
function actorFor(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  for (const [known, actor] of tokenMap) if (equal(token, known)) return actor;
  return null;
}
function publicDraw(draw) {
  return { draw_id: draw.draw_id, event_id: draw.event_id, state: draw.state, version: draw.version };
}
function aggregateFor(draw) {
  return {
    kind: 'DRAW', entity_id: draw.draw_id, event_id: draw.event_id,
    state: draw.state, version: draw.version, owner_subject: draw.owner_subject,
    operation_count: draw.operation_count
  };
}
const server = http.createServer(async (req, res) => {
  const requestId = 'req_' + randomUUID();
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, data: { service: 'mps-draw-persistent-sandbox', mode: 'TEST_ONLY', journal: journal.getStats() }, request_id: requestId });
  }
  const actor = actorFor(req);
  if (!actor) return fail(res, 401, 'UNAUTHENTICATED', 'Valid synthetic sandbox session required.');
  if (req.method === 'GET' && url.pathname === '/api/v1/session') {
    return json(res, 200, { ok: true, data: { roles: actor.roles }, request_id: requestId });
  }
  let body;
  try { body = await readBody(req); }
  catch (error) { return fail(res, error.status || 400, 'VALIDATION_ERROR', error.message); }

  if (req.method === 'POST' && url.pathname === '/__test/seed-draw') {
    if (!actor.roles.includes('DRAW_OPERATOR')) return fail(res, 403, 'FORBIDDEN', 'Operator role required.');
    if (Object.keys(body).length) return fail(res, 400, 'VALIDATION_ERROR', 'Fixture route accepts no caller fields.');
    const draw = {
      draw_id: 'draw_' + randomUUID(), event_id: 'evt_' + randomUUID(),
      state: 'BEACON_COMMITTED', version: 1, owner_subject: actor.subject, operation_count: 0
    };
    const payloadDigest = sha(JSON.stringify({ fixture: 'synthetic-draw', draw_id: draw.draw_id }));
    try {
      const intent = await journal.beginOperation({
        idempotencyKey: 'fixture:' + draw.draw_id, actorSubject: actor.subject,
        targetId: draw.draw_id, payloadDigest
      });
      await journal.completeOperation({
        operationId: intent.operation.operation_id,
        result: { state: 'SEEDED', synthetic: true, aggregate: aggregateFor(draw) }
      });
      applyAggregate(aggregateFor(draw));
      return json(res, 201, { ok: true, data: publicDraw(draw), request_id: requestId });
    } catch (error) {
      return fail(res, 503, error.code || 'PERSISTENCE_ERROR', 'Synthetic fixture could not be durably recorded.');
    }
  }

  const statusMatch = url.pathname.match(/^\/api\/v1\/draws\/([^/]+)\/status$/);
  if (req.method === 'GET' && statusMatch) {
    const draw = draws.get(decodeURIComponent(statusMatch[1]));
    if (!draw || (!actor.roles.some(role => ['DRAW_OPERATOR', 'DRAW_REVIEWER', 'DRAW_AUDITOR'].includes(role)))) {
      return fail(res, 404, 'NOT_FOUND', 'Draw not found.');
    }
    if (draw.owner_subject !== actor.subject && !actor.roles.includes('DRAW_AUDITOR') && !actor.roles.includes('DRAW_REVIEWER')) {
      return fail(res, 404, 'NOT_FOUND', 'Draw not found.');
    }
    return json(res, 200, { ok: true, data: publicDraw(draw), request_id: requestId });
  }

  const executeMatch = url.pathname.match(/^\/api\/v1\/draws\/([^/]+)\/execute$/);
  if (req.method === 'POST' && executeMatch) {
    const draw = draws.get(decodeURIComponent(executeMatch[1]));
    if (!draw) return fail(res, 404, 'NOT_FOUND', 'Draw not found.');
    if (!actor.roles.includes('DRAW_OPERATOR')) return fail(res, 403, 'FORBIDDEN', 'Operator role required.');
    if (draw.owner_subject !== actor.subject) return fail(res, 404, 'NOT_FOUND', 'Draw not found.');
    const key = String(req.headers['idempotency-key'] || '');
    if (!key || key.length > 128) return fail(res, 400, 'VALIDATION_ERROR', 'Idempotency-Key is required.');
    const digest = sha(JSON.stringify(body));
    const expected = String(req.headers['if-match'] || '').replace(/^"|"$/g, '');
    const currentOperation = journal.getOperations().find(item =>
      item.target_id === draw.draw_id && item.actor_subject === actor.subject && item.idempotency_key === key);
    if (currentOperation) {
      if (currentOperation.payload_digest !== digest) return fail(res, 409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used with a different request.');
      if (currentOperation.state !== 'COMPLETED') return fail(res, 409, 'RECONCILIATION_REQUIRED', 'A prior operation has an uncertain outcome; manual reconciliation is required.');
      return json(res, 200, { ok: true, data: { operation_id: currentOperation.operation_id }, operation: { state: 'COMPLETED', replayed: true }, request_id: requestId });
    }
    if (busyDraws.has(draw.draw_id)) return fail(res, 409, 'OPERATION_IN_PROGRESS', 'Another state transition is already being processed for this draw.');
    busyDraws.add(draw.draw_id);
    try {
    if (!expected || expected !== String(draw.version)) return fail(res, 412, 'VERSION_PRECONDITION_FAILED', 'If-Match must equal the current draw version.');
    if (draw.state !== 'BEACON_COMMITTED') return fail(res, 409, 'PRECONDITION_FAILED', 'Draw is not ready for execution.');
    let intent;
    try {
      intent = await journal.beginOperation({
        idempotencyKey: key, actorSubject: actor.subject, targetId: draw.draw_id, payloadDigest: digest
      });
    } catch (error) {
      return fail(res, 503, error.code || 'PERSISTENCE_ERROR', 'Durable intent could not be confirmed; reconcile before retrying.');
    }
    if (!intent.created) {
      if (intent.operation.state === 'COMPLETED') {
        return json(res, 200, { ok: true, data: { operation_id: intent.operation.operation_id }, operation: { state: 'COMPLETED', replayed: true }, request_id: requestId });
      }
      return fail(res, 409, 'RECONCILIATION_REQUIRED', 'A prior operation has an uncertain outcome.');
    }
    if (process.env.MPS_DRAW_CRASH_STAGE === 'after_intent') process.exit(86);
    draw.state = 'DRAWN_UNVERIFIED';
    draw.version++;
    draw.operation_count++;
    if (process.env.MPS_DRAW_CRASH_STAGE === 'after_state_mutation') process.exit(87);
    try {
      await journal.completeOperation({
        operationId: intent.operation.operation_id,
        result: { state: 'DRAWN_UNVERIFIED', synthetic: true, aggregate: aggregateFor(draw) }
      });
    } catch (error) {
      draw.state = 'RECONCILIATION_REQUIRED';
      draw.version++;
      return fail(res, 503, error.code || 'RECONCILIATION_REQUIRED', 'State transition acknowledgement is uncertain; reconcile before further writes.');
    }
    return json(res, 202, {
      ok: true, data: { operation_id: intent.operation.operation_id },
      operation: { state: 'COMPLETED', replayed: false }, request_id: requestId
    });
    } finally {
      busyDraws.delete(draw.draw_id);
    }
  }
  return fail(res, 404, 'NOT_FOUND', 'Route not found.');
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(PORT, HOST, resolve);
});
const baseUrl = 'http://' + HOST + ':' + PORT;
async function request({ method, path: route, actor, body, headers = {} }) {
  const response = await fetch(new URL(route, baseUrl), {
    method, redirect: 'error',
    headers: {
      ...(actor?.token ? { authorization: 'Bearer ' + actor.token } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, body: await response.json() };
}
async function shutdown() {
  await journal.close();
  await new Promise(resolve => server.close(resolve));
}
process.once('SIGTERM', () => shutdown().finally(() => process.exit(0)));
process.once('SIGINT', () => shutdown().finally(() => process.exit(0)));

export default { baseUrl, actors, request, shutdown, journalDir };
