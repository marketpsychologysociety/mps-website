# MPS v4.8 — Independent Source Review Reconciliation

**Review date:** 2026-11-16  
**Repository:** `marketpsychologysociety/mps-website`  
**Branch:** `mps-v4.8-workbench`  
**PR:** #12 — Draft, open, unmerged  
**Reviewed PR head:** `abc66469baf08a157961d7d0849faeb52b331c78`  
**Production main baseline:** `9f5d9128f7226b1a53cbcaa1615068e7a7fbc6ff`

## Scope and safety

This is a focused follow-up to the earlier backend row-write audit. It re-read the current candidate `Code.gs`, the deposit rollback test, the canonical remaining-acceptance checklist, the isolated GAS runbook, and the PR metadata. It did not access or modify Apps Script, production Sheets/member rows, Drive ACLs, Script Properties, Telegram configuration, triggers, or deployments.

PR #12 remains Draft and mergeability is currently reported false. No merge or deployment is authorized by this review.

## Reconciliation of earlier source findings

| Earlier finding | Current source observation | Status |
|---|---|---|
| RW-01 — previous pending Telegram links not restored after failed deposit submission | Current `saveDeposit_` snapshots the affected pending link rows before expiring them and restores those snapshots in its rollback path. | **Source correction present; deposit rollback regression exists.** |
| RW-02 — rejection path omitted Telegram-link/access snapshots | Current `adminVerifyApplication_` snapshots rejected pending link rows and the related Telegram access row, then attempts to restore both in its catch path. | **Source correction present; dedicated failure-injection coverage was not established in this review.** |
| RW-03 — incomplete rollback not durably reconciled | `adminVerifyApplication_` now settles its pre-committed decision intent before releasing the transaction lock: clean compensation marks it `CANCELLED`; incomplete compensation marks it `REVIEW`. The incomplete path also attempts to enqueue a non-sensitive `ADMIN_ALERT`; failure to settle the intent is itself added to rollback errors. Approval rollback also re-discovers a newly appended member row by its generated Member ID if `appendRow` or the following `getLastRow` fails after the server may have accepted the row, then attempts to delete the orphan. | **Source mitigation present; isolated harness tests pass on the latest tested SHA. Live Apps Script queue/trigger behavior remains unverified.** |
| RW-04 — post-commit cache failure can report a persisted request as failed | Current `submitCore_` and `adminVerifyApplication_` perform dashboard cache invalidation after the business transaction and catch cache errors as best-effort warnings. | **Source correction present.** |

### Test evidence inspected

- `tests/apps-script/deposit-rollback.test.mjs` contains a successful deposit case, a rollback case restoring the prior application/deposit/link state and cancelling the new link, and an incomplete old-link rollback case that preserves the private proof and raises a reconciliation warning.
- `tests/apps-script/admin-rollback-reconciliation.test.mjs` now contains 33 passing tests. It includes source-contract checks, isolated queue-store settlement cases, and deterministic failure injection against the complete `adminVerifyApplication_` function for approval and rejection business writes and compensation writes. It also tests an `appendRow` response-loss scenario and verifies the orphan member row is re-discovered and deleted.
- The harness uses mocked Sheets/SpreadsheetApp and synthetic rows; this is CI-backed isolated testing, not a live Apps Script execution.

## Current CI evidence

GitHub Actions run **#2008** completed successfully on head `abc66469baf08a157961d7d0849faeb52b331c78`: **71/71 workflow steps passed**, including the 33/33 admin rollback-reconciliation tests, member activation and deposit rollback regression suites, and Chromium browser checks. Run **#2005** also passed on code head `7126399a92b87d25fce4330cc70dfe571ca2c588`; run #2008 includes the additional approval failure-injection cases. These workflows use isolated/mocked services and synthetic tests; they are not live Apps Script acceptance.

## Remaining operational gates

The canonical checklist and isolated acceptance runbook continue to require:

1. Execute the candidate and isolated acceptance harness in a new standalone Apps Script project, using synthetic-only spreadsheet data.
2. Verify real Sheets persistence, ScriptLock contention, interruption/recovery, quotas, trigger behavior, and cleanup.
3. Test Telegram behavior with a separate test bot/group, including non-`chat_member` handler reconciliation and ambiguous sends.
4. Verify actual Drive folder/file ACL inheritance and direct URL/API authorization against an isolated deployment.
5. Verify the public-center data-only bridge CORS, redirect chain, final response body, and browser fetch behavior in an isolated deployment.
6. Test Android behavior on physical devices; Chromium CI is not a substitute.
7. Complete independent security/operational review, backup/restore and release sign-off.

## Required follow-up

