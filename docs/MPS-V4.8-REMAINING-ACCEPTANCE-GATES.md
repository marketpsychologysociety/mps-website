# MPS v4.8 remaining acceptance gates

**Snapshot:** 2026-11-11  
**Scope:** workbench / Draft PR #12 only. This checklist separates verified repository checks from work that still requires isolated Google Apps Script, Telegram test infrastructure, Android-device testing, independent review, or explicit production authorization.

## Verified in the workbench

- [x] PR CI run #648 and push CI run #647 both completed successfully on commit `c69943452c36c46b720b59034d83f327debc5b12`; each run completed all 36 workflow steps, including Chromium browser checks.
- [x] The earlier PR CI run #646 also completed all 36 steps successfully on its then-current commit.
- [x] Telegram journal contract suite contains 16 tests.
- [x] Mocked Apps Script spreadsheet adapter suite contains 17 tests.
- [x] The adapter candidate is deliberately isolated: it requires an explicit spreadsheet ID and pre-provisioned exact schema; it does not create a sheet, select a spreadsheet implicitly, or connect to `doPost/processTelegramUpdate_`.
- [x] Public Center frontend parses a data-only response instead of executing cross-origin Apps Script JavaScript. Chromium tests exercise a mocked CORS endpoint and reject an appended executable payload.
- [x] The public-center feature flag remains disabled in workbench configuration pending live CORS/redirect acceptance.
- [x] Telegram handler source-review matrix records retry/reconciliation gaps, including one-time link replay, notification delivery, VIP status side effects, and VIP reactivation ticker deduplication.
- [x] PR #12 remains open and Draft; no review or discussion comments were present at the latest audit. Production base remains `9f5d9128f7226b1a53cbcaa1615068e7a7fbc6ff`.

## Still open — required before production activation

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

### D. Backend privacy and API authorization

- [ ] Replace stale legacy ticker test assertions with a privacy-specific regression suite against the exact candidate `Code.gs`.
- [ ] Verify public ticker projection excludes real names, full member IDs, phone/email, Telegram IDs, MT5 logins, deposits, payment details, proof documents, PINs, and credentials; use only the approved masked/generic identity policy.
- [ ] Prove direct URL and API authorization using authenticated and unauthenticated tests in an isolated Apps Script runtime. UI hiding is not an authorization control.
- [ ] Confirm Market Pulse and other member-only data remain inaccessible through direct endpoint/API calls without the required verified member authorization.

### E. Database, Android, and Winner Draw

- [ ] Test real isolated database persistence, concurrency, failure recovery, and restore; do not touch production member data.
- [ ] Build the Android package and test WebView login/session, uploads/downloads, Market Pulse access, ticker behavior, and access revocation on supported physical devices.
- [ ] Complete independent security and operational acceptance for Winner Draw. No official draw until every applicable gate passes; simulation-only status remains.
- [ ] Record device models/OS versions, test cases, results, defects, and retest evidence. Chromium CI is not a substitute for physical Android testing.

### F. Operational and release controls

- [ ] Define journal/outbox monitoring, stuck-lease recovery, REVIEW triage, retention, backup, and restore runbooks.
- [ ] Complete independent security and privacy review of the final integrated candidate.
- [ ] Re-run full CI after integration and capture evidence from isolated runtime tests.
- [ ] Prepare migration, rollback, incident response, and recovery evidence before any release proposal.
- [ ] Obtain explicit approval for any production schema change, Script Properties change, webhook switch, live Telegram action, merge, or deployment.

## Explicit non-claims

Passing GitHub Actions proves only the repository's automated checks, including synthetic/mocked tests and local Chromium checks. It does **not** prove live Apps Script persistence, real spreadsheet locking, Telegram API behavior, production CORS/redirect behavior, direct-endpoint authorization, physical Android behavior, or production readiness.

The Apps Script adapter is not wired into the webhook. The current webhook candidate still uses CacheService for update-level PROCESSING/DONE state. The public-center feature flag remains disabled. The backend candidate is not deployed. No production migration, merge, or deployment is authorized by this checklist.

**Release status: NO-GO for production activation until the relevant gates above are evidenced and separately approved.**

## Evidence links

- [Draft PR #12](https://github.com/marketpsychologysociety/mps-website/pull/12)
- [PR CI #648 — success](https://github.com/marketpsychologysociety/mps-website/actions/runs/43018302173)
- [Push CI #647 — success](https://github.com/marketpsychologysociety/mps-website/actions/runs/43018294614)
- [Previous PR CI #646 — success](https://github.com/marketpsychologysociety/mps-website/actions/runs/43016135631)
- Production `main` baseline: `9f5d9128f7226b1a53cbcaa1615068e7a7fbc6ff`.
