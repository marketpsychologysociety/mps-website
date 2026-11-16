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