# MPS v4.8 remaining acceptance gates

**Snapshot:** 2026-11-11  
**Scope:** workbench / Draft PR #12 only. This checklist separates verified repository checks from work that still requires isolated Google Apps Script, Telegram test infrastructure, Android-device testing, independent review, or explicit production authorization.

## Verified in the workbench

- [x] Latest PR CI run #43022365652 and push CI run #43022358082 both completed successfully on commit `b841690cb14f21ad98434cd5e4dd0972a2d77986`; each completed all 38 workflow steps, including Chromium browser checks and all three Telegram contract suites.
- [x] The earlier PR CI run #646 also completed all 36 steps successfully on its then-current commit.
- [x] Telegram update-journal contract suite contains 17 tests; the new digit-string regression covers canonical 20-digit IDs, zero, leading-zero rejection, empty input, and overlength input.
- [x] Mocked Apps Script spreadsheet adapter suite contains 17 tests.
- [x] A separate effect-outbox contract and 15 synthetic tests cover effect-key uniqueness, independent VIP activation keys, leases/fencing, reconciliation, SENT/RETRYABLE/REVIEW, and ambiguous-send quarantine; this is not a durable production adapter.
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
- [ ] Integrate the isolated effect-outbox contract with durable Apps Script/external storage and handler transactions for welcome DMs, group notices, ticker events, audit records, invite revocation, moderation actions, and admin alerts.
- [x] Add a separate handler-reconciliation contract with 15 synthetic tests for same-identity application/legacy link replay, cross-identity rejection, and transition-scoped VIP activation keys.
- [x] Wire link replay reconciliation into the isolated Code.gs candidate and add candidate-level mocked tests for exact Telegram identity plus access/member/Application Ref binding. Real Apps Script runtime acceptance remains open.
- [ ] Wire stable update-scoped VIP ticker/audit effects into the isolated Code.gs candidate; current source review confirms member status is written before ticker/audit and update_id is not passed to the helper.
- [x] Define conservative synthetic contract for ambiguous Telegram `sendMessage`: move to REVIEW unless authoritative reconciliation proves APPLIED/NOT_APPLIED; only explicitly confirmed no-effect failures may be retried. [ ] Obtain business approval for any notification class that instead accepts at-least-once duplicate delivery.
- [ ] Give each VIP activation transition a distinct effect key; do not deduplicate all future activations solely by member ID.
- [ ] Exercise each handler with mocked Telegram and spreadsheet adapters, then with a separate Telegram test bot/group.

### C. Public Center live transport

- [ ] Verify the Apps Script deployment's CORS headers, redirect chain, final response body, and browser fetch behavior from an isolated deployment.
- [ ] Confirm the JSON envelope and fallback behavior against the actual deployed candidate.
- [ ] Keep the feature flag disabled until the live transport test passes. Do not restore JSONP or executable script injection as a workaround.

### D. Backend privacy and API authorization

- [x] Replace stale legacy ticker test assertions with `tests/apps-script/public-ticker-privacy.test.mjs`, which exercises the exact candidate `Code.gs` identity guard and public projection.
- [x] Static candidate regression verifies public ticker projection exposes only the approved real member display name (not masked) and minimal approved event; full member IDs, phone/email, Telegram IDs/handles, MT5 logins, deposits/payment details, proof documents, PINs, and credentials are excluded. Live isolated-runtime authorization remains open.
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

The Apps Script adapter, effect-outbox contract, and handler-reconciliation contract are not wired into the webhook. The current webhook candidate still uses CacheService for update-level PROCESSING/DONE state. The public-center feature flag remains disabled. The backend candidate is not deployed. No production migration, merge, or deployment is authorized by this checklist.

**Release status: NO-GO for production activation until the relevant gates above are evidenced and separately approved.**

## Evidence links

- [Draft PR #12](https://github.com/marketpsychologysociety/mps-website/pull/12)
- [PR CI #648 — success](https://github.com/marketpsychologysociety/mps-website/actions/runs/43018302173)
- [Push CI #647 — success](https://github.com/marketpsychologysociety/mps-website/actions/runs/43018294614)
- [Latest PR CI #43022365652 — success](https://github.com/marketpsychologysociety/mps-website/actions/runs/43022365652)
- [Latest push CI #43022358082 — success](https://github.com/marketpsychologysociety/mps-website/actions/runs/43022358082)
- [Previous PR CI #646 — success](https://github.com/marketpsychologysociety/mps-website/actions/runs/43016135631)
- Production `main` baseline: `9f5d9128f7226b1a53cbcaa1615068e7a7fbc6ff`.


### Telegram effect-key schema compatibility — new isolated contract

- [x] Define append-only extension preserving the legacy audit (7 columns) and ticker (6 columns) schemas.
- [x] Add 20 synthetic tests for schema recognition, fail-closed migration planning, legacy row preservation, key collision/duplicate detection, concurrency, and crash-after-append replay.
- [x] Add the synthetic suite to GitHub Actions.
- [ ] Implement and review an isolated Apps Script Sheets adapter that appends the key column only through an explicit migration, under lock, with before/after snapshots and rollback evidence.
- [ ] Verify the adapter against a separate test spreadsheet and Apps Script project, including interrupted writes, concurrent executions, malformed headers, duplicate keys, and backup/restore.
- [ ] Integrate stable effect keys into audit/ticker writes and handler update-ID propagation only after the isolated adapter tests pass.



### Isolated Apps Script effect-ledger adapter — workbench progress

- [x] Add an isolated Apps Script adapter candidate for explicit append-only audit/ticker key migration and keyed append; it requires an explicit spreadsheet ID, does not create tabs, and is not wired to the webhook.
- [x] Add 24 mocked-service tests covering audit/ticker migration, legacy-row preservation, fail-closed schema checks, missing tabs, lock handling, malformed/duplicate keys, same-key payload collision, concurrent invocation attempts, and interruption/replay after header and event-row writes.
- [x] Add the adapter suite to GitHub Actions.
- [ ] Run the adapter in a separate real Apps Script project and isolated spreadsheet, including true concurrent executions, forced execution termination, persistence/flush behavior, quota/latency, backup/restore, and permission checks.
- [ ] Review deterministic row-value construction at each future integration point; the one-column schema detects key reuse with different row payloads by exact legacy-row comparison and requires callers to keep replay values stable.
- [ ] Only after runtime acceptance, integrate into isolated Code.gs candidate and test handler update-ID propagation/reconciliation. No Code.gs integration or production migration is authorized by this stage.


### Telegram effect-ledger integration review — source findings only

- [x] Review the isolated Code.gs call graph for update-ID propagation, activation transitions, audit/ticker writers, and legacy readers.
- [x] Document a critical nested-ScriptLock hazard: updateVipJoinStatus_ currently holds the script lock while calling ticker/audit writers; directly invoking the new adapter's lock-acquiring appendOnce() there would attempt recursive lock acquisition.
- [x] Document deterministic row-value requirements, audit-row retention risk, and the fact that audit/ticker keys do not deduplicate Telegram DMs, invite revocation, moderation actions, or admin alerts.
- [ ] Select and implement a single lock-ownership design, then test it with mocked Apps Script and Telegram adapters.
- [ ] Propagate update_id through chat-member and join-request call chains; derive genuine activation transitions from Telegram's old/new membership state rather than only the already-mutated database flag.
- [ ] Integrate stable ticker/audit effects into the isolated Code.gs candidate only after the above tests pass.

See docs/MPS-TELEGRAM-EFFECT-LEDGER-INTEGRATION-PLAN.md. These are static source-review findings and an integration plan, not runtime acceptance. No Code.gs change or live resource change was made.
