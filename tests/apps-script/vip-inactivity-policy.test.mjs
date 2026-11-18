import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../../candidates/Code.gs", import.meta.url), "utf8");
const match = source.match(/function mpsEvaluateVipInactivityPolicy_\\(input\\)\\s*\\{[\\s\\S]*?\\n\\}/);
assert.ok(match, "candidate Code.gs must contain the pure inactivity policy evaluator");
const sandbox = {};
vm.runInNewContext(match[0] + "\\nthis.evaluate = mpsEvaluateVipInactivityPolicy_;", sandbox);
const evaluate = sandbox.evaluate;
const NOW = "2026-11-18";
function daysAgo(days) {
  const [y, m, d] = NOW.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}
function account(lastDate, overrides = {}) {
  return {
    mappingStatus: "VERIFIED_UNIQUE",
    sourceStatus: "FRESH_VERIFIED",
    lastActivityType: "EXECUTED_TRADE",
    lastExecutedTradeWibDate: lastDate,
    ...overrides
  };
}
function run(lastDate, overrides = {}, extra = {}) {
  return evaluate({ nowWibDate: NOW, accounts: [account(lastDate, overrides)], ...extra });
}

test("keeps member active before the 45-day notice threshold", () => {
  const result = run(daysAgo(44));
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.daysInactive, 44);
  assert.equal(result.noticeDue, null);
  assert.equal(result.automaticActionAllowed, false);
});

test("flags the first reminder at 45 calendar days in WIB", () => {
  const result = run(daysAgo(45));
  assert.equal(result.status, "REMINDER_45_DUE");
  assert.equal(result.noticeDue, "DAY_45");
  assert.equal(result.automaticActionAllowed, false);
});

test("flags the final reminder at 55 calendar days in WIB", () => {
  const result = run(daysAgo(55));
  assert.equal(result.status, "FINAL_REMINDER_55_DUE");
  assert.equal(result.noticeDue, "DAY_55");
  assert.equal(result.automaticActionAllowed, false);
});

test("requires a separate approved review at exactly 60 days", () => {
  const result = run(daysAgo(60));
  assert.equal(result.status, "REVOCATION_REVIEW_REQUIRED");
  assert.equal(result.daysInactive, 60);
  assert.equal(result.noticeDue, null);
  assert.equal(result.automaticActionAllowed, false);
});

test("keeps a member active when any verified linked account has recent execution", () => {
  const result = evaluate({
    nowWibDate: NOW,
    accounts: [account(daysAgo(80)), account(daysAgo(10))]
  });
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.lastActivityWibDate, daysAgo(10));
  assert.equal(result.daysInactive, 10);
});

test("fails closed for ambiguous or unverified account mapping", () => {
  const result = run(daysAgo(90), { mappingStatus: "DUPLICATE_MAPPING" });
  assert.equal(result.status, "ACTIVITY_DATA_UNVERIFIED");
  assert.equal(result.automaticActionAllowed, false);
});

test("fails closed for stale or unavailable broker activity data", () => {
  const result = run(daysAgo(90), { sourceStatus: "STALE" });
  assert.equal(result.status, "ACTIVITY_DATA_UNVERIFIED");
  assert.equal(result.reason, "BROKER_ACTIVITY_SOURCE_NOT_FRESH_VERIFIED");
});

test("fails closed when activity is not explicitly an executed trade", () => {
  const result = run(daysAgo(90), { lastActivityType: "PENDING_ORDER" });
  assert.equal(result.status, "ACTIVITY_DATA_UNVERIFIED");
});

test("fails closed for missing, malformed, impossible, or future trade dates", () => {
  for (const date of [null, "", "2026-02-30", "2026/08/01", "2026-11-19"]) {
    const result = run(date);
    assert.equal(result.status, "ACTIVITY_DATA_UNVERIFIED");
    assert.equal(result.automaticActionAllowed, false);
  }
});

test("fails closed for invalid policy date and empty or excessive account sets", () => {
  assert.equal(evaluate({ nowWibDate: "2026-02-30", accounts: [account(daysAgo(90))] }).status, "ACTIVITY_DATA_UNVERIFIED");
  assert.equal(evaluate({ nowWibDate: NOW, accounts: [] }).status, "ACTIVITY_DATA_UNVERIFIED");
  assert.equal(evaluate({ nowWibDate: NOW, accounts: Array.from({ length: 21 }, () => account(daysAgo(90))) }).status, "ACTIVITY_DATA_UNVERIFIED");
});

test("does not allow automatic removal under any evaluated state", () => {
  for (const days of [1, 45, 55, 60, 120]) {
    assert.equal(run(daysAgo(days)).automaticActionAllowed, false);
  }
});
