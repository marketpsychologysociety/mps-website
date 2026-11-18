# MPS v4.8 — Isolated Google Apps Script Runtime Acceptance

## Purpose and boundary

This runbook describes the final runtime acceptance step for the v4.8 candidate. It must be performed only in a **new, standalone Google Apps Script project**. Do not paste the harness into the production Apps Script project and do not point it at the production spreadsheet.

The harness creates a new private spreadsheet named `MPS_ISOLATED_ACCEPTANCE_<timestamp>` itself. It does not accept a spreadsheet ID. It seeds synthetic member/access/storage rows, executes the candidate's real `processMpsVipChatMemberEvent_` path, restores the two Script Properties it temporarily changes, and moves only the spreadsheet it created to Trash in a `finally` block.

The harness does not configure a Telegram bot token, make Telegram Bot API HTTP requests, use `UrlFetchApp`, create triggers, deploy a web app, change webhook configuration, or touch the production project/database. It requires the candidate's normal Google Apps Script services (`SpreadsheetApp`, `DriveApp`, `PropertiesService`, `LockService`, `CacheService`, and `Utilities`).

## Preconditions

1. Create a **new standalone** project at https://script.google.com/. Do not open the production MPS Apps Script project.
2. Confirm the project is empty and is not bound to the production spreadsheet.
3. Add the complete `candidates/Code.gs` from the same workbench commit as this harness. Keep its functions/constants intact.
4. Add `tests/telegram-webhook/isolated-gas-acceptance.gs` as a second script file.
5. Save the project. Do not configure production Script Properties, bot tokens, webhook secrets, or production spreadsheet IDs.

## Execute

The standard Apps Script editor's Run button does not provide a general-purpose argument prompt. The safest reproducible method is to add a temporary one-line wrapper in the isolated project only:

```javascript
function runIsolatedAcceptanceOnce() {
  return runMpsV480IsolatedGasAcceptance(
    'I_CONFIRM_THIS_IS_A_NEW_STANDALONE_TEST_PROJECT'
  );
}
```

Select `runIsolatedAcceptanceOnce`, run it once, then remove the wrapper after the execution record has been captured. Never remove or weaken the confirmation guard in the harness. If the execution environment explicitly supports passing function arguments, the harness may instead be invoked with the exact confirmation string directly.

Google will request authorization for the isolated script to create/read a spreadsheet and trash the synthetic file it created. Review the requested scopes before granting. If the project is not clearly isolated, stop without running.

## Acceptance assertions

The harness checks the candidate code itself, not a copied implementation:

- candidate effect-ledger migration adds `Effect Key` to synthetic audit and ticker tabs;
- a valid synthetic activation updates `VIP Access` and `Database Member` columns 28–30;
- activation persists a completed durable intent and member cursor;
- activation creates exactly one keyed ticker effect and one keyed audit effect;
- exact event replay returns `DUPLICATE` and adds no duplicate rows;
- a synthetic leave updates both status stores, adds an audit effect, and does not create another join ticker;
- a member-to-admin role-only change is ignored and creates no durable effects.

A successful run returns/logs `result: PASS`, `checkCount`, and each assertion. The harness restores `MPS_SPREADSHEET_ID` and `MPS_TELEGRAM_VIP_CHAT_ID` to their prior values and trashes its synthetic spreadsheet in `finally`. It also refuses to run if those MPS properties, a bot token, or a webhook secret are already present in the project. If cleanup fails, the run is not considered fully accepted; inspect only the isolated project and the uniquely prefixed synthetic spreadsheet.

## Evidence record

Complete one record for each actual Apps Script runtime execution. Use `NOT RUN` until a real isolated GAS execution has occurred; do not fill in a PASS based on GitHub Actions, Node mocks, or source review.

| Field | Record |
|---|---|
| Acceptance record ID | |
| Apps Script project | New standalone / isolated (confirm: yes/no) |
| Execution timestamp (include timezone) | |
| Candidate workbench commit SHA | |
| Candidate `Code.gs` SHA-256 (if captured) | |
| Harness commit SHA | |
| Harness file SHA-256 (if captured) | |
| Execution function | `runIsolatedAcceptanceOnce` |
| Result | NOT RUN / PASS / FAIL / BLOCKED |
| `checkCount` | |
| Assertion summary | |
| Cleanup result | Synthetic spreadsheet trashed / cleanup failed / not confirmed |
| Script Properties restored | Yes / No / Not confirmed |
| Sanitized execution log/report location | |
| Reviewer notes | |

**Evidence handling:** retain the Apps Script execution ID and sanitized JSON report if available. Redact all tokens, secret values, spreadsheet IDs, member names, Telegram user IDs, email addresses, and other personal data before sharing logs. Do not paste raw execution logs into a public issue or pull request. A runtime PASS requires all assertions to pass, property restoration to be confirmed, and the exact synthetic spreadsheet to be trashed. Any cleanup or restoration uncertainty means the result is not PASS.

## Failure and recovery protocol

1. **Confirmation/precondition guard fails:** stop immediately. Do not bypass the guard, remove properties, or retry in another project. Verify that this is a newly created standalone project. If it is not unquestionably isolated, abandon it.
2. **Unexpected MPS property, bot token, or webhook secret detected:** do not run. Do not copy, disclose, or modify the secret. Abandon that project and create a fresh standalone project with no MPS configuration.
3. **Authorization or service/scope error:** stop and read the exact requested scope/error. Grant only the scopes required by this harness in the isolated project. Never authorize or test through the production project. If the scope request is broader than spreadsheet/Drive/property/runtime needs described here, do not approve it; mark the run BLOCKED and investigate.
4. **Assertion fails or execution throws:** preserve the execution ID, timestamp, failing assertion, and sanitized stack/error text. Do not rerun against a different spreadsheet, do not manually change synthetic/production rows, and do not mark the candidate accepted. The harness's `finally` block should restore temporary properties and trash the exact spreadsheet it created; independently verify both outcomes in the isolated project.
5. **Synthetic spreadsheet cleanup fails:** mark FAIL/BLOCKED, capture the exact generated name `MPS_ISOLATED_ACCEPTANCE_<timestamp>`, and inspect only the Drive of the isolated project owner for that exact name. Trash only the file whose ownership/creation is confirmed to be from this execution. Never delete by a guessed ID, broad name search, or arbitrary spreadsheet selection.
6. **Temporary Script Properties restoration fails:** stop using that isolated project. Inspect only the two keys `MPS_SPREADSHEET_ID` and `MPS_TELEGRAM_VIP_CHAT_ID` in that isolated project. Restore their recorded pre-run values only when independently known from the pre-run state; otherwise abandon the isolated project and do not reuse it. Do not inspect or alter production Script Properties.
7. **Harness/source mismatch:** if candidate and harness were not copied from the same documented workbench commit, discard the result and restart only after matching both files to the same commit. Do not patch a running test ad hoc.
8. **After any failure:** no production migration, storage provisioning, webhook change, Telegram call, deployment, or live database repair is part of recovery. Those are separate operations requiring explicit authorization.

## What this does not prove

This is a real Apps Script runtime acceptance test for the tested code paths, but it is not a full live Telegram integration test. It does not test Telegram API permissions, live webhook delivery, real member identities, production sheet migration, production provisioning, browser deployment, or the production database. Those remain separate acceptance gates and require explicit authorization before any production-side action.

## Current acceptance status

The isolated harness and this procedure can be statically reviewed and validated in CI. Until a real execution has been completed in a new standalone Apps Script project, the actual GAS runtime acceptance status remains **NOT RUN**. A mock/Node CI pass is not a substitute for this runtime result.
