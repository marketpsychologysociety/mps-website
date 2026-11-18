import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const enabled = process.env.MPS_DRAW_TEST_ALLOW_LOCAL === "1";
const adapterPath = process.env.MPS_DRAW_TEST_ADAPTER;
let adapter = null;
let setupError = null;

function isLoopbackUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

if (enabled && adapterPath) {
  try {
    const absolute = path.resolve(adapterPath);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new Error("Adapter must be an existing local file.");
    }
    const loaded = await import(pathToFileURL(absolute).href);
    adapter = loaded.default ?? loaded;
    if (!isLoopbackUrl(adapter.baseUrl)) {
      throw new Error("Refusing to run: adapter.baseUrl must be a loopback URL.");
    }
    const required = [
      "reset", "seedApprovedEvent", "seedDrawAtState", "request",
      "seedPublishedProjection", "getPrivateCanaries", "getPublishedProjection", "getOperationCount"
    ];
    for (const name of required) {
      if (typeof adapter[name] !== "function") {
        throw new Error(`Adapter is missing required function: ${name}`);
      }
    }
    for (const name of ["operatorA", "reviewerB", "reviewerSameSubjectAsA", "publisherC", "auditorD"]) {
      if (!adapter.actors?.[name]) throw new Error(`Adapter is missing synthetic actor: ${name}`);
    }
  } catch (error) {
    setupError = error;
    adapter = null;
  }
}

const integration = adapter ? test : test.skip;

if (enabled && adapterPath && setupError) {
  test("harness safety configuration", () => {
    assert.fail(setupError.message);
  });
} else {
  test("harness safety configuration", () => {
    assert.equal(adapter !== null, enabled && Boolean(adapterPath),
      "Backend integration is enabled only when explicit local opt-in and adapter are supplied.");
    if (!adapter) assert.ok(true, "No adapter: integration cases below are intentionally skipped.");
  });
}

beforeEach(async (t) => {
  if (!adapter) return;
  await adapter.reset();
  t.diagnostic("Using a disposable loopback sandbox and synthetic fixtures only.");
});

integration("client-supplied actor and role cannot forge authenticated identity", async () => {
  const a = adapter.actors.operatorA;
  const event = await adapter.request({
    method: "POST",
    path: "/api/v1/events",
    actor: a,
    headers: { "Idempotency-Key": "test-forged-actor-001" },
    body: {
      title_public: "Synthetic security test",
      actor_subject: "subject_synthetic_reviewer_B",
      actor_issuer: "https://issuer.test.invalid/",
      roles: ["DRAW_REVIEWER"],
      approvedBy: "subject_synthetic_reviewer_B"
    }
  });
  assert.ok([200, 201, 400, 403].includes(event.status), "request must be handled safely");
  assert.notEqual(event.body?.data?.actor_subject, "subject_synthetic_reviewer_B");
  assert.notEqual(event.body?.data?.roles?.[0], "DRAW_REVIEWER");
});

integration("same immutable subject cannot satisfy independent approval through a second session", async () => {
  const seeded = await adapter.seedDrawAtState({
    state: "RULES_REVIEW_PENDING",
    preparedBy: adapter.actors.operatorA,
    approvedBy: null
  });
  const result = await adapter.request({
    method: "POST",
    path: `/api/v1/events/${encodeURIComponent(seeded.eventId)}/approve-rules`,
    actor: adapter.actors.reviewerSameSubjectAsA,
    headers: {
      "Idempotency-Key": "test-same-subject-approval",
      "If-Match": String(seeded.version ?? 1)
    },
    body: { decision: "APPROVE", rules_hash: seeded.rulesHash }
  });
  assert.equal(result.status, 409);
  assert.equal(result.body?.error?.code, "SEPARATION_OF_DUTIES");
});

integration("actor with insufficient role cannot execute a draw", async () => {
  const seeded = await adapter.seedApprovedEvent({
    preparedBy: adapter.actors.operatorA,
    approvedBy: adapter.actors.reviewerB
  });
  const result = await adapter.request({
    method: "POST",
    path: `/api/v1/draws/${encodeURIComponent(seeded.drawId)}/execute`,
    actor: adapter.actors.auditorD,
    headers: { "Idempotency-Key": "test-auditor-execute-denied", "If-Match": "1" },
    body: {}
  });
  assert.equal(result.status, 403);
  assert.equal(await adapter.getOperationCount(seeded.drawId), 0);
});

integration("state-changing execution requires the current If-Match version", async () => {
  const seeded = await adapter.seedApprovedEvent({
    preparedBy: adapter.actors.operatorA,
    approvedBy: adapter.actors.reviewerB
  });
  const path = `/api/v1/draws/${encodeURIComponent(seeded.drawId)}/execute`;
  const missing = await adapter.request({
    method: "POST", path, actor: adapter.actors.operatorA,
    headers: { "Idempotency-Key": "test-version-missing" }, body: {}
  });
  assert.equal(missing.status, 412);
  const stale = await adapter.request({
    method: "POST", path, actor: adapter.actors.operatorA,
    headers: { "Idempotency-Key": "test-version-stale", "If-Match": "0" }, body: {}
  });
  assert.equal(stale.status, 412);
  assert.equal(await adapter.getOperationCount(seeded.drawId), 0);
});

