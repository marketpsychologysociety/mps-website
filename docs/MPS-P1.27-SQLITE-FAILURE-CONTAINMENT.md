# P1.27 — SQLite Failure Containment and Fail-Closed Integrity

**Evidence class:** SYNTHETIC  
**Status:** implementation and clean-checkout verification pending  
**Production decision:** official winner draw **BLOCKED / NO-GO**; roulette **SIMULATION ONLY**

## Objective

Exercise controlled local SQLite failure modes and verify that failures do not silently create partial writes, that read-only access cannot mutate data, and that a damaged database copy is rejected without automatically overwriting or repairing evidence.

## Artifacts

- `tests/official-draw/sqlite-failure-containment.test.mjs`

## Acceptance cases

1. A connection in SQLite `query_only` mode rejects writes and preserves the original committed value after close/reopen.
2. A bounded `max_page_count` produces a controlled database-full write failure. The explicit transaction is rolled back; no partial row remains and integrity is `ok` after reopen.
3. A copy with a deliberately damaged SQLite header fails closed at integrity/read time, while the original database remains healthy.
4. A damaged copy is not silently repaired, replaced, or overwritten after a failed read; its bytes remain preserved for investigation and the original source remains healthy.

## Verification

Pending clean-checkout CI. This suite uses local temporary files and a deliberately corrupted copy only. No production database or member data is used.

## Limits

- `query_only` simulates SQLite connection-level read-only enforcement; it is not a test of operating-system permissions, mounted read-only volumes, or cloud IAM.
- `max_page_count` simulates a database-full condition; it is not a real disk quota, filesystem exhaustion, cloud-volume failure, or storage-controller fault.
- Header corruption is a controlled synthetic corruption case, not an exhaustive corruption/fuzzing campaign.
- No automatic repair is attempted. Recovery must use a separately verified backup and independent authorization; this test does not authorize production restore.
- Same-host local SQLite only; no multi-host, network filesystem, physical power-loss, cloud backup, immutable retention, or disaster-recovery guarantee.
- No OIDC/MFA, human dual control, production API, beacon verifier, winner algorithm, participant roster, member data or PII.
- No production DB, cloud project, IAM, billing, credentials, Apps Script, Sheets, Drive, Telegram, DNS, hosting or deployment was accessed or changed.

P1.27 is a synthetic failure-containment experiment only. It does not satisfy operational G0–G11 gates and does not change the official-draw **NO-GO** decision.
