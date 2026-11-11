/**
 * MPS Official Draw API — isolated synthetic security sandbox.
 *
 * TEST ONLY. In-memory state, synthetic bearer credentials, no OIDC, no durable
 * journal, no beacon verifier, and no production suitability.
 * Bind is hard-coded to 127.0.0.1. Do not expose or deploy this module.
 */
import http from "node:http";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";

const HOST = "127.0.0.1";
const PORT = 4178;
const MAX_BODY = 16 * 1024;

const actors = Object.freeze({
  operatorA: Object.freeze({ token: "synthetic-token-operator-a", issuer: "https://issuer.test.invalid/", subject: "subject_synthetic_operator_A", roles: ["DRAW_OPERATOR"] }),
  reviewerB: Object.freeze({ token: "synthetic-token-reviewer-b", issuer: "https://issuer.test.invalid/", subject: "subject_synthetic_reviewer_B", roles: ["DRAW_REVIEWER"] }),
  reviewerSameSubjectAsA: Object.freeze({ token: "synthetic-token-second-session-same-subject", issuer: "https://issuer.test.invalid/", subject: "subject_synthetic_operator_A", roles: ["DRAW_REVIEWER"] }),
  publisherC: Object.freeze({ token: "synthetic-token-publisher-c", issuer: "https://issuer.test.invalid/", subject: "subject_synthetic_publisher_C", roles: ["DRAW_PUBLISHER"] }),
  auditorD: Object.freeze({ token: "synthetic-token-auditor-d", issuer: "https://issuer.test.invalid/", subject: "subject_synthetic_auditor_D", roles: ["DRAW_AUDITOR"] })
});

const tokenMap = new Map(Object.values(actors).map(a => [a.token, a]));
let events = new Map();
let draws = new Map();
let idempotency = new Map();
let operations = new Map();
let audit = [];

const hash = value => createHash("sha256").update(String(value)).digest("hex");
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const json = (res, status, body) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer"
  });
  res.end(JSON.stringify(body));
};
const fail = (res, status, code, message) =>
  json(res, status, { ok: false, error: { code, message, retryable: false } });

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("Request too large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    throw Object.assign(new Error("JSON required"), { status: 415 });
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}

function actorFor(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  for (const [known, actor] of tokenMap) if (safeEqual(token, known)) return actor;
  return null;
}
function requireRole(actor, role) { return Boolean(actor && actor.roles.includes(role)); }
function auditAction(actor, action, target, result) {
  audit.push({ at: new Date().toISOString(), subject: actor.subject, action, target, result });
}
function sendEvent(event) {
  return {
    event_id: event.event_id,
    state: event.state,
    version: event.version,
    rules_hash: event.rules_hash ?? null,
    created_by_subject: event.created_by_subject
  };
}
function sendDraw(draw) {
  return { draw_id: draw.draw_id, event_id: draw.event_id, state: draw.state, version: draw.version };
}

