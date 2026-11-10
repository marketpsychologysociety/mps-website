# MPS v4.8 — Isolated Backend Failure-Injection Test Plan

**Status:** Test design only. No Apps Script runtime or live spreadsheet has been exercised.
**Target:** A disposable Apps Script test project bound to a synthetic spreadsheet and synthetic Drive folder. Never point this suite at production IDs, production Script Properties, member rows, proof folders, or the live Telegram bot.

## Read-only schema inspection

The helper `scripts/mps-readonly-schema-inspector.gs` accepts an explicitly supplied Spreadsheet object. It inspects only sheet existence, row/column counts, and row-1 headers for the four known schema contracts. It does not open a spreadsheet by ID, create missing sheets, write values, format cells, or read member rows.

The Node test `scripts/test-readonly-schema-inspector.mjs` executes that helper in a VM with synthetic sheet objects and verifies:
- exact 30/15/14/11-header fixture reports MATCH;
- an 18-column legacy Database Member reports MISMATCH at column 19;
- missing auxiliary sheet reports MISSING and is not created;
- altered header reports the first mismatch;
- invalid spreadsheet argument is rejected;
- write methods are never invoked and report contains no row payload.

The CI check is a mock-object contract test, not a connection to Google Sheets. A human/operator must still run the helper against an authorized clone before any migration decision. The helper intentionally omits the VIP Access sheet because its canonical header contract has not yet been established from a verified live schema.

## Required failure-injection architecture

Do not add arbitrary production failpoints or test switches to the live web app. In a disposable Apps Script project, isolate the write orchestration behind a test-only adapter with the same operations and ordering as the candidate code:

- read/write bounded ranges;
- append and delete a newly inserted test row;
- create/delete a synthetic proof file;
- create/update a synthetic Telegram-link row;
- record audit entries;
- throw at a deterministic operation index.

The adapter must be injected by the test harness, not selected from request parameters or public API input. Production code must not expose a caller-controlled failure switch.

## Approval flow matrix

For every write boundary in the isolated approval flow, inject a failure immediately after the operation and again during each compensating rollback operation. Verify:
1. no duplicate member row remains;
2. application/deposit/Telegram-link snapshots are restored where rollback succeeds;
3. rollback failure is surfaced as an explicit reconciliation-required result, never reported as a clean rollback;
4. audit trail records the failed operation and rollback outcome without secrets or proof contents;
5. retry is idempotent or is blocked pending reconciliation;
6. ScriptLock is released on every path.

Include concurrency tests with two simultaneous approvals for the same Application Ref. Exactly one may create the member row.

## Deposit submission matrix

Inject failures after proof-file creation, deposit row append, application status update, Telegram-link creation, and each cleanup step. Verify:
1. no orphan proof file remains after successful compensation;
2. no duplicate pending deposit row is created on retry;
3. application status and deposit status cannot disagree silently;
4. cleanup failure is visible and produces a reconciliation record;
5. uploaded content remains private and is validated by signature, MIME, and size before persistence.

## Migration matrix

Run only against a cloned synthetic spreadsheet. Test exact 18-column input, already migrated 30-column input, reordered/renamed headers, unexpected trailing non-empty cells, blank rows, formulas, and interrupted append. Verify legacy columns 1–18 remain value-identical, no column is reordered/deleted, a second run is idempotent, and an interrupted migration stops safely for manual reconciliation. Do not automatically resume if the post-failure state is ambiguous.

## Candidate-specific failure points now confirmed by static review

- Deposit flow: inject failure after each old pending Telegram-link row is changed to `Diganti`; verify all prior link states are restored if the deposit submission aborts.
- Rejection flow: inject failure after each Telegram-link row is changed to `Ditolak` and after the Telegram Access row is changed to `Akses Ditolak`; verify those rows are restored together with application/deposit snapshots.
- Every rollback step: inject a second failure during compensation; verify the system records reconciliation-required rather than silently swallowing the error or reporting a clean rollback.
- Submission post-commit: inject failures in dashboard cache invalidation and request-result cache writes after the Sheets/Drive persistence succeeds; verify the caller is not told that persistence failed when it actually committed.

These four risks are static-source findings documented in `MPS-v4.8-BACKEND-ROW-WRITE-AUDIT.md`. They have not yet been reproduced by runtime injection.

## Acceptance and evidence rules

- Record Apps Script execution logs, synthetic fixture hashes, injected operation index, before/after schema snapshots, and rollback outcome.
- Keep member names, Telegram identifiers, PIN hashes, proof bytes, tokens, and credentials out of test logs.
- Separate PASS for pure Node mock tests from PASS for actual Apps Script runtime tests.
- No production mutation, migration, deployment, or Telegram/Drive operation is permitted as part of this suite.
- If the isolated Apps Script project or disposable spreadsheet is not available, mark runtime failure injection NOT TESTED; do not replace it with a simulation and call it complete.
