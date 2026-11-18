/**
 * MPS P1.17 — deterministic backup integrity / DR readiness monitor.
 * Offline contract only. No provider access, scheduler, notification send, or member data.
 */

const FINDING_ORDER = [
  "BACKUP_MISSING", "BACKUP_STALE", "BACKUP_CHECKPOINT_MISMATCH",
  "BACKUP_INTEGRITY_UNVERIFIED", "BACKUP_RETENTION_EXPIRED",
  "BACKUP_RETENTION_NEAR_EXPIRY", "AUDIT_EXPORT_MISSING", "AUDIT_EXPORT_STALE",
  "AUDIT_EXPORT_INCOMPLETE", "RESTORE_DRILL_MISSING", "RESTORE_DRILL_STALE",
  "RESTORE_DRILL_FAILED", "KEY_RECOVERY_MISSING", "KEY_RECOVERY_STALE",
  "KEY_RECOVERY_FAILED"
];

const CRITICAL = new Set([
  "BACKUP_MISSING", "BACKUP_STALE", "BACKUP_CHECKPOINT_MISMATCH",
  "BACKUP_INTEGRITY_UNVERIFIED", "BACKUP_RETENTION_EXPIRED",
  "AUDIT_EXPORT_MISSING", "AUDIT_EXPORT_STALE", "AUDIT_EXPORT_INCOMPLETE",
  "RESTORE_DRILL_MISSING", "RESTORE_DRILL_STALE", "RESTORE_DRILL_FAILED",
  "KEY_RECOVERY_MISSING", "KEY_RECOVERY_STALE", "KEY_RECOVERY_FAILED"
]);

const MESSAGES = Object.freeze({
  BACKUP_MISSING: "Backup evidence is missing.",
  BACKUP_STALE: "Latest backup evidence is overdue.",
  BACKUP_CHECKPOINT_MISMATCH: "Backup does not match the expected source checkpoint.",
  BACKUP_INTEGRITY_UNVERIFIED: "Independent backup integrity verification is incomplete.",
  BACKUP_RETENTION_EXPIRED: "Backup retention evidence has expired.",
  BACKUP_RETENTION_NEAR_EXPIRY: "Backup retention evidence is nearing expiry.",
  AUDIT_EXPORT_MISSING: "Independent audit export is missing.",
  AUDIT_EXPORT_STALE: "Independent audit export is overdue.",
  AUDIT_EXPORT_INCOMPLETE: "Independent audit export is incomplete.",
  RESTORE_DRILL_MISSING: "No successful recovery drill evidence is available.",
  RESTORE_DRILL_STALE: "Recovery drill evidence is overdue.",
  RESTORE_DRILL_FAILED: "Latest recovery drill did not meet its evidence contract.",
  KEY_RECOVERY_MISSING: "No key-recovery test evidence is available.",
  KEY_RECOVERY_STALE: "Key-recovery test evidence is overdue.",
  KEY_RECOVERY_FAILED: "Key-recovery test did not pass."
});

function exactObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(label + "_SCHEMA_INVALID");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    throw new TypeError(label + "_UNKNOWN_OR_MISSING_FIELD");
  }
}

function isoTime(value, label, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new TypeError(label + "_TIME_INVALID");
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) throw new TypeError(label + "_TIME_INVALID");
  return ms;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(label + "_INTEGER_INVALID");
  return value;
}

function digest(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError(label + "_DIGEST_INVALID");
  return value;
}

function validatePolicy(policy) {
  exactObject(policy, [
    "maxBackupAgeSeconds", "maxAuditAgeSeconds", "maxRestoreDrillAgeSeconds",
    "maxKeyRecoveryAgeSeconds", "retentionWarningSeconds", "maxRpoSeconds", "maxRtoSeconds"
  ], "POLICY");
  for (const key of Object.keys(policy)) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] <= 0) throw new TypeError("POLICY_" + key + "_INVALID");
  }
}