- A durable, non-sensitive `ADMIN_ALERT` is enqueued inside the still-held transaction lock whenever `adminVerifyApplication_` detects incomplete compensation. It contains only Application Ref, decision type, and a stop/reconcile instruction; no member contact, MT5, or proof details. Queue delivery still depends on the configured worker/trigger; a queued alert is not proof of Telegram delivery.
- The pre-committed decision intent is explicitly settled on rollback: `CANCELLED` after clean compensation and `REVIEW` after incomplete compensation. If intent settlement itself fails, that failure is included in incomplete-rollback handling.
- Approval and rejection transaction write/compensation boundaries now have deterministic failure-injection coverage in the isolated harness. The ambiguous member-row append recovery is also exercised.
- Remaining gaps are operational rather than the previously identified source/test gaps: live standalone Apps Script execution with synthetic Sheets, real ScriptLock/trigger behavior, Telegram test-bot delivery, actual Drive ACL inheritance, public-center bridge CORS/fetch behavior, physical Android testing, and independent release sign-off. Keep production **NO-GO** until those gates have independently inspectable evidence and the owner separately authorizes release.

**Conclusion:** several earlier source-level rollback concerns have since been addressed in the candidate source, so those code paths should not be reimplemented from scratch. The remaining material gap is durable handling and test coverage for incomplete admin-verification compensation, followed by real isolated Apps Script/Telegram/Drive acceptance.

## Follow-up audit — pre-mutation admin decision failures (2026-11-16)

A second pass found that the rollback handler attempted to rewrite application/deposit/access snapshots even when validation or durable-intent preparation failed before the first business-sheet mutation. It also attempted to settle a decision-intent row when the enqueue operation had not created one. These unnecessary writes could turn a harmless preflight/configuration error into a false incomplete-rollback alert.

**Correction in candidate source:**
- Validate the admin decision as exactly `approve` or `reject` before acquiring ScriptLock.
- Track whether decision-intent enqueue was attempted and whether the first business mutation began.
- Skip snapshot compensation entirely when no business mutation started.
- Skip intent settlement when enqueue fails with deterministic pre-write conditions: missing spreadsheet ID, missing queue sheet, or queue schema mismatch. These conditions are checked before the enqueue helper appends a row.
- Preserve reconciliation for unknown/ambiguous enqueue failures (including append/flush response loss): those still attempt to locate and cancel/quarantine the durable intent.
- Added regression cases for deterministic queue preflight failures, invalid decision actions, no-op compensation, and continued settlement for ambiguous enqueue errors.
- Updated the existing one-time-link/decision-intent test harness with the required synthetic Script Properties mock.

