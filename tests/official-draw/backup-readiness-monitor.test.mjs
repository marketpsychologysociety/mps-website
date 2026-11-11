import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateBackupReadiness, buildAlertEvents, createNotificationOutboxRecord,
  beginNotificationAttempt, acknowledgeNotification, failNotificationAttempt
} from "./backup-readiness-monitor.mjs";

const NOW = "2026-11-11T08:00:00.000Z";
const HASH = "a".repeat(64);
const policy = {
  maxBackupAgeSeconds: 86400, maxAuditAgeSeconds: 86400,
  maxRestoreDrillAgeSeconds: 30 * 86400, maxKeyRecoveryAgeSeconds: 90 * 86400,
  retentionWarningSeconds: 7 * 86400, maxRpoSeconds: 86400, maxRtoSeconds: 3600
};
function goodSnapshot() {
  return {
    schemaVersion: 1,
    sourceCheckpoint: { sequence: 12, sha256: HASH },
    backup: {
      sequence: 12, sha256: HASH, manifestSha256: "b".repeat(64),
      createdAt: "2026-11-11T07:00:00.000Z", retentionUntil: "2027-01-01T00:00:00.000Z",
      independentReadbackAt: "2026-11-11T07:30:00.000Z",
      digestVerified: true, exactGenerationRead: true, sourceUnchanged: true
    },
    auditExport: { completedAt: "2026-11-11T07:20:00.000Z", paginationComplete: true, independentExport: true },
    restoreDrill: {
      completedAt: "2026-11-01T00:00:00.000Z", outcome: "PASS",
      checkpointMatched: true, independentVerifier: true, rpoSeconds: 120, rtoSeconds: 900
    },
    keyRecovery: { testedAt: "2026-10-01T00:00:00.000Z", outcome: "PASS", independentRecovery: true }
  };
}

test("accepts complete, fresh, independently verified synthetic evidence", () => {
  const result = evaluateBackupReadiness(goodSnapshot(), policy, NOW);
  assert.equal(result.status, "HEALTHY");
  assert.deepEqual(result.findings, []);
  assert.equal(result.checkpoint.sequence, 12);
});

test("fails closed when latest backup is absent", () => {
  const s = goodSnapshot(); s.backup = null;
  const r = evaluateBackupReadiness(s, policy, NOW);
  assert.equal(r.status, "UNHEALTHY");
  assert.ok(r.findings.some(x => x.code === "BACKUP_MISSING"));
});

test("detects stale backup evidence", () => {
  const s = goodSnapshot(); s.backup.createdAt = "2026-11-09T00:00:00.000Z";
  assert.ok(evaluateBackupReadiness(s, policy, NOW).findings.some(x => x.code === "BACKUP_STALE"));
});

test("detects backup checkpoint fork and source mutation", () => {
  const s = goodSnapshot(); s.backup.sequence = 11; s.backup.sourceUnchanged = false;
  assert.ok(evaluateBackupReadiness(s, policy, NOW).findings.some(x => x.code === "BACKUP_CHECKPOINT_MISMATCH"));
});

test("detects missing exact-generation independent integrity readback", () => {
  const s = goodSnapshot(); s.backup.exactGenerationRead = false;
  assert.ok(evaluateBackupReadiness(s, policy, NOW).findings.some(x => x.code === "BACKUP_INTEGRITY_UNVERIFIED"));
});

test("detects expired retention as critical", () => {
  const s = goodSnapshot(); s.backup.retentionUntil = "2026-11-10T00:00:00.000Z";
  assert.ok(evaluateBackupReadiness(s, policy, NOW).findings.some(x => x.code === "BACKUP_RETENTION_EXPIRED"));
});

test("reports near-expiry retention as warning only", () => {
  const s = goodSnapshot(); s.backup.retentionUntil = "2026-11-14T00:00:00.000Z";
  const r = evaluateBackupReadiness(s, policy, NOW);
  assert.equal(r.status, "DEGRADED");
  assert.deepEqual(r.findings.map(x => x.code), ["BACKUP_RETENTION_NEAR_EXPIRY"]);
});

test("detects incomplete or stale independent audit export", () => {
  const s = goodSnapshot(); s.auditExport.paginationComplete = false; s.auditExport.completedAt = "2026-11-08T00:00:00.000Z";
  const codes = evaluateBackupReadiness(s, policy, NOW).findings.map(x => x.code);
  assert.ok(codes.includes("AUDIT_EXPORT_STALE"));
  assert.ok(codes.includes("AUDIT_EXPORT_INCOMPLETE"));
});

test("detects missing audit export", () => {
  const s = goodSnapshot(); s.auditExport = null;
  assert.ok(evaluateBackupReadiness(s, policy, NOW).findings.some(x => x.code === "AUDIT_EXPORT_MISSING"));
});

