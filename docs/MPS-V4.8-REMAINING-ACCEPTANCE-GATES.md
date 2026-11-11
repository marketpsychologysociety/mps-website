# MPS v4.8 remaining acceptance gates

**Snapshot:** 2026-11-11  
**Scope:** workbench / Draft PR #12 only. This checklist separates verified repository checks from work that still requires an isolated Google Apps Script environment, a Telegram test bot/group, or explicit production authorization.

## Verified in the workbench

- [x] Latest PR workflow run #646 completed successfully on commit `c26289da4ba71efe9cea7deb3526527c30e50e80`.
- [x] All 36 workflow steps succeeded, including the Telegram update-journal contract, mocked Apps Script spreadsheet adapter, schema inspector, and Chromium browser checks.
- [x] Telegram journal contract suite contains 16 tests.
- [x] Mocked Apps Script spreadsheet adapter suite contains 17 tests.
- [x] The adapter candidate is deliberately isolated: it requires an explicit spreadsheet ID and pre-provisioned exact schema; it does not create a sheet, select a spreadsheet implicitly, or connect to `doPost/processTelegramUpdate_`.
- [x] Public Center frontend now parses a data-only response instead of executing cross-origin Apps Script JavaScript. Chromium tests exercise a mocked CORS endpoint and reject an appended executable payload.
- [x] The public-center feature flag remains disabled in the workbench configuration pending live CORS/redirect acceptance.
- [x] Telegram handler source-review matrix records retry/reconciliation gaps, including one-time link replay, notification delivery, VIP status side effects, and VIP reactivation ticker deduplication.

## Still open — required before any production proposal

### A. Apps Script durable journal runtime acceptance

- [ ] Provision a separate test spreadsheet with the exact journal tab schema.
- [ ] Deploy the adapter in a separate Apps Script project with a single writer.
- [ ] Run tests inside Google's Apps Script runtime for persistence, ScriptLock contention, execution interruption, quotas, latency, and malformed/duplicate rows.
- [ ] Verify backup/restore and journal integrity under interruption.
- [ ] Decide whether Sheets has adequate durability and operational headroom; otherwise use a transactional external datastore.
- [ ] Only after runtime acceptance, design a separately reviewed integration into the webhook. Do not replace CacheService in production by assumption.

### B. Telegram handler idempotency and outbox

- [ ] Implement handler-specific reconciliation for every update type in the handler matrix.
- [ ] Reconcile already-consumed one-time links to the exact same Telegram user/chat; reject different identities.
- [ ] Introduce effect-level outbox semantics for welcome DMs, group notices, ticker events, audit records, invite revocation, moderation actions, and admin alerts.
- [ ] Define the duplicate-versus-loss policy for Telegram `sendMessage` because the API does not provide a caller-supplied idempotency key or reliable lookup by our effect key.
- [ ] Give each VIP activation transition a distinct effect key; do not deduplicate all future activations solely by member ID.
- [ ] Exercise each handler with mocked Telegram and spreadsheet adapters, then with a separate Telegram test bot/group.

### C. Public Center live transport

- [ ] Verify the Apps Script deployment's CORS headers, redirect chain, final response body, and browser fetch behavior from an isolated deployment.
- [ ] Confirm the JSON envelope and fallback behavior against the actual deployed candidate.
- [ ] Keep the feature flag disabled until the live transport test passes. Do not restore JSONP or executable script injection as a workaround.

### D. Operational and release controls

- [ ] Define journal/outbox monitoring, stuck-lease recovery, REVIEW triage, retention, backup, and restore runbooks.
- [ ] Complete independent security and privacy review of the final integrated candidate.
- [ ] Re-run full CI after integration and capture evidence from isolated runtime tests.
- [ ] Obtain explicit approval for any production schema change, Script Properties change, webhook switch, live Telegram action, or deployment.

## Explicit non-claims

A passing GitHub Actions run proves only the repository's automated checks, including synthetic/mocked tests and local Chromium checks. It does **not** prove live Apps Script persistence, real spreadsheet locking, Telegram API behavior, production CORS/redirect behavior, physical Android behavior, or production readiness.

The Apps Script adapter is not wired into the webhook. The current webhook candidate still uses CacheService for update-level PROCESSING/DONE state. The public-center feature flag remains disabled. No production migration or deployment is authorized by this checklist.

**Release status: NO-GO for production activation until the relevant gates above are evidenced and separately approved.**
