# P1.28 — Verified SQLite Backup Restore and Recovery Reconciliation

**Evidence class:** SYNTHETIC  
**Status:** seven verified-restore tests pass in clean-checkout CI run #460  
**Production decision:** official winner draw **BLOCKED / NO-GO**; roulette **SIMULATION ONLY**

## Objective

Validate a controlled SQLite recovery sequence: create a consistent logical backup, independently retain expected digest evidence, validate age/schema/bytes/integrity before restore, restore only to a new destination, and read back the exact restored checkpoint. Any ambiguous partial restore is preserved and requires reconciliation rather than blind retry.

## Artifacts

- `tests/official-draw/sqlite-verified-restore.mjs`
- `tests/official-draw/sqlite-verified-restore.test.mjs`

## Acceptance cases

1. `VACUUM INTO` captures committed synthetic rows; source and backup both pass SQLite integrity checks.
2. Restore requires strict manifest schema, separately supplied expected digest evidence, freshness policy, exact byte digest/size, schema fingerprint and SQLite integrity.
3. Restored target is a new file; its digest, schema, page count, integrity and synthetic rows are independently read back.
4. Modified backup bytes are rejected before any target is created.
5. Expired backup and mismatched out-of-band expected evidence are rejected before restore.
6. Existing target/source are never overwritten.
7. Interruption after target creation leaves evidence in place, returns `RESTORE_RECONCILIATION_REQUIRED`, and refuses a blind retry.
8. Unknown manifest fields fail closed.

## Verification outcome

Clean-checkout GitHub Actions run #460 (`42967284731`) on code commit `38b9794ebb054223c523669ba500052140d14f72`: **SUCCESS**. P1.28 tests: 7 PASS, 0 FAIL, 0 SKIP. Full workflow: 29/29 steps successful, 0 failed, 0 skipped; Chromium browser checks passed.

An initial CI attempt found that Node's SQLite row objects use a null prototype, so a strict deep comparison with ordinary object literals failed despite identical field values. The test now normalizes each selected row to an explicit plain object before comparing exact field values. The data assertions and restore checks were retained.

## Trust boundary

The expected digest object is passed separately from the backup manifest in tests to model an independently retained checkpoint. In this synthetic harness, both are generated in the same test process. This is **not** a real independent signature, authenticated external anchor, reviewer attestation, immutable storage receipt or proof of source authenticity.

## Limits

- Same-host local filesystem and Node `node:sqlite` only.
- `VACUUM INTO` is a local logical snapshot, not an off-site or managed backup service.
- No multi-host/network filesystem, physical power-loss, kernel panic, cloud storage, immutable retention, real key recovery or disaster-recovery guarantee.
- Synthetic freshness policy and out-of-band digest are not trusted production time or independent custody.
- No production DB, OIDC/MFA, human dual control, production API, beacon verifier, winner algorithm, participant roster, member data/PII, cloud project, IAM, billing, credentials, Apps Script, Sheets, Drive, Telegram, DNS, hosting or deployment was accessed or changed.

P1.28 is a synthetic local restore contract only. It does not satisfy operational G0–G11 gates and does not change the official-draw **NO-GO** decision.
