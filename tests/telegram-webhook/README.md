# Telegram webhook journal tests

Run the synthetic contract and mocked Apps Script adapter tests with Node.js:

```sh
node --test tests/telegram-webhook/*.test.mjs
```

## Files

- `durable-update-journal.mjs` — injected-store state machine for update deduplication, retry, reconciliation, claim fencing, and manual review.
- `durable-update-journal.test.mjs` — contract tests using SharedMemoryJournalStore. The shared in-memory Map simulates adapter recreation only; it is not durable production storage.
- `gas-spreadsheet-journal-adapter.gs` — isolated Google Apps Script spreadsheet adapter candidate. It is not connected to doPost/processTelegramUpdate_ and does not create a sheet, read Script Properties, or select a spreadsheet implicitly.
- `gas-spreadsheet-journal-adapter.test.mjs` — Node VM tests with mocked SpreadsheetApp, LockService, and Utilities. These do not run inside Google's Apps Script runtime.

## Important boundaries

- The adapter requires an explicit isolated spreadsheet ID, exact pre-provisioned tab schema, and a single writer Apps Script project.
- LockService serializes cooperating executions in the same Apps Script project; Google Sheets is not a transactional database.
- The adapter must not be enabled against production data or wired into the production webhook without separate approval.
- No exactly-once guarantee is claimed. Ambiguous Telegram side effects require reconciliation or REVIEW.
- Passing these tests is not proof of deployed Apps Script quotas, persistence, concurrency, Telegram API behavior, or real-device behavior.

- `fixtures/candidate-handler-callsite-snapshot.gs` — read-only text-normalized candidate Code.gs snapshot derived from Library source SHA-256 `c9e84512fc2ac641f59f63b9b8b7fa10d113f0256f662c25ca70555a09aea8ba`, with its own fixture SHA-256 `70a2fb84ecef7e01eb86dcd95f1481ca3857e7953c6fbae2362b3314dcb64441`; text extraction may normalize bytes/newlines, so it is not claimed byte-identical; test fixture only, never deploy from this path.
- `candidate-handler-callsite-characterization.test.mjs` — extracts and executes the actual `processTelegramUpdateCore_`, `processVipJoinRequest_`, `updateVipJoinStatus_`, and `recordMpsAudit_` function bodies from the pinned candidate snapshot in a Node VM with mocked dependencies. Seven tests characterize the four missing metadata call paths, status-before-effects ordering under one ScriptLock, and swallowed audit persistence errors. Passing reproduces known gaps; it does not mean the gaps are acceptable or fixed.
- The candidate handler fixture is a snapshot, not the live Library file. Refresh and re-audit its provenance whenever candidate Code.gs changes.

- `vip-activation-orchestration.mjs` now models a per-member event cursor persisted with member state. It orders state-changing membership events by Telegram event timestamp, then canonical decimal `update_id` as a same-second tie-break. Stale leave/rejoin updates are rejected before they can overwrite newer state. This is an in-memory contract model, not durable Apps Script storage.
