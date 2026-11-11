# MPS v4.8 — Isolated Google Apps Script Runtime Acceptance

## Purpose and boundary

This runbook describes the final runtime acceptance step for the v4.8 candidate. It must be performed only in a **new, standalone Google Apps Script project**. Do not paste the harness into the production Apps Script project and do not point it at the production spreadsheet.

The harness creates a new private spreadsheet named \`MPS_ISOLATED_ACCEPTANCE_<timestamp>\` itself. It does not accept a spreadsheet ID. It seeds synthetic member/access/storage rows, executes the candidate's real \`processMpsVipChatMemberEvent_\` path, restores the two Script Properties it temporarily changes, and moves only the spreadsheet it created to Trash in a \`finally\` block.

The harness does not configure a Telegram bot token, make Telegram/network requests, create triggers, deploy a web app, change webhook configuration, or touch the production project/database. It requires the candidate's normal Google Apps Script services (\`SpreadsheetApp\`, \`DriveApp\`, \`PropertiesService\`, \`LockService\`, \`CacheService\`, and \`Utilities\`).

## Preconditions

1. Create a **new standalone** project at https://script.google.com/. Do not open the production MPS Apps Script project.
2. Confirm the project is empty and is not bound to the production spreadsheet.
3. Add the complete \`candidates/Code.gs\` from the same workbench commit as this harness. Keep its functions/constants intact.
4. Add \`tests/telegram-webhook/isolated-gas-acceptance.gs\` as a second script file.
5. Save the project. Do not configure production Script Properties, bot tokens, webhook secrets, or production spreadsheet IDs.

## Execute

From the function selector, select \`runMpsV480IsolatedGasAcceptance\` and run it with this exact argument from the Apps Script editor's execution interface:

\`\`\`javascript
runMpsV480IsolatedGasAcceptance('I_CONFIRM_THIS_IS_A_NEW_STANDALONE_TEST_PROJECT');
\`\`\`

If the editor does not expose function arguments, create a temporary one-line wrapper in the isolated project only, call the function with the exact confirmation string, execute the wrapper once, then remove the wrapper. Never remove the confirmation guard from the harness.

Google will request authorization for the isolated script to create/read a spreadsheet and trash the synthetic file it created. Review the requested scopes before granting. If the project is not clearly isolated, stop without running.

## Acceptance assertions

The harness checks the candidate code itself, not a copied implementation:

- candidate effect-ledger migration adds \`Effect Key\` to synthetic audit and ticker tabs;
- a valid synthetic activation updates \`VIP Access\` and \`Database Member\` columns 28–30;
- activation persists a completed durable intent and member cursor;
- activation creates exactly one keyed ticker effect and one keyed audit effect;
- exact event replay returns \`DUPLICATE\` and adds no duplicate rows;
- a synthetic leave updates both status stores, adds an audit effect, and does not create another join ticker;
- a member-to-admin role-only change is ignored and creates no durable effects.

A successful run returns/logs \`result: PASS\`, \`checkCount\`, and each assertion. The harness restores \`MPS_SPREADSHEET_ID\` and \`MPS_TELEGRAM_VIP_CHAT_ID\` to their prior values and trashes its synthetic spreadsheet in \`finally\`. It also refuses to run if those MPS properties, a bot token, or a webhook secret are already present in the project. If cleanup fails, the run is not considered fully accepted; inspect only the isolated project and the uniquely prefixed synthetic spreadsheet.

## What this does not prove

This is a real Apps Script runtime acceptance test for the tested code paths, but it is not a full live Telegram integration test. It does not test Telegram API permissions, live webhook delivery, real member identities, production sheet migration, production provisioning, browser deployment, or the production database. Those remain separate acceptance gates and require explicit authorization before any production-side action.

## Expected evidence

Record the Apps Script execution timestamp, execution status, \`checkCount\`, and the logged JSON report. Do not record or share tokens, secret values, production spreadsheet IDs, or member personal data. A mock/Node CI pass is not a substitute for this Apps Script runtime result.
