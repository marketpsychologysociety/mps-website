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

- `fixtures/candidate-handler-callsite-snapshot.gs` — exact extracted handler call sites from a separately reviewed candidate Code.gs snapshot, pinned by source SHA-256 and line references; this is not deployable backend code.
- `candidate-handler-callsite-characterization.test.mjs` — runs the pinned source functions in a Node VM with mocked dependencies and records the current missing `update_id`/Telegram event-time propagation across the `chat_member` and all three join-request status paths. Passing reproduces the known gap; it does not mean the gap is acceptable or fixed.
- The candidate handler fixture is a snapshot, not the live Library file. Refresh and re-audit its provenance whenever candidate Code.gs changes.

- `vip-activation-orchestration.mjs` now models a per-member event cursor persisted with member state. It orders state-changing membership events by Telegram event timestamp, then canonical decimal `update_id` as a same-second tie-break. Stale leave/rejoin updates are rejected before they can overwrite newer state. This is an in-memory contract model, not durable Apps Script storage.