function validateSnapshot(snapshot) {
  exactObject(snapshot, ["schemaVersion", "sourceCheckpoint", "backup", "auditExport", "restoreDrill", "keyRecovery"], "SNAPSHOT");
  if (snapshot.schemaVersion !== 1) throw new TypeError("SNAPSHOT_VERSION_UNSUPPORTED");
  exactObject(snapshot.sourceCheckpoint, ["sequence", "sha256"], "SOURCE_CHECKPOINT");
  nonNegativeInteger(snapshot.sourceCheckpoint.sequence, "SOURCE_SEQUENCE");
  digest(snapshot.sourceCheckpoint.sha256, "SOURCE");
  if (snapshot.backup !== null) {
    exactObject(snapshot.backup, ["sequence", "sha256", "manifestSha256", "createdAt", "retentionUntil", "independentReadbackAt", "digestVerified", "exactGenerationRead", "sourceUnchanged"], "BACKUP");
    nonNegativeInteger(snapshot.backup.sequence, "BACKUP_SEQUENCE");
    digest(snapshot.backup.sha256, "BACKUP");
    digest(snapshot.backup.manifestSha256, "MANIFEST");
    isoTime(snapshot.backup.createdAt, "BACKUP_CREATED");
    isoTime(snapshot.backup.retentionUntil, "RETENTION_UNTIL");
    isoTime(snapshot.backup.independentReadbackAt, "BACKUP_READBACK");
    for (const key of ["digestVerified", "exactGenerationRead", "sourceUnchanged"]) {
      if (typeof snapshot.backup[key] !== "boolean") throw new TypeError("BACKUP_" + key + "_INVALID");
    }
  }
  if (snapshot.auditExport !== null) {
    exactObject(snapshot.auditExport, ["completedAt", "paginationComplete", "independentExport"], "AUDIT_EXPORT");
    isoTime(snapshot.auditExport.completedAt, "AUDIT_COMPLETED");
    for (const key of ["paginationComplete", "independentExport"]) {
      if (typeof snapshot.auditExport[key] !== "boolean") throw new TypeError("AUDIT_" + key + "_INVALID");
    }
  }
  if (snapshot.restoreDrill !== null) {
    exactObject(snapshot.restoreDrill, ["completedAt", "outcome", "checkpointMatched", "independentVerifier", "rpoSeconds", "rtoSeconds"], "RESTORE_DRILL");
    isoTime(snapshot.restoreDrill.completedAt, "RESTORE_COMPLETED");
    if (!["PASS", "FAIL"].includes(snapshot.restoreDrill.outcome)) throw new TypeError("RESTORE_OUTCOME_INVALID");
    for (const key of ["checkpointMatched", "independentVerifier"]) {
      if (typeof snapshot.restoreDrill[key] !== "boolean") throw new TypeError("RESTORE_" + key + "_INVALID");
    }
    nonNegativeInteger(snapshot.restoreDrill.rpoSeconds, "RESTORE_RPO");
    nonNegativeInteger(snapshot.restoreDrill.rtoSeconds, "RESTORE_RTO");
  }
  if (snapshot.keyRecovery !== null) {
    exactObject(snapshot.keyRecovery, ["testedAt", "outcome", "independentRecovery"], "KEY_RECOVERY");
    isoTime(snapshot.keyRecovery.testedAt, "KEY_RECOVERY_TESTED");
    if (!["PASS", "FAIL"].includes(snapshot.keyRecovery.outcome)) throw new TypeError("KEY_RECOVERY_OUTCOME_INVALID");
    if (typeof snapshot.keyRecovery.independentRecovery !== "boolean") throw new TypeError("KEY_RECOVERY_INDEPENDENT_INVALID");
  }
}

function ageSeconds(nowMs, thenMs) {
  if (thenMs > nowMs) throw new TypeError("EVIDENCE_TIMESTAMP_IN_FUTURE");
  return Math.floor((nowMs - thenMs) / 1000);
}