test("detects missing, stale and failed restore drills", () => {
  const missing = goodSnapshot(); missing.restoreDrill = null;
  assert.ok(evaluateBackupReadiness(missing, policy, NOW).findings.some(x => x.code === "RESTORE_DRILL_MISSING"));
  const stale = goodSnapshot(); stale.restoreDrill.completedAt = "2026-09-01T00:00:00.000Z";
  assert.ok(evaluateBackupReadiness(stale, policy, NOW).findings.some(x => x.code === "RESTORE_DRILL_STALE"));
  const failed = goodSnapshot(); failed.restoreDrill.rtoSeconds = 99999;
  assert.ok(evaluateBackupReadiness(failed, policy, NOW).findings.some(x => x.code === "RESTORE_DRILL_FAILED"));
});

test("detects key-recovery failure and missing evidence", () => {
  const failed = goodSnapshot(); failed.keyRecovery.independentRecovery = false;
  assert.ok(evaluateBackupReadiness(failed, policy, NOW).findings.some(x => x.code === "KEY_RECOVERY_FAILED"));
  const missing = goodSnapshot(); missing.keyRecovery = null;
  assert.ok(evaluateBackupReadiness(missing, policy, NOW).findings.some(x => x.code === "KEY_RECOVERY_MISSING"));
});

test("rejects unknown snapshot fields and future evidence timestamps", () => {
  const extra = goodSnapshot(); extra.memberEmail = "must-not-be-accepted";
  assert.throws(() => evaluateBackupReadiness(extra, policy, NOW), /UNKNOWN_OR_MISSING_FIELD/);
  const future = goodSnapshot(); future.backup.createdAt = "2026-11-12T00:00:00.000Z";
  assert.throws(() => evaluateBackupReadiness(future, policy, NOW), /FUTURE/);
});

test("rejects malformed digest and unsafe policy", () => {
  const bad = goodSnapshot(); bad.backup.sha256 = "not-a-digest";
  assert.throws(() => evaluateBackupReadiness(bad, policy, NOW), /DIGEST_INVALID/);
  assert.throws(() => evaluateBackupReadiness(goodSnapshot(), { ...policy, maxRtoSeconds: 0 }, NOW), /POLICY/);
});

test("deduplicates alerts by finding and exact checkpoint without exposing private fields", () => {
  const s = goodSnapshot(); s.backup = null;
  const result = evaluateBackupReadiness(s, policy, NOW);
  const alerts = buildAlertEvents(result);
  assert.ok(alerts.length > 0);
  assert.equal(buildAlertEvents(result, alerts.map(x => x.idempotencyKey)).length, 0);
  assert.ok(alerts.every(x => !JSON.stringify(x).match(/member|email|phone|telegram|mt5|deposit/i)));
});

test("notification remains pending until an explicit provider acknowledgement", () => {
  const s = goodSnapshot(); s.backup = null;
  const alert = buildAlertEvents(evaluateBackupReadiness(s, policy, NOW))[0];
  const record = createNotificationOutboxRecord(alert, NOW);
  assert.equal(record.state, "PENDING");
  const attempting = beginNotificationAttempt(record, NOW);
  assert.equal(attempting.state, "ATTEMPTING");
  assert.throws(() => acknowledgeNotification(attempting, { accepted: false, messageId: "" }), /ACK_INVALID/);
  const delivered = acknowledgeNotification(attempting, { accepted: true, messageId: "provider-msg-001" });
  assert.equal(delivered.state, "DELIVERED");
  assert.equal(delivered.providerMessageId, "provider-msg-001");
});

test("retries with bounded exponential backoff and dead-letters after final failure", () => {
  const s = goodSnapshot(); s.backup = null;
  const alert = buildAlertEvents(evaluateBackupReadiness(s, policy, NOW))[0];
  let record = createNotificationOutboxRecord(alert, NOW, 2);
  record = beginNotificationAttempt(record, NOW);
  record = failNotificationAttempt(record, NOW);
  assert.equal(record.state, "RETRY_WAIT");
  assert.equal(record.nextAttemptAt, "2026-11-11T08:00:30.000Z");
  record = beginNotificationAttempt(record, record.nextAttemptAt);
  record = failNotificationAttempt(record, "2026-11-11T08:00:30.000Z");
  assert.equal(record.state, "DEAD_LETTER");
  assert.equal(record.nextAttemptAt, null);
});

test("rejects early retry, exhausted attempts and acknowledgement without active attempt", () => {
  const s = goodSnapshot(); s.backup = null;
  const alert = buildAlertEvents(evaluateBackupReadiness(s, policy, NOW))[0];
  const record = createNotificationOutboxRecord(alert, NOW, 1);
  assert.throws(() => beginNotificationAttempt(record, "2026-11-11T08:00:29.000Z"), /NOT_DUE/);
  const attempting = beginNotificationAttempt(record, NOW);
  const failed = failNotificationAttempt(attempting, NOW);
  assert.equal(failed.state, "DEAD_LETTER");
  assert.throws(() => beginNotificationAttempt(failed, NOW), /NOT_DUE/);
  assert.throws(() => acknowledgeNotification(record, { accepted: true, messageId: "x" }), /NOT_ATTEMPTING/);
});