const server = http.createServer(async (req, res) => {
  const requestId = "req_" + randomUUID();
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/health" && req.method === "GET") {
    return json(res, 200, { ok: true, data: { service: "mps-draw-synthetic-sandbox", mode: "TEST_ONLY" }, request_id: requestId });
  }
  const actor = actorFor(req);
  if (!actor) return fail(res, 401, "UNAUTHENTICATED", "Valid synthetic sandbox session required.");
  if (req.method === "GET" && url.pathname === "/api/v1/session") {
    return json(res, 200, { ok: true, request_id: requestId, data: { roles: actor.roles } });
  }

  let body;
  try { body = await readBody(req); }
  catch (error) { return fail(res, error.status || 400, "VALIDATION_ERROR", error.message); }

  if (req.method === "POST" && url.pathname === "/api/v1/events") {
    if (!requireRole(actor, "DRAW_OPERATOR")) return fail(res, 403, "FORBIDDEN", "Insufficient role.");
    const allowed = new Set(["title_public"]);
    if (Object.keys(body).some(k => !allowed.has(k))) return fail(res, 400, "VALIDATION_ERROR", "Unknown or privileged fields are not accepted.");
    if (typeof body.title_public !== "string" || !body.title_public.trim() || body.title_public.length > 120) {
      return fail(res, 400, "VALIDATION_ERROR", "A bounded public title is required.");
    }
    const event = {
      event_id: "evt_" + randomUUID(), title_public: body.title_public.trim(),
      state: "DRAFT", version: 1, created_by_subject: actor.subject
    };
    events.set(event.event_id, event);
    auditAction(actor, "EVENT_CREATED", event.event_id, "ACCEPTED");
    return json(res, 201, { ok: true, request_id: requestId, data: sendEvent(event) });
  }

  const approveMatch = url.pathname.match(/^\/api\/v1\/events\/([^/]+)\/approve-rules$/);
  if (req.method === "POST" && approveMatch) {
    const event = events.get(decodeURIComponent(approveMatch[1]));
    if (!event) return fail(res, 404, "NOT_FOUND", "Event not found.");
    if (!requireRole(actor, "DRAW_REVIEWER")) return fail(res, 403, "FORBIDDEN", "Insufficient role.");
    if (actor.issuer === event.created_by_issuer && actor.subject === event.created_by_subject) {
      return fail(res, 409, "SEPARATION_OF_DUTIES", "A distinct person must review this event.");
    }
    if (actor.subject === event.created_by_subject) return fail(res, 409, "SEPARATION_OF_DUTIES", "A distinct person must review this event.");
    if (event.state !== "RULES_REVIEW_PENDING" || body.rules_hash !== event.rules_hash) {
      return fail(res, 409, "PRECONDITION_FAILED", "Event state or rules digest does not match.");
    }
    event.approved_by_subject = actor.subject;
    event.state = "RULES_APPROVED";
    event.version++;
    auditAction(actor, "RULES_APPROVED", event.event_id, "ACCEPTED");
    return json(res, 200, { ok: true, request_id: requestId, data: sendEvent(event) });
  }

  const statusMatch = url.pathname.match(/^\/api\/v1\/draws\/([^/]+)\/status$/);
  if (req.method === "GET" && statusMatch) {
    const draw = draws.get(decodeURIComponent(statusMatch[1]));
    if (!draw) return fail(res, 404, "NOT_FOUND", "Draw not found.");
    if (!actor.roles.some(r => ["DRAW_OPERATOR", "DRAW_REVIEWER", "DRAW_AUDITOR"].includes(r))) {
      return fail(res, 404, "NOT_FOUND", "Draw not found.");
    }
    if (draw.owner_subject !== actor.subject && !actor.roles.includes("DRAW_AUDITOR") && !actor.roles.includes("DRAW_REVIEWER")) {
      return fail(res, 404, "NOT_FOUND", "Draw not found.");
    }
    return json(res, 200, { ok: true, request_id: requestId, data: sendDraw(draw) });
  }

  const executeMatch = url.pathname.match(/^\/api\/v1\/draws\/([^/]+)\/execute$/);
  if (req.method === "POST" && executeMatch) {
    const draw = draws.get(decodeURIComponent(executeMatch[1]));
    if (!draw) return fail(res, 404, "NOT_FOUND", "Draw not found.");
    if (!requireRole(actor, "DRAW_OPERATOR")) return fail(res, 403, "FORBIDDEN", "Insufficient role.");
    const key = String(req.headers["idempotency-key"] || "");
    if (!key || key.length > 128) return fail(res, 400, "VALIDATION_ERROR", "Idempotency-Key is required.");
    const scope = draw.draw_id + ":" + actor.subject + ":" + key;
    const digest = hash(JSON.stringify(body));
    if (idempotency.has(scope)) {
      const prior = idempotency.get(scope);
      if (prior.digest !== digest) return fail(res, 409, "IDEMPOTENCY_CONFLICT", "Idempotency key was used with a different request.");
      return json(res, 200, { ok: true, request_id: requestId, data: { operation_id: prior.operation_id }, operation: { state: "COMPLETED", replayed: true } });
    }
    if (draw.state !== "BEACON_COMMITTED") return fail(res, 409, "PRECONDITION_FAILED", "Draw is not ready for execution.");
    const op = "op_" + randomUUID();
    idempotency.set(scope, { digest, operation_id: op });
    operations.set(draw.draw_id, (operations.get(draw.draw_id) || 0) + 1);
    draw.state = "DRAWN_UNVERIFIED";
    draw.version++;
    auditAction(actor, "DRAW_EXECUTION_REQUESTED", draw.draw_id, "ACCEPTED");
    return json(res, 202, { ok: true, request_id: requestId, data: { operation_id: op }, operation: { state: "COMPLETED", replayed: false } });
  }

  const publishMatch = url.pathname.match(/^\/api\/v1\/draws\/([^/]+)\/publish$/);
  if (req.method === "POST" && publishMatch) {
    const draw = draws.get(decodeURIComponent(publishMatch[1]));
    if (!draw) return fail(res, 404, "NOT_FOUND", "Draw not found.");
    if (!requireRole(actor, "DRAW_PUBLISHER")) return fail(res, 403, "FORBIDDEN", "Insufficient role.");
    if (draw.state !== "VERIFIED") return fail(res, 409, "PRECONDITION_FAILED", "Only independently verified results can be published.");
    draw.state = "PUBLISHED";
    draw.version++;
    auditAction(actor, "DRAW_PUBLISHED", draw.draw_id, "ACCEPTED");
    return json(res, 200, { ok: true, request_id: requestId, data: sendDraw(draw) });
  }

  return fail(res, 404, "NOT_FOUND", "Route not found.");
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(PORT, HOST, resolve);
});
server.unref();

const baseUrl = `http://${HOST}:${PORT}`;
async function request({ method, path, actor, body, headers = {} }) {
  const token = actor?.token;
  const response = await fetch(new URL(path, baseUrl), {
    method,
    redirect: "error",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, body: await response.json() };
}
function reset() {
  events = new Map(); draws = new Map(); idempotency = new Map(); operations = new Map(); audit = [];
}
function seedDrawAtState({ state, preparedBy, approvedBy }) {
  const eventId = "evt_fixture_" + randomUUID();
  const drawId = "draw_fixture_" + randomUUID();
  const event = {
    event_id: eventId, state, version: 1, created_by_subject: preparedBy.subject,
    created_by_issuer: preparedBy.issuer, rules_hash: hash("synthetic-rules")
  };
  const draw = {
    draw_id: drawId, event_id: eventId, state, version: 1,
    owner_subject: preparedBy.subject, approved_by_subject: approvedBy?.subject ?? null
  };
  events.set(eventId, event); draws.set(drawId, draw);
  return { eventId, drawId, version: 1, rulesHash: event.rules_hash };
}
function seedApprovedEvent({ preparedBy, approvedBy }) {
  const seeded = seedDrawAtState({ state: "BEACON_COMMITTED", preparedBy, approvedBy });
  return { ...seeded, snapshotDigest: hash("synthetic-snapshot") };
}
function getPrivateCanaries() {
  return ["SYNTHETIC_PRIVATE_CANARY_8f3a", "participant_synthetic_001"];
}
function getPublishedProjection() {
  return null;
}
function getOperationCount(drawId) { return operations.get(drawId) || 0; }

export default {
  baseUrl, actors, reset, seedApprovedEvent, seedDrawAtState, request,
  getPrivateCanaries, getPublishedProjection, getOperationCount
};