export function evaluateBackupReadiness(snapshot, policy, evaluatedAt) {
  validatePolicy(policy);
  validateSnapshot(snapshot);
  const now = isoTime(evaluatedAt, "EVALUATED_AT");
  const findings = [];
  const add = (code) => findings.push({ code, severity: CRITICAL.has(code) ? "CRITICAL" : "WARNING", message: MESSAGES[code] });

  const b = snapshot.backup;
  if (!b) add("BACKUP_MISSING");
  else {
    if (ageSeconds(now, isoTime(b.createdAt, "BACKUP_CREATED")) > policy.maxBackupAgeSeconds) add("BACKUP_STALE");
    if (b.sequence !== snapshot.sourceCheckpoint.sequence || b.sha256 !== snapshot.sourceCheckpoint.sha256 || !b.sourceUnchanged) add("BACKUP_CHECKPOINT_MISMATCH");
    if (!b.digestVerified || !b.exactGenerationRead || ageSeconds(now, isoTime(b.independentReadbackAt, "BACKUP_READBACK")) > policy.maxBackupAgeSeconds) add("BACKUP_INTEGRITY_UNVERIFIED");
    const retentionMs = isoTime(b.retentionUntil, "RETENTION_UNTIL");
    if (retentionMs <= now) add("BACKUP_RETENTION_EXPIRED");
    else if ((retentionMs - now) / 1000 <= policy.retentionWarningSeconds) add("BACKUP_RETENTION_NEAR_EXPIRY");
  }

  const a = snapshot.auditExport;
  if (!a) add("AUDIT_EXPORT_MISSING");
  else {
    if (ageSeconds(now, isoTime(a.completedAt, "AUDIT_COMPLETED")) > policy.maxAuditAgeSeconds) add("AUDIT_EXPORT_STALE");
    if (!a.paginationComplete || !a.independentExport) add("AUDIT_EXPORT_INCOMPLETE");
  }

  const r = snapshot.restoreDrill;
  if (!r) add("RESTORE_DRILL_MISSING");
  else {
    if (ageSeconds(now, isoTime(r.completedAt, "RESTORE_COMPLETED")) > policy.maxRestoreDrillAgeSeconds) add("RESTORE_DRILL_STALE");
    if (r.outcome !== "PASS" || !r.checkpointMatched || !r.independentVerifier || r.rpoSeconds > policy.maxRpoSeconds || r.rtoSeconds > policy.maxRtoSeconds) add("RESTORE_DRILL_FAILED");
  }

  const k = snapshot.keyRecovery;
  if (!k) add("KEY_RECOVERY_MISSING");
  else {
    if (ageSeconds(now, isoTime(k.testedAt, "KEY_RECOVERY_TESTED")) > policy.maxKeyRecoveryAgeSeconds) add("KEY_RECOVERY_STALE");
    if (k.outcome !== "PASS" || !k.independentRecovery) add("KEY_RECOVERY_FAILED");
  }

  findings.sort((x, y) => FINDING_ORDER.indexOf(x.code) - FINDING_ORDER.indexOf(y.code));
  const criticalCount = findings.filter(x => x.severity === "CRITICAL").length;
  const warningCount = findings.length - criticalCount;
  return Object.freeze({
    schemaVersion: 1,
    evaluatedAt,
    status: criticalCount ? "UNHEALTHY" : warningCount ? "DEGRADED" : "HEALTHY",
    findings,
    counts: { critical: criticalCount, warning: warningCount },
    checkpoint: { sequence: snapshot.sourceCheckpoint.sequence, sha256: snapshot.sourceCheckpoint.sha256 }
  });
}

export function buildAlertEvents(evaluation, existingKeys = [], createdAt = evaluation?.evaluatedAt) {
  exactObject(evaluation, ["schemaVersion", "evaluatedAt", "status", "findings", "counts", "checkpoint"], "EVALUATION");
  if (evaluation.schemaVersion !== 1 || !["HEALTHY", "DEGRADED", "UNHEALTHY"].includes(evaluation.status)) throw new TypeError("EVALUATION_INVALID");
  isoTime(createdAt, "ALERT_CREATED");
  if (!Array.isArray(existingKeys) || existingKeys.some(x => typeof x !== "string")) throw new TypeError("EXISTING_KEYS_INVALID");
  const seen = new Set(existingKeys);
  return evaluation.findings.map(f => {
    if (!f || !FINDING_ORDER.includes(f.code) || !["CRITICAL", "WARNING"].includes(f.severity) || f.message !== MESSAGES[f.code]) throw new TypeError("FINDING_INVALID");
    const idempotencyKey = "mps-backup-alert:v1:" + f.code + ":" + evaluation.checkpoint.sequence + ":" + evaluation.checkpoint.sha256;
    if (seen.has(idempotencyKey)) return null;
    seen.add(idempotencyKey);
    return Object.freeze({ idempotencyKey, code: f.code, severity: f.severity, createdAt, message: f.message });
  }).filter(Boolean);
}