**Verification:** GitHub Actions run [#2018](https://github.com/marketpsychologysociety/mps-website/actions/runs/43804067318) completed **SUCCESS, 71/71 steps, 0 failures** on exact PR head `7f8974958f8dcee5d7059db36cc0b7b69e05b4d8`. The Admin verification rollback suite and candidate Telegram one-time-link replay suite completed successfully; Chromium browser checks also passed. The admin rollback suite now executes 40 test cases including loop-expanded failure-injection boundaries.

**Scope:** PR #12 remains Draft/open/unmerged, with mergeability reported false. Production `main` remains `9f5d9128f7226b1a53cbcaa1615068e7a7fbc6ff`. No Apps Script deployment, production database/member rows, Drive ACL, Script Properties, Telegram configuration, or production trigger was changed. This CI evidence remains isolated/mocked; real Apps Script acceptance is still outstanding.

## Follow-up audit — MPS MARKET PULSE replacement and Drive publication recovery (2026-11-16)

The previously agreed replacement was implemented in the candidate workbench: the legacy member Heatmap page/menu is removed from the Apps Script portal; the existing Pulse page is replaced (not duplicated) by **MPS MARKET PULSE — XAUUSD M5**, using WIB (UTC+7) and rolling 30/60/120-day windows. The public GitHub Pages preview remains static and marked MEMBER ONLY; its access link points to the Apps Script Pulse page. The backend page whitelist no longer accepts the retired `heatmap` page.

### Dataset conversion and calculation parity
- The supplied source HTML is approximately 18.56 MB and contains 315,360 XAUUSD M5 candles.
- Candle chronology was checked: strict ascending timestamps, no duplicates, and 5-minute spacing throughout. Source range: `2023-11-17T03:25:00+07:00` to `2026-11-16T03:20:00+07:00`.
- Added `scripts/build-market-pulse-dataset.mjs`. It parses only the source `rawData` JSON (does not execute the supplied HTML), computes the three rolling windows at a recorded snapshot time, and emits a data-only HTML file with 288 WIB slots per period.
- Generated compact dataset: 7,507 bytes, 864 period-slot cells, zero empty cells. Snapshot: `2026-11-16T11:48:37+07:00`.
- Independent raw-vs-compact cross-check: **0 mismatches** in UP/DOWN candle counts across all 288 slots for all three windows. Direction classification also matches the source rule: UP/DOWN only when the winning direction exceeds the other by more than 5 percentage points; otherwise NETRAL. The source's ★ rule is preserved for the same non-neutral direction across all three periods.
- The compact upload file is intentionally not committed to the public repository. It is prepared for upload through the Super Admin dataset manager into the private Learning Drive folder.

### Publication rollback hardening
A separate audit found ambiguous-response gaps in Drive publication: Drive could rename the old file or create a new file and then lose the response, leaving local flags/references stale. Publication rollback now reconciles by canonical filename and retained old-file ID, trashes partial new files, restores the old canonical filename, and verifies the final active-file count. Ambiguous trash/rename responses are checked by reading the final state rather than trusting the thrown response alone.

### Verification
- GitHub Actions [run #2047](https://github.com/marketpsychologysociety/mps-website/actions/runs/43806197671): **SUCCESS, 74/74 steps, 0 failures** on tested head `9bf41d96f3b740052b3e103f859169e570602bf1`.
- Admin decision rollback reconciliation: 40/40 tests passed.
- Market Pulse converter/schema/member-and-admin API: 9/9 tests passed.
- Market Pulse Drive publication rollback (mocked Drive): 9/9 tests passed.
- Controlled red-team boundary suite: 8/8 tests passed; see [security simulation report](MPS-CONTROLLED-SECURITY-SIMULATION-2026-11-16.md).
- Chromium browser checks and PWA validation passed.
- Compact upload file SHA-256: `f9cd300f27efe332f5f5fca893e9253752fe9b1200542ed6ceb736aecb8f55c2` (7,507 bytes; not committed to public repository).
- Earlier CI #2035 (72/72) verified the Drive publication fault-injection suite before adding the final red-team/API-boundary checks.

### Remaining boundary / no production claim
The compact dataset has **not** been uploaded to the production Learning Drive folder. No Apps Script deployment, production Drive file/ACL, Script Properties, triggers, member database, or Telegram configuration was changed. The Drive tests are mocked; actual folder/file ACL and upload acceptance still require the authorized Super Admin runtime. PR #12 remains Draft/open/unmerged; production main is unchanged.


## Follow-up verification — Market Pulse stale-source boundary (2026-11-16)

A further independent check found that the first converter draft anchored rolling windows to the conversion timestamp. That can silently shorten the effective sample if a source file is stale. The converter now anchors all 30/60/120-day windows to the timestamp of the latest available candle; the snapshot timestamp remains separate metadata. A regression test uses a source delayed by 59 days and verifies the 30-day sample still ends at the last candle. The member UI also now displays the actual UP share in NETRAL cells rather than a hard-coded 50%.

**Direct source-file verification:** the supplied 18.56 MB HTML was materialized and parsed without executing it. All 315,360 candle records passed strict key, finite-price, positive-price, ascending timestamp, uniqueness, and five-minute-boundary checks. The converter emitted a 7,507-byte data-only HTML payload with 864 cells (288 slots × 3 periods). The generated payload independently passed the backend's timestamp, schema, period, slot-count, nonnegative-integer, and per-period daily-bound checks. A separate raw-source recomputation compared 1,728 UP/DOWN counts (two directions × 288 slots × three periods): **0 mismatches**. The 1/2/4-month slot totals were 7,949 / 15,827 / 31,432; maximum per-slot counts were 30 / 60 / 117 respectively.

**CI:** GitHub Actions [run #2054](https://github.com/marketpsychologysociety/mps-website/actions/runs/43806710625) completed **SUCCESS, 74/74 steps, 0 failures** on exact head `9847996c90cb3a6c4b1a804f99936ba80b014234`. Market Pulse converter/schema/authorization tests: **10/10**; Drive publication rollback tests: **9/9**; Chromium browser checks and PWA validation passed.

**Boundary:** the compact dataset has been generated and locally verified but has **not** been uploaded to any Drive folder. No production deployment, member data, Script Properties, Drive ACL, Telegram configuration, or production triggers were changed. The PR remains a draft workbench; real Apps Script/Drive acceptance and owner release authorization remain outstanding.


## Follow-up verification — rolling-window boundary and Trading Signals Drive ACL (2026-11-16)

A second boundary review tightened the rolling-period cutoff: the start timestamp is exclusive, preventing an exact 30/60/120-day-old candle from becoming an extra sample day. Regression coverage now includes both delayed source conversion and an exact period-boundary candle. The earlier stale-source test fixture was corrected to place its second candle strictly inside the 30-day window.

A separate Trading Signals security review found that checking only `DriveApp.Access.PRIVATE` does not prove the database has no named collaborators. The database guard now also checks the file's editor/viewer lists and every parent folder's link-sharing state and named collaborators. If ACL inspection is unavailable, or any named collaborator exists, Trading Signals fails closed. During first-time database setup, an ACL failure triggers cleanup of the newly created spreadsheet and does not save its Script Property; cleanup failure is surfaced for manual Drive inspection.

**Verification:** GitHub Actions [run #2068](https://github.com/marketpsychologysociety/mps-website/actions/runs/43807696087) completed **SUCCESS, 75/75 steps, 0 failures** on exact head `b80306efba60f8ea5a798af4ed01b8e9fd1bf804`. Targeted suites: Admin decision rollback/reconciliation **40/40**, Market Pulse conversion/schema/authorization **11/11**, Trading Signals API/idempotency/ACL **13/13**, and Chromium browser checks passed. The CI Drive tests remain mocked and do not establish live Google Drive ACL state.

**Boundary:** no production Drive folder/database, Script Properties, Apps Script deployment, member records, Telegram configuration, or live triggers were changed. The compact Pulse data file remains local/unpublished. PR #12 remains Draft/open/unmerged; production main remains unchanged.