integration("same idempotency key with changed request payload is rejected", async () => {
  const seeded = await adapter.seedApprovedEvent({
    preparedBy: adapter.actors.operatorA,
    approvedBy: adapter.actors.reviewerB
  });
  const headers = { "Idempotency-Key": "test-idempotency-conflict", "If-Match": "1" };
  const first = await adapter.request({
    method: "POST",
    path: `/api/v1/draws/${encodeURIComponent(seeded.drawId)}/execute`,
    actor: adapter.actors.operatorA,
    headers,
    body: {}
  });
  const replay = await adapter.request({
    method: "POST",
    path: `/api/v1/draws/${encodeURIComponent(seeded.drawId)}/execute`,
    actor: adapter.actors.operatorA,
    headers,
    body: { winner_ref: "participant_synthetic_injected" }
  });
  assert.ok([200, 202].includes(first.status));
  assert.equal(replay.status, 409);
  assert.equal(replay.body?.error?.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(await adapter.getOperationCount(seeded.drawId), 1);
});

integration("cross-event identifiers do not bypass object-level authorization", async () => {
  const own = await adapter.seedApprovedEvent({
    preparedBy: adapter.actors.operatorA,
    approvedBy: adapter.actors.reviewerB
  });
  const other = await adapter.seedDrawAtState({
    state: "DRAFT",
    preparedBy: adapter.actors.reviewerB,
    approvedBy: null
  });
  const result = await adapter.request({
    method: "GET",
    path: `/api/v1/draws/${encodeURIComponent(other.drawId)}/status`,
    actor: adapter.actors.operatorA
  });
  assert.ok([403, 404].includes(result.status));
  const execute = await adapter.request({
    method: "POST",
    path: `/api/v1/draws/${encodeURIComponent(other.drawId)}/execute`,
    actor: adapter.actors.operatorA,
    headers: { "Idempotency-Key": "test-cross-owner-execute", "If-Match": "1" },
    body: {}
  });
  assert.equal(execute.status, 404);
  assert.equal(await adapter.getOperationCount(other.drawId), 0);
  assert.notEqual(own.drawId, other.drawId);
});

integration("public projection never exposes private synthetic canaries", async () => {
  const fixture = await adapter.seedPublishedProjection();
  const canaries = await adapter.getPrivateCanaries();
  assert.ok(Array.isArray(canaries) && canaries.length >= 10);

  // Both anonymous collection and detail routes traverse the local HTTP server.
  const responses = await adapter.getPublishedProjection(fixture.publicResultId);
  assert.equal(responses.collection.status, 200);
  assert.equal(responses.detail.status, 200);
  assert.equal(responses.collection.body?.data?.count, 1);
  assert.equal(responses.detail.body?.data?.public_result_id, fixture.publicResultId);

  const serialized = JSON.stringify([responses.collection.body, responses.detail.body]);
  for (const canary of canaries) {
    assert.ok(!serialized.includes(canary), `Private canary leaked: ${canary}`);
  }
  assert.doesNotMatch(serialized, /participant_synthetic_\d{3,}/);
  assert.doesNotMatch(serialized, /SYNTHETIC_PRIVATE_CANARY/);

  const publicResult = responses.detail.body.data;
  assert.deepEqual(Object.keys(publicResult).sort(), [
    "event_title", "message", "prize_public_description", "proof_summary",
    "protocol_version", "public_result_id", "published_at_utc", "verification_status"
  ].sort());
  assert.deepEqual(Object.keys(publicResult.proof_summary).sort(), [
    "beacon_chain_hash", "beacon_round", "participant_count",
    "result_digest", "snapshot_commitment"
  ].sort());
  assert.equal(publicResult.verification_status, "VERIFIED");
  assert.equal(publicResult.message, "Hasil undian telah diverifikasi dan dipublikasikan.");
});

integration("unpublished or unknown public results fail closed", async () => {
  const empty = await adapter.getPublishedProjection("public_result_unknown");
  assert.equal(empty.collection.status, 200);
  assert.equal(empty.collection.body?.data?.count, 0);
  assert.equal(empty.detail.status, 404);
  assert.equal(empty.detail.body?.error?.code, "NOT_FOUND");
});

integration("unverified result cannot be published", async () => {
  const seeded = await adapter.seedDrawAtState({
    state: "DRAWN_UNVERIFIED",
    preparedBy: adapter.actors.operatorA,
    approvedBy: adapter.actors.reviewerB
  });
  const result = await adapter.request({
    method: "POST",
    path: `/api/v1/draws/${encodeURIComponent(seeded.drawId)}/publish`,
    actor: adapter.actors.publisherC,
    headers: { "Idempotency-Key": "test-publish-unverified", "If-Match": String(seeded.version ?? 1) },
    body: {}
  });
  assert.ok([403, 409, 422].includes(result.status));
  assert.notEqual(result.body?.operation?.state, "PUBLISHED");
});