export function createNotificationOutboxRecord(alert, createdAt, maxAttempts = 5) {
  exactObject(alert, ["idempotencyKey", "code", "severity", "createdAt", "message"], "ALERT");
  isoTime(createdAt, "OUTBOX_CREATED");
  if (typeof alert.idempotencyKey !== "string" || !alert.idempotencyKey.startsWith("mps-backup-alert:v1:")) throw new TypeError("ALERT_KEY_INVALID");
  if (!FINDING_ORDER.includes(alert.code) || !["CRITICAL", "WARNING"].includes(alert.severity) || alert.message !== MESSAGES[alert.code]) throw new TypeError("ALERT_CONTENT_INVALID");
  nonNegativeInteger(maxAttempts, "MAX_ATTEMPTS");
  if (maxAttempts < 1 || maxAttempts > 20) throw new TypeError("MAX_ATTEMPTS_INVALID");
  return Object.freeze({ idempotencyKey: alert.idempotencyKey, code: alert.code, severity: alert.severity, message: alert.message, state: "PENDING", attempts: 0, maxAttempts, nextAttemptAt: createdAt, providerMessageId: null });
}

export function beginNotificationAttempt(record, at) {
  validateOutbox(record);
  const now = isoTime(at, "ATTEMPT_AT");
  if (!["PENDING", "RETRY_WAIT"].includes(record.state) || now < isoTime(record.nextAttemptAt, "NEXT_ATTEMPT")) throw new Error("OUTBOX_NOT_DUE");
  if (record.attempts >= record.maxAttempts) throw new Error("OUTBOX_ATTEMPTS_EXHAUSTED");
  return Object.freeze({ ...record, state: "ATTEMPTING", attempts: record.attempts + 1 });
}

export function acknowledgeNotification(record, acknowledgement) {
  validateOutbox(record);
  exactObject(acknowledgement, ["accepted", "messageId"], "PROVIDER_ACK");
  if (record.state !== "ATTEMPTING") throw new Error("OUTBOX_NOT_ATTEMPTING");
  if (acknowledgement.accepted !== true || typeof acknowledgement.messageId !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/.test(acknowledgement.messageId)) throw new Error("PROVIDER_ACK_INVALID");
  return Object.freeze({ ...record, state: "DELIVERED", providerMessageId: acknowledgement.messageId });
}

export function failNotificationAttempt(record, at) {
  validateOutbox(record);
  isoTime(at, "FAILURE_AT");
  if (record.state !== "ATTEMPTING") throw new Error("OUTBOX_NOT_ATTEMPTING");
  if (record.attempts >= record.maxAttempts) return Object.freeze({ ...record, state: "DEAD_LETTER", nextAttemptAt: null });
  const delaySeconds = Math.min(21600, 30 * (2 ** (record.attempts - 1)));
  const nextAttemptAt = new Date(Date.parse(at) + delaySeconds * 1000).toISOString();
  return Object.freeze({ ...record, state: "RETRY_WAIT", nextAttemptAt });
}

function validateOutbox(record) {
  exactObject(record, ["idempotencyKey", "code", "severity", "message", "state", "attempts", "maxAttempts", "nextAttemptAt", "providerMessageId"], "OUTBOX");
  if (typeof record.idempotencyKey !== "string" || !record.idempotencyKey.startsWith("mps-backup-alert:v1:")) throw new TypeError("OUTBOX_KEY_INVALID");
  if (!FINDING_ORDER.includes(record.code) || !["CRITICAL", "WARNING"].includes(record.severity) || record.message !== MESSAGES[record.code]) throw new TypeError("OUTBOX_CONTENT_INVALID");
  if (!["PENDING", "ATTEMPTING", "RETRY_WAIT", "DELIVERED", "DEAD_LETTER"].includes(record.state)) throw new TypeError("OUTBOX_STATE_INVALID");
  nonNegativeInteger(record.attempts, "OUTBOX_ATTEMPTS");
  nonNegativeInteger(record.maxAttempts, "OUTBOX_MAX_ATTEMPTS");
  if (record.maxAttempts < 1 || record.maxAttempts > 20 || record.attempts > record.maxAttempts) throw new TypeError("OUTBOX_ATTEMPTS_INVALID");
  if (record.nextAttemptAt !== null) isoTime(record.nextAttemptAt, "OUTBOX_NEXT");
  if (record.providerMessageId !== null && typeof record.providerMessageId !== "string") throw new TypeError("OUTBOX_PROVIDER_ID_INVALID");
}
