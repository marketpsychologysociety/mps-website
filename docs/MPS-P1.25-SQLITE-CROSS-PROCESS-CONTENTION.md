# P1.25 — SQLite Cross-Process Contention and Crash-Recovery Tests

**Evidence class:** SYNTHETIC  
**Status:** five focused child-process tests pass locally and in clean-checkout CI run #430  
**Production decision:** official winner draw **BLOCKED / NO-GO**; roulette **SIMULATION ONLY**

## Objective

P1.24 verified SQLite transaction atomicity and idempotency within a single Node.js process. P1.25 adds independent Node.js processes and database connections against the same temporary, file-backed SQLite database. It checks serialization under concurrent writes, idempotency replay/conflict behavior across processes, and recovery after controlled child-process termination around the transaction commit boundary.

## Artifacts

- `tests/official-draw/sqlite-contention-worker.mjs`
- `tests/official-draw/sqlite-process-contention.test.mjs`
- Updated `tests/official-draw/sqlite-transactional-store.mjs` with two fault-injection points restricted to the isolated test worker.
- Dedicated CI command: `node --test tests/official-draw/sqlite-process-contention.test.mjs`

The worker accepts only synthetic fixture arguments from the test harness. Every database is created in a temporary operating-system directory and removed by test cleanup. No external package or network service is required.

## Scenarios and invariants

1. Two independent processes use different idempotency keys against the same draw/version. Exactly one state transition succeeds; the other sees a stale version. Exactly one operation and one outbox row remain.
2. Two processes submit the same key and canonical payload. One performs the operation; the other replays the committed result. There is one state transition, operation, and outbox row.
3. Two processes reuse one idempotency key with different payloads. One succeeds and the other receives an idempotency conflict; no duplicate side effect is recorded.
4. A child process exits after writing draw, idempotency, and outbox changes but before COMMIT. On reopen, SQLite recovery exposes the complete pre-transaction state; a retry can then execute once.
5. A child process exits immediately after COMMIT and before it can return a response. On reopen, the committed state and one outbox row remain; retry returns the original result without a second effect.

The two crash points deliberately call `process.exit()` inside the isolated child process. Exit code 86 identifies the pre-commit termination and 87 the post-commit/pre-response termination. These are controlled process-exit tests, not hardware power-loss tests.

## Local verification

Local Node.js 22.16.0 run:

- 5 tests passed
- 0 failed
- 0 skipped
- `node --check` passed for the adapter, worker, and test file.
- The expected Node `node:sqlite` experimental-feature warning was emitted.

The local test workspace used a temporary mirror of the P1.23 canonical JSON function; the clean-checkout CI run imports the repository's actual P1.23 module. The local result therefore confirms the multi-process test mechanics and SQLite behavior, while CI is the integration check against the branch's exact dependency.

## Explicit limitations

- Same-host local SQLite file only. This is not multi-host, network-filesystem, clustered, or horizontally scaled database validation.
- Controlled Node child-process exit is not physical power loss, kernel panic, storage-controller failure, filesystem corruption, or off-site disaster recovery.
- SQLite WAL and `synchronous=FULL` do not prove hardware-level durability or cloud backup guarantees.
- No real OIDC/MFA, session, CSRF, human dual control, production API, notification worker/provider, beacon verifier, winner-selection algorithm, participant roster, member data, or PII.
- Outbox rows remain local synthetic records; no notification is delivered.
- No production database, cloud project, IAM, billing, credentials, Apps Script, Sheets, Drive, Telegram, DNS, hosting, or deployment was used or changed.

P1.25 is a local synthetic concurrency/recovery experiment only. It does not satisfy operational G0–G11 gates and does not change the official draw **NO-GO** decision.


## Verification outcome

- Local Node.js 22.16.0: 5 PASS, 0 FAIL, 0 SKIP; syntax checks passed for the adapter, worker and test file.
- Clean-checkout GitHub Actions run #430 (`42965435791`) on commit `dcd8cb59c10df9612dcc2208fc505cd95ba58d75`: **SUCCESS**. The P1.25 process-contention step passed, all other synthetic suites passed, and Chromium browser checks passed; no failed or skipped steps were reported.
- An earlier CI attempt exposed a test-harness newline-framing mismatch; it was corrected and the final clean-checkout run #430 passed. This is recorded rather than treating the earlier failure as a successful run.
