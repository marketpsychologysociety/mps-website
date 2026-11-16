# MPS v4.8 — Independent Source Review Reconciliation

**Review date:** 2026-11-16  
**Repository:** `marketpsychologysociety/mps-website`  
**Branch:** `mps-v4.8-workbench`  
**PR:** #12 — Draft, open, unmerged  
**Reviewed PR head:** `d6654f553debe59dab8396695c7ad10e7b23a59a`  
**Production main baseline:** `9f5d9128f7226b1a53cbcaa1615068e7a7fbc6ff`

## Scope and safety

This is a focused follow-up to the earlier backend row-write audit. It re-read the current candidate `Code.gs`, the deposit rollback test, the canonical remaining-acceptance checklist, the isolated GAS runbook, and the PR metadata. It did not access or modify Apps Script, production Sheets/member rows, Drive ACLs, Script Properties, Telegram configuration, triggers, or deployments.

PR #12 remains Draft and mergeability is currently reported false. No merge or deployment is authorized by this review.

## Reconciliation of earlier source findings

| Earlier finding | Current source observation | Status |
|---|---|---|
| RW-01 — previous pending Telegram links not restored after failed deposit submission | Current `saveDeposit_` snapshots the affected pending link rows before expiring them and restores those snapshots in its rollback path. | **Source correction present; deposit rollback regression exists.** |
| RW-02 — rejection path omitted Telegram-link/access snapshots | Current `adminVerifyApplication_` snapshots rejected pending link rows and the related Telegram access row, then attempts to restore both in its catch path. | **Source correction present; dedicated failure-injection coverage was not established in this review.** |
| RW-03 — incomplete rollback not durably reconciled | `adminVerifyApplication_` now settles its pre-committed decision intent before releasing the transaction lock: clean compensation marks it `CANCELLED`; incomplete compensation marks it `REVIEW`. The incomplete path also attempts to enqueue a non-sensitive `ADMIN_ALERT`; failure to settle the intent is itself added to rollback errors. | **Source mitigation present; isolated harness tests pass on the latest tested SHA. Live Apps Script queue/trigger behavior remains unverified.** |
| RW-04 — post-commit cache failure can report a persisted request as failed | Current `submitCore_` and `adminVerifyApplication_` perform dashboard cache invalidation after the business transaction and catch cache errors as best-effort warnings. | **Source correction present.** |

### Test evidence inspected

- `tests/apps-script/deposit-rollback.test.mjs` contains a successful deposit case, a rollback case restoring the prior application/deposit/link state and cancelling the new link, and an incomplete old-link rollback case that preserves the private proof and raises a reconciliation warning.
- `tests/apps-script/admin-rollback-reconciliation.test.mjs` now includes source-contract assertions and isolated queue-store harness cases for clean cancellation, incomplete-rollback quarantine, and idempotent handling of terminal states.
- These tests exercise the settlement helper with mocked Sheets/SpreadsheetApp services; they do not inject failures into every approval/rejection business write and compensation write inside the complete `adminVerifyApplication_` function.
- This is CI-backed isolated testing, not a live Apps Script execution.

## Current CI evidence

GitHub Actions run **#2002** is the current validation for head `d6654f553debe59dab8396695c7ad10e7b23a59a`. The member-activation, deposit-rollback, and admin rollback-reconciliation test steps completed successfully; Chromium browser checks were still running when this note was prepared. Check the final run conclusion before treating the whole workflow as passed. The workflow uses isolated/mocked services and synthetic tests; it is not live Apps Script acceptance. Earlier run **#2000** passed on its then-current SHA `20774a5d0962bf3d40fdfd71aa66e7e9a0d9d04b`, before the new isolated settlement-helper harness was added.

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
- The pre-committed decision intent is now explicitly settled on rollback: `CANCELLED` after clean compensation and `REVIEW` after incomplete compensation. If intent settlement itself fails, that failure is included in the incomplete-rollback handling.
- The new isolated settlement-helper tests initially exposed a missing `SpreadsheetApp.flush()` mock in CI run #2001. The test harness was corrected; verify run #2002 final status and exact step result before marking the full workflow passed.
- Remaining source-level gap: deterministic failure injection for every approval/rejection business write and compensation write in the full `adminVerifyApplication_` path. Keep production **NO-GO** until operational gates have real, independently inspectable evidence and the owner separately authorizes release.

**Conclusion:** several earlier source-level rollback concerns have since been addressed in the candidate source, so those code paths should not be reimplemented from scratch. The remaining material gap is durable handling and test coverage for incomplete admin-verification compensation, followed by real isolated Apps Script/Telegram/Drive acceptance.