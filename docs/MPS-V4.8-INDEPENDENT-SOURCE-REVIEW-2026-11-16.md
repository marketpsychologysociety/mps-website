# MPS v4.8 — Independent Source Review Reconciliation

**Review date:** 2026-11-16  
**Repository:** `marketpsychologysociety/mps-website`  
**Branch:** `mps-v4.8-workbench`  
**PR:** #12 — Draft, open, unmerged  
**Reviewed PR head:** `90668571e9d2cd36ecea5e07b83b630836587cbf`  
**Production main baseline:** `9f5d9128f7226b1a53cbcaa1615068e7a7fbc6ff`

## Scope and safety

This is a focused follow-up to the earlier backend row-write audit. It re-read the current candidate `Code.gs`, the deposit rollback test, the canonical remaining-acceptance checklist, the isolated GAS runbook, and the PR metadata. It did not access or modify Apps Script, production Sheets/member rows, Drive ACLs, Script Properties, Telegram configuration, triggers, or deployments.

PR #12 remains Draft and mergeability is currently reported false. No merge or deployment is authorized by this review.

## Reconciliation of earlier source findings

| Earlier finding | Current source observation | Status |
|---|---|---|
| RW-01 — previous pending Telegram links not restored after failed deposit submission | Current `saveDeposit_` snapshots the affected pending link rows before expiring them and restores those snapshots in its rollback path. | **Source correction present; deposit rollback regression exists.** |
| RW-02 — rejection path omitted Telegram-link/access snapshots | Current `adminVerifyApplication_` snapshots rejected pending link rows and the related Telegram access row, then attempts to restore both in its catch path. | **Source correction present; dedicated failure-injection coverage was not established in this review.** |
| RW-03 — incomplete rollback not durably reconciled | Both transaction paths collect rollback errors and return a distinct incomplete-rollback error. Public submission also retains its durable request-ledger PENDING state after a business commit has started. The admin verification path does not establish a separate durable reconciliation record when compensation is incomplete. | **Partially mitigated; remains a release blocker.** |
| RW-04 — post-commit cache failure can report a persisted request as failed | Current `submitCore_` and `adminVerifyApplication_` perform dashboard cache invalidation after the business transaction and catch cache errors as best-effort warnings. | **Source correction present.** |

### Test evidence inspected

- `tests/apps-script/deposit-rollback.test.mjs` contains a successful deposit case, a rollback case restoring the prior application/deposit/link state and cancelling the new link, and an incomplete old-link rollback case that preserves the private proof and raises a reconciliation warning.
- The review did not establish equivalent failure-injection coverage for every approval/rejection write and compensation boundary in `adminVerifyApplication_`.
- This is source/test inspection, not a live Apps Script execution.

## Current CI evidence

GitHub Actions run **#1974** is associated with the reviewed PR head and completed successfully. The workflow is named **MPS PWA validation**; its success must not be described as the full 70-step candidate suite or as live Apps Script acceptance. The PR description separately records earlier 70/70 CI evidence on an earlier candidate commit. Re-run the full candidate validation after any code changes and confirm the exact tested SHA.

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

- Add deterministic failure-injection tests for the approval and rejection branches of `adminVerifyApplication_`, covering each business write and each compensation write.
- Add a durable, non-sensitive reconciliation state for incomplete admin-verification rollback, or document and implement an equally reliable operator-visible reconciliation mechanism. Do not claim a clean rollback if any compensation fails.
- Reconcile this finding with the canonical acceptance checklist and require the full candidate CI on the exact resulting head.
- Keep production **NO-GO** until applicable operational gates have real, independently inspectable evidence and the owner separately authorizes release.

**Conclusion:** several earlier source-level rollback concerns have since been addressed in the candidate source, so those code paths should not be reimplemented from scratch. The remaining material gap is durable handling and test coverage for incomplete admin-verification compensation, followed by real isolated Apps Script/Telegram/Drive acceptance.