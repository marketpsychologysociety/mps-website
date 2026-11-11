# MPS P1.17 — Backup Integrity Monitoring & DR Readiness

**Status:** offline deterministic contract and synthetic tests only.  
**Branch:** `mps-v4.8-workbench`.  
**Production impact:** none.  
**Monitoring / notification provisioning:** not started and not authorized.  
**Official draw:** BLOCKED / NO-GO; roulette remains SIMULATION ONLY.

## Objective

P1.16 defines what an off-site backup and recovery drill must prove. P1.17 defines how normalized evidence should be evaluated over time, how stale or failed controls become actionable findings, and how alert delivery must be represented without falsely claiming a notification was sent.

## Evidence monitored

The strict schema binds an evaluation to an independently expected source checkpoint and accepts only:

- backup sequence and SHA-256, manifest digest, creation time, retention deadline, exact-generation readback time, digest-verification assertion and source-preservation assertion;
- independent audit-export completion time, complete pagination assertion and independent-export assertion;
- latest restore-drill time/outcome, expected-checkpoint match, independent verifier, measured RPO and RTO;
- latest key-recovery test time/outcome and independent recovery assertion.

Policy thresholds are explicit inputs, not hard-coded MPS service objectives. Current test fixtures use illustrative thresholds only. Unknown/missing fields, malformed hashes, invalid times and future-dated evidence fail closed.

## Readiness states

- **HEALTHY:** no finding in the supplied normalized evidence.
- **DEGRADED:** warning only (currently retention nearing expiry).
- **UNHEALTHY:** one or more critical findings, including missing/stale backup, checkpoint mismatch, unverified exact-generation readback, expired retention, missing/stale/incomplete independent audit export, missing/stale/failed restore drill, or missing/stale/failed key-recovery evidence.

No numeric readiness score is produced. A score would imply measured real-world availability or resilience that this offline envelope cannot establish. Findings are deterministic, ordered, and carry fixed non-sensitive messages.

## Alert and notification contract

Alert idempotency keys bind finding code to exact source sequence and digest. Re-evaluation of the same finding/checkpoint does not create a duplicate alert. A changed checkpoint yields a new alert identity.

Outbox states:

1. `PENDING` — eligible for an attempt;
2. `ATTEMPTING` — an attempt has been explicitly started;
3. `DELIVERED` — only after an accepted provider acknowledgement with a message ID;
4. `RETRY_WAIT` — failed attempt with bounded exponential backoff;
5. `DEAD_LETTER` — retry limit exhausted; requires separate reconciliation.

The contract never marks a notification delivered merely because an attempt was started or a request was prepared. The code does not call a provider, schedule retries, send messages, or create a webhook. Provider acknowledgement fields are only synthetic test inputs.

## Test coverage

Run:

```sh
node --test tests/official-draw/backup-readiness-monitor.test.mjs
```

Seventeen cases cover a healthy evidence envelope; missing/stale backup; source checkpoint fork; missing exact-generation readback; expired/near-expiry retention; incomplete/stale or missing audit export; missing/stale/failed restore drill; failed/missing key recovery; unknown fields/future timestamps; malformed digest/unsafe policy; alert idempotency/privacy; explicit provider acknowledgement; bounded retry/dead-letter; and invalid outbox transitions.

## Trust boundary and non-actions

This evaluator validates the structure and internal consistency of caller-supplied normalized assertions. It does **not** authenticate provider APIs, prove the underlying backup exists, verify actual object generation/retention/IAM/KMS, authenticate raw audit logs, prove independent reviewer identity, measure actual RPO/RTO, or establish production availability. The input must be sourced and independently authenticated before any real operational use.

No cloud project, bucket, billing, IAM, service account, KMS key, audit sink, monitoring service, scheduler, webhook, email/Telegram integration, credential, production log, member record, Apps Script deployment, or live notification was created or changed. No irreversible retention control was enabled.

## Exit criteria

P1.17 is complete only as an offline evidence-evaluation and notification-state contract after clean-checkout CI passes. Real monitoring, authenticated evidence ingestion, operational alert delivery, incident response, provider recovery and approved MPS RPO/RTO objectives remain **NOT STARTED**.
