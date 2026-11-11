# P1.26 — SQLite Lock Boundaries, WAL Checkpoints, Read Consistency and Backup

**Evidence class:** SYNTHETIC  
**Status:** six focused operational-boundary assertions pass in clean-checkout CI run #437  
**Production decision:** official winner draw **BLOCKED / NO-GO**; roulette **SIMULATION ONLY**

## Objective

Extend P1.24–P1.25 local SQLite validation with lock timeout behavior, WAL snapshot isolation, checkpoint behavior while a reader is active, and a consistent backup of committed WAL data.

## Test artifacts

- `tests/official-draw/sqlite-boundary-worker.mjs`
- `tests/official-draw/sqlite-operational-boundaries.test.mjs`

The tests use temporary local databases and synthetic rows only. The worker supports only two fixed modes: hold a write reservation and hold a read snapshot. No network, cloud service, production data or external provider is used.

## Acceptance scenarios

1. A second writer cannot acquire `BEGIN IMMEDIATE` while a process holds the write reservation; a bounded busy timeout returns a lock/busy error. After the holder commits, a new transaction succeeds.
2. A reader's WAL snapshot remains stable while another connection commits a newer value. After the reader ends its transaction, a new read observes the committed value.
3. A TRUNCATE checkpoint reports busy while a reader holds a snapshot, then completes after that reader releases its snapshot.
4. `VACUUM INTO` produces an integrity-checked snapshot containing committed data still represented in the WAL; the source remains logically unchanged.
5. A backup destination that already exists is not overwritten.
6. A PASSIVE checkpoint reports no busy reader/writer and database integrity remains valid.

## Local/CI verification

Pending. Do not treat a green test result as evidence of real production backup, disaster recovery, or hardware durability.

## Limits

- Same-host, local SQLite file and Node `node:sqlite` only.
- No network filesystem, multi-host, clustered database, cloud backup, immutable retention, off-site recovery or power-loss guarantee.
- `VACUUM INTO` is a local logical snapshot test, not a managed backup service or an independently held recovery copy.
- No production API, OIDC/MFA, human dual control, beacon verification, winner-selection algorithm, participant roster, member data or PII.
- No production DB, cloud project, IAM, billing, credentials, Apps Script, Sheets, Drive, Telegram, DNS, hosting or deployment was accessed or changed.

P1.26 is a synthetic local SQLite experiment only. It does not satisfy operational G0–G11 gates and does not change the official-draw **NO-GO** decision.


## Verification outcome

Clean-checkout GitHub Actions run #437 (`42966034774`) on commit `e0ad3373e5291ab024046b9e8a008806cf89034a`: **SUCCESS**. The P1.26 operational-boundary test step and the full Chromium browser check passed; all workflow steps completed without failures or skips. The P1.26 test file contains five test cases, including multiple checkpoint assertions. This is CI evidence on GitHub's runner, not a separate local run or production test.
