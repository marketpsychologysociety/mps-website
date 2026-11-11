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
