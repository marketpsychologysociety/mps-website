/**
 * P1.23 isolated technical acceptance harness.
 * SYNTHETIC TEST MODEL ONLY — not a production API, OIDC implementation,
 * database transaction, cryptographic draw, or cloud-provider adapter.
 */
import { createHash } from "node:crypto";

const ROLES = new Set([
  "DRAW_OPERATOR", "DRAW_REVIEWER", "DRAW_PUBLISHER",
  "DRAW_AUDITOR", "DRAW_SECURITY_ADMIN", "SERVICE_IDENTITY"
]);
const PUBLIC_RESULT_KEYS = [
  "event_title", "message", "prize_public_description", "proof_summary",
  "protocol_version", "public_result_id", "published_at_utc", "verification_status"
].sort();
const PUBLIC_PROOF_KEYS = [
  "beacon_chain_hash", "beacon_round", "participant_count",
  "result_digest", "snapshot_commitment"
].sort();

export function canonicalJson(value, stack = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") throw new TypeError("UNSUPPORTED_JSON_VALUE");
  if (stack.has(value)) throw new TypeError("CYCLIC_VALUE");
  stack.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError("NON_PLAIN_ARRAY");
      const parts = [];
      for (let i = 0; i < value.length; i++) {
        if (!Object.hasOwn(value, i)) throw new TypeError("SPARSE_ARRAY");
        parts.push(canonicalJson(value[i], stack));
      }
      if (Reflect.ownKeys(value).some(key => key !== "length" && !(typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length))) {
        throw new TypeError("ARRAY_EXTRA_PROPERTY");
      }
      return "[" + parts.join(",") + "]";
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("NON_PLAIN_OBJECT");
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError("SYMBOL_KEY");
    const keys = Object.keys(value).sort();
    const parts = keys.map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError("ACCESSOR_PROPERTY");
      return JSON.stringify(key) + ":" + canonicalJson(descriptor.value, stack);
    });
    return "{" + parts.join(",") + "}";
  } finally {
    stack.delete(value);
  }
}
export function digestCanonical(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
export function validateCreateEvent(input) {
  const allowed = new Set(["title_public", "rules_version", "eligibility_policy_version"]);
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok:false, code:"INVALID_BODY" };
  if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) return { ok:false, code:"INVALID_BODY" };
  if (Object.getOwnPropertySymbols(input).length || Object.keys(input).some(key => !allowed.has(key))) return { ok:false, code:"UNKNOWN_FIELD" };
  for (const key of Object.keys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) return { ok:false, code:"INVALID_BODY" };
  }
  if (typeof input.title_public !== "string" || !input.title_public.trim() || input.title_public.length > 160) {
    return { ok:false, code:"INVALID_TITLE" };
  }
  for (const key of ["rules_version", "eligibility_policy_version"]) {
    if (typeof input[key] !== "string" || !/^[A-Za-z0-9._-]{1,48}$/.test(input[key])) {
      return { ok:false, code:"INVALID_VERSION" };
    }
  }
  return { ok:true, value:{ title_public:input.title_public.trim(), rules_version:input.rules_version, eligibility_policy_version:input.eligibility_policy_version } };
}
export function authorize({ role, action, subject, ownerSubject, reviewerSubject }) {
  if (!ROLES.has(role) || typeof subject !== "string" || !subject) return { allowed:false, code:"FORBIDDEN" };
  const matrix = {
    create_event: ["DRAW_OPERATOR","DRAW_SECURITY_ADMIN"],
    approve_rules: ["DRAW_REVIEWER"],
    freeze_snapshot: ["DRAW_OPERATOR"],
    execute_draw: ["DRAW_OPERATOR"],
    verify_proof: ["DRAW_AUDITOR","SERVICE_IDENTITY"],
    publish_result: ["DRAW_PUBLISHER"],
    read_audit: ["DRAW_AUDITOR"]
  };
  if (!(matrix[action] || []).includes(role)) return { allowed:false, code:"FORBIDDEN" };
  if (["freeze_snapshot","execute_draw"].includes(action) && (!ownerSubject || ownerSubject !== subject)) {
    return { allowed:false, code:"NOT_RESOURCE_OWNER" };
  }
  if (action === "approve_rules" && (!reviewerSubject || reviewerSubject === subject)) {
    return { allowed:false, code:"SEPARATION_OF_DUTIES" };
  }
  return { allowed:true, code:"OK" };
}
export function projectPublicWinner(record) {
  if (!record || record.state !== "PUBLISHED" || record.verification_status !== "VERIFIED") return null;
  const proof = record.proof_summary;
  const inputKeys = [...PUBLIC_RESULT_KEYS, "state"].sort();
  if (!proof || Object.keys(record).sort().join("|") !== inputKeys.join("|") ||
      Object.keys(proof).sort().join("|") !== PUBLIC_PROOF_KEYS.join("|")) return null;
  const boundedString = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
  if (!boundedString(record.event_title,160) || !boundedString(record.message,240) ||
      !boundedString(record.prize_public_description,240) ||
      !boundedString(record.protocol_version,48) || !/^[A-Za-z0-9_-]{1,80}$/.test(record.public_result_id) ||
      typeof record.published_at_utc !== "string" || !Number.isFinite(Date.parse(record.published_at_utc)) || new Date(record.published_at_utc).toISOString() !== (record.published_at_utc.includes(".") ? record.published_at_utc : record.published_at_utc.replace("Z", ".000Z")) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(record.published_at_utc) ||
      !Number.isSafeInteger(proof.participant_count) || proof.participant_count < 1 ||
      !/^[0-9a-f]{64}$/.test(proof.beacon_chain_hash) ||
      !/^[0-9]{1,32}$/.test(proof.beacon_round) ||
      !/^[0-9a-f]{64}$/.test(proof.result_digest) ||
      !/^[0-9a-f]{64}$/.test(proof.snapshot_commitment)) return null;
  const { state: _internalState, ...publicRecord } = record;
  return structuredClone(publicRecord);
}

/**
 * Explicitly synthetic transaction/idempotency model. It is useful for contract
 * tests, but in-memory Maps do not provide database durability or isolation.
 */
export class SyntheticTransactionHarness {
  #records = new Map();
  #operations = new Map();
  #outbox = new Map();
  #serial = Promise.resolve();

  async execute({ drawId, subject, key, payload, expectedVersion, fault = "" }) {
    const run = async () => {
      if (typeof drawId !== "string" || !drawId || drawId.length > 128 || typeof subject !== "string" || !subject || subject.length > 256 || typeof key !== "string" || !key || key.length > 128 || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return { status:400, code:"INVALID_REQUEST" };
      let fingerprint;
      try { fingerprint = digestCanonical({ drawId, subject, payload, expectedVersion }); }
      catch { return { status:400, code:"INVALID_PAYLOAD" }; }
      const scope = JSON.stringify([subject, drawId, key]);
      const previous = this.#operations.get(scope);
      if (previous) return previous.fingerprint === fingerprint
        ? { status:200, replayed:true, result:structuredClone(previous.result) }
        : { status:409, code:"IDEMPOTENCY_CONFLICT" };
      const current = this.#records.get(drawId);
      if (!current) return { status:404, code:"NOT_FOUND" };
      if (current.version !== expectedVersion) return { status:412, code:"VERSION_MISMATCH" };
      if (current.state !== "BEACON_COMMITTED") return { status:409, code:"INVALID_STATE" };
      if (current.ownerSubject !== subject) return { status:404, code:"NOT_FOUND" };
      if (fault === "before_commit") return { status:503, code:"TRANSACTION_ABORTED" };

      const next = { ...current, state:"DRAWN_UNVERIFIED", version:current.version + 1 };
      const result = { draw_id:drawId, state:next.state, version:next.version };
      // Commit all synthetic state maps in one synchronous critical section.
      this.#records.set(drawId, next);
      this.#operations.set(scope, { fingerprint, result });
      this.#outbox.set(scope, { event:"DRAW_EXECUTED", state:"PENDING" });
      if (fault === "after_commit_before_ack") return { status:503, code:"ACKNOWLEDGMENT_LOST" };
      return { status:202, replayed:false, result:structuredClone(result) };
    };
    const pending = this.#serial.then(run, run);
    this.#serial = pending.then(() => undefined, () => undefined);
    return pending;
  }
  seedDraw({ drawId, ownerSubject, state="BEACON_COMMITTED", version=1 }) {
    if (typeof drawId !== "string" || !drawId || typeof ownerSubject !== "string" || !ownerSubject || !Number.isSafeInteger(version) || version < 1) throw new Error("INVALID_SEED");
    if (this.#records.has(drawId)) throw new Error("DUPLICATE_DRAW");
    this.#records.set(drawId, { drawId, ownerSubject, state, version });
  }
  readDraw(drawId) { const value=this.#records.get(drawId); return value ? structuredClone(value) : null; }
  operationCount() { return this.#operations.size; }
  outboxStates() { return [...this.#outbox.values()].map(x=>x.state); }
}
