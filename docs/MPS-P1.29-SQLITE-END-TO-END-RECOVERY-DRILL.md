# P1.29 — End-to-end SQLite recovery drill and checkpoint reconciliation

**Status:** synthetic local verification only. **Not production recovery evidence.**

## Objective

Compose the P1.26 operational-boundary checks, P1.27 failure containment, and P1.28 verified backup/restore into one repeatable drill. The drill selects a caller-supplied expected checkpoint, creates a local SQLite logical backup, restores only to a new target, and reconciles every user table against the expected checkpoint.

## Controls

- The expected checkpoint has an exact schema and contains a schema SHA-256, deterministic logical-content SHA-256, and row counts for every user table.
- The logical digest includes all rows from all non-internal tables; rows are canonically serialized and sorted so row-return order does not change the digest.
- Source integrity and checkpoint are checked before backup; the restored database is checked against the same expected checkpoint; source is checked again to prove the drill did not mutate it.
- Source, backup and restore paths must be distinct. Restore never overwrites an existing target.
- Missing, malformed, stale, altered or mismatched checkpoint evidence fails closed.
- Fault points after backup, during restore, and after restore preserve artifacts and return reconciliation-required errors. The harness never auto-deletes or silently retries an ambiguous artifact.
- The focused suite uses synthetic participant/draw/idempotency/outbox rows only.

## Verification

Seven tests cover complete multi-table restore, exact row counts and logical digest, missing/malformed/mismatched checkpoint, altered table counts, backup interruption, partial restore interruption, source mutation detection, and structurally valid logical-row tampering.

CI is the authoritative execution record for the repository commit. Local synthetic checks may be run with:

```sh
node --test tests/official-draw/sqlite-recovery-drill.test.mjs
```

## Evidence limits and release decision

The expected checkpoint in this test suite is generated locally from the same synthetic fixture. The drill does **not** authenticate an independent checkpoint authority, external signature, provider receipt, immutable/off-site backup, real IAM/MFA, multi-host storage, physical power-loss recovery, production database, member roster, or disaster-recovery objectives. It is a stronger local reconciliation test, not independent operational proof.

No production database, cloud resource, billing, IAM, credential, Apps Script, Sheets, Drive, Telegram, DNS, hosting, deployment, or member data is accessed or changed. Official winner draw remains **BLOCKED / NO-GO**; MPS Lucky Roulette remains **SIMULATION ONLY**.
