# MPS v4.8 remaining acceptance gates

**LATEST AUTHORITATIVE SNAPSHOT — 2026-11-17 (PR #12 workbench):**
- PR #12 exact current head: `d2a33c2c472c0189b8c67dff5d02287f769f93e1`; base `main`: `43d9fb9c9383853e9e2d2775393e7e700c18f5d6`. PR is OPEN / DRAFT / NOT MERGED / mergeable; 1,398 commits ahead, 0 behind, 186 changed files.
- Latest verified code/test checkpoint: `42df8a43fc3abe5cf99f6603bd382b4c742dfa2d`, CI run [#44037414873](https://github.com/marketpsychologysociety/mps-website/actions/runs/44037414873), **SUCCESS 78/78, 0 failures**, including Chromium.
- Latest docs/acceptance checkpoint before this file's current cleanup: `d2a33c2c472c0189b8c67dff5d02287f769f93e1`, CI run [#44038277924](https://github.com/marketpsychologysociety/mps-website/actions/runs/44038277924), **SUCCESS 78/78, 0 failures**.
- Candidate suites: Deposit Telegram-link rollback **5/5**; Admin verification rollback/reconciliation **40/40**; Market Pulse converter/validator/access **12/12**. These are repository CI tests with synthetic/mocked services, not live external acceptance.
- Market Pulse source is mandatory and disclosed as Binance Spot `PAXGUSDT`, a gold-market proxy, not a broker forex XAUUSD feed. Display label remains XAUUSD M5 with WIB timezone.
- Telegram handler/effect-ledger docs now distinguish durable outbox-backed paths from credential-bearing PIN/recovery direct sends. Public VIP ticker contract displays validated real member display names; internal Member IDs and unrelated sensitive details remain private.
- Owner-confirmed Exness IB referral link and QR destination are documented. API product, permissions, authentication, member-account mapping, and live connectivity remain unverified; integration remains blueprint-only.
- Remaining release gates: isolated real GAS/Sheets/ScriptLock/trigger acceptance; real Drive ACL and direct-route/API authorization; isolated Telegram test-bot delivery and handler reconciliation; physical Android/PWA acceptance; independent security/operational review; backup/restore evidence; final replacement Market Pulse dataset handoff; explicit owner release authorization.
- Production `main`, member data, Apps Script deployment, Script Properties, Drive ACLs, Telegram configuration, Exness credentials/settings, and production triggers remain untouched. **Production activation remains NO-GO.**
---

# MPS v4.8 remaining acceptance gates

**Snapshot:** 2026-11-16  
**Scope:** workbench / Draft PR #12 only. This checklist separates verified repository checks from work that still requires isolated Google Apps Script, Telegram test infrastructure, Android-device testing, independent review, or explicit production authorization.

## Current authoritative snapshot — 2026-11-16

This section supersedes older checkpoint bullets below wherever they conflict. Older sections are retained as historical implementation notes; their unchecked boxes are not a current statement that already-integrated candidate work is absent.

- Latest completed code/test CI: [run #2152](https://github.com/marketpsychologysociety/mps-website/actions/runs/43823182822), **SUCCESS, 78/78 workflow steps, 0 failed steps**, on workbench head `fe1864b92243425cc20b860357193c17a3d134c3`. Public VIP ticker/privacy tests passed **21/21** (including actual renderer behavior rejecting Telegram identifiers, MPS IDs, contact details, and proof URLs); frontend/backend API contract tests passed **39/39**; Chromium browser checks passed. These remain repository CI with isolated/mocked services, not live GAS/Sheets/Drive/Telegram or Android acceptance.
- Latest documentation-only validation: [run #2148](https://github.com/marketpsychologysociety/mps-website/actions/runs/43822848521), **SUCCESS, 78/78 workflow steps, 0 failed steps**, on documentation head `2cf386e957e8539f894fab8a4d1ffbaf39d4c82d`.
- Source-level Telegram side-effect audit (2026-11-16): the durable MPS Telegram Update Journal now supersedes the earlier CacheService-only webhook-ingress note below. It does not make every external effect exactly-once. Public registration/deposit admin notifications in `submitCore_` still use a direct post-commit `sendTelegram_` call; an unconfirmed outcome is returned as a warning and is not blindly retried. PIN delivery remains a separate credential-delivery path with explicit rollback/confirmation semantics and is intentionally not stored in the generic outbox. Manual Admin webhook-setup/test messages also call Telegram directly only after an explicit Admin action. VIP invites, join-request notices, `/start` notices, and the VIP bot-permission alert use the durable outbox; non-outbox notification reconciliation and isolated Telegram test-bot acceptance remain open.
- Admin verification rollback reconciliation now has 40/40 passing fault-injection tests. Deterministic decision-intent preflight errors no longer cause unnecessary snapshot rewrites or false rollback alerts; unknown/ambiguous queue append failures still reconcile.
- Candidate Market Pulse infrastructure (XAUUSD M5 schema/validator, WIB time-window handling, conversion tooling, private Drive reader, and session-guarded member/Admin APIs) is present in the workbench. The old Heatmap menu item is absent from the candidate portal; the remaining `heatmap.html` route is only a compatibility preview route, not a live Heatmap menu. **Dataset replacement/publication is not considered complete:** the user instructed that PR work must finish first and that a new Pulse dataset will be supplied afterward. Any earlier converted payload is candidate-only and must not be treated as the final replacement or uploaded to production.
- Converter/schema/access tests passed 9/9 on synthetic and candidate fixtures, including rejection of direct unauthenticated API reads. The prior raw-source conversion is retained as historical candidate evidence only; the replacement dataset remains pending the user's post-PR handoff and validation.
- Market Pulse Drive publication now reconciles ambiguous Drive rename/create/trash responses and verifies the final active file identity/count. Mocked Drive rollback tests: 9/9 passed. Controlled red-team boundaries: 8/8 passed; see `docs/MPS-CONTROLLED-SECURITY-SIMULATION-2026-11-16.md`. This is not live Drive acceptance.
- The generated compact dataset is prepared but **not uploaded** to the production Learning Drive folder. Production data, Drive ACL, Script Properties, triggers, Telegram configuration, and Apps Script deployment remain untouched.
- PR #12 remains OPEN / DRAFT / NOT MERGED; latest code/test head is `fe1864b92243425cc20b860357193c17a3d134c3`, latest acceptance-document commit is `f1bacb1fd4009982a8d5f83c5ad7997a9bf8987d`, and the current PR comparison is **1,346 commits ahead and 0 behind** `main` base `43d9fb9c9383853e9e2d2775393e7e700c18f5d6` (184 changed files). GitHub reports it mergeable. Production main remains unchanged. Do not merge or deploy until live isolated GAS/Drive/Telegram gates and independent review are completed.
- Remaining work includes live isolated Google Apps Script/Sheets/ScriptLock/trigger acceptance; actual Drive folder/file ACL and Super Admin dataset upload; member-only direct URL/API verification; Android PWA/device acceptance; and Trading Signals implementation after its blueprint is approved. The Trading Signals blueprint is documented separately; per the prior instruction it remains blueprint-only, with the fourth bot filename and exact session opening/closing hours still undecided. No bot secrets or production credentials are present in the candidate.

- PR #12 remains **OPEN / DRAFT / NOT MERGED**. The latest completed code/test CI snapshot above is run #2152 on exact workbench head `fe1864b92243425cc20b860357193c17a3d134c3`.
- Latest PR CI for candidate commit `6a4fa8d7ad3a06ba57dee669338a725c8d35a6de` (run #1745) completed **SUCCESS** with zero failed steps. It includes the new ambiguous VIP admin-alert quarantine regression, candidate VIP integration/recovery tests, mocked Apps Script checks, isolated-harness static validation, and Chromium browser checks. This is repository/CI evidence, not live Google Apps Script acceptance.
- The VIP `chat_member` path in candidate `Code.gs` is integrated with the durable intent/cursor/effect-ledger orchestration and the spreadsheet-backed VIP follow-up queue. The queue handles invite revocation, ineligible-member removal, and admin security alerts with leases and retry scheduling. This is **candidate-only** and still requires real isolated GAS/Sheets and Telegram test-environment acceptance.
- Candidate VIP admin-alert delivery now fails closed to `REVIEW` when Telegram send outcome is unconfirmed; it is not automatically retried because a timeout/response loss could otherwise duplicate a security alert. A regression verifies a second worker pass does not resend it. Human review/notification operations still require a runbook and live test-bot acceptance.
- The public VIP ticker projection exposes a validated real member display name from the verified VIP transition record; the internal Member ID is not sent to the public browser. The Admin ticker projection remains limited to approved event fields and omits stored member names. Public cache v4.8.1 rejects stale ID-only or unsafe-identity payloads.
- Market Pulse candidate reads reject a non-private parent Learning folder before enumerating the data file; file-level privacy checks and direct endpoint session guards also have mocked regression coverage.
- Still open: actual isolated GAS execution and Sheets persistence/locking/trigger behavior; actual Drive ACL inheritance and direct-route/API authorization; live isolated Public Center CORS/redirect behavior; Telegram test-bot delivery and non-`chat_member` reconciliation; physical Android testing; independent security/operational review; backup/restore and release authorization.
- Production `main`, live spreadsheet/member records, Apps Script deployment and Script Properties, Drive ACLs, Telegram configuration, and production triggers remain untouched. **NO-GO remains in force.**


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
- [x] Wire the spreadsheet-backed update journal into the isolated candidate webhook ingress; completed-update replay, leases, collision handling, and retry/review states are covered by repository contract tests. Actual Google Apps Script persistence/locking/runtime acceptance remains open; no production webhook or CacheService behavior was changed.

### B. Telegram handler idempotency and outbox

- [ ] Implement handler-specific reconciliation for every update type in the handler matrix.
- [x] Reconcile already-consumed one-time links to the exact same Telegram user/chat; reject different identities in candidate mocked tests. Real Apps Script runtime acceptance remains open.
- [ ] Integrate the isolated effect-outbox contract with durable Apps Script/external storage and handler transactions for welcome DMs, group notices, ticker events, audit records, invite revocation, moderation actions, and admin alerts.
- [x] Add a separate handler-reconciliation contract with 15 synthetic tests for same-identity application/legacy link replay, cross-identity rejection, and transition-scoped VIP activation keys.
- [x] Wire link replay reconciliation into the isolated Code.gs candidate and add candidate-level mocked tests for exact Telegram identity plus access/member/Application Ref binding. Real Apps Script runtime acceptance remains open.
- [x] Route one-time-link missing/invalid/private-chat and verification-failure notices through the existing durable update-scoped Telegram message outbox. The verifier no longer sends these notices directly; queue failures propagate for webhook retry, and ambiguous Telegram delivery is quarantined as `REVIEW`. No raw link token or PIN is persisted in the notice task.
- [x] Wire stable update-scoped VIP ticker/audit effects into the isolated Code.gs candidate via the chat_member transition orchestrator and keyed effect ledger. Real GAS runtime acceptance remains open.
- [x] Quarantine an unconfirmed VIP admin-alert send outcome as `REVIEW` rather than automatically retrying a potentially delivered security notification; regression test verifies no duplicate retry. This does not yet establish live Telegram delivery.
- [x] Define conservative synthetic contract for ambiguous Telegram `sendMessage`: move to REVIEW unless authoritative reconciliation proves APPLIED/NOT_APPLIED; only explicitly confirmed no-effect failures may be retried. [ ] Obtain business approval for any notification class that instead accepts at-least-once duplicate delivery.
- [x] Give each VIP activation transition a distinct effect key; replay is scoped to immutable transition/update intent rather than member ID alone.
- [ ] Exercise each handler with mocked Telegram and spreadsheet adapters, then with a separate Telegram test bot/group.

### C. Public Center live transport

- [ ] Verify the Apps Script deployment's CORS headers, redirect chain, final response body, and browser fetch behavior from an isolated deployment.
- [x] Add a candidate `doGet(?publicCenter=1)` text-only bridge with strict JSON envelope; no remote script execution.\n- [ ] Confirm the JSON envelope, CORS/redirect chain, and fallback behavior against a separately deployed isolated candidate.
- [ ] Keep the feature flag disabled until the live transport test passes. Do not restore JSONP or executable script injection as a workaround.

### D. Backend privacy and API authorization

- [x] Replace stale legacy ticker test assertions with `tests/apps-script/public-ticker-privacy.test.mjs`, which exercises the exact candidate `Code.gs` identity guard and public projection.
- [x] Regression tests verify that the public projection and website renderer consume a validated real `MemberName` from the verified VIP transition record (not the internal Member ID); the Admin projection still omits stored member names. Public name validation rejects phone/email, Telegram IDs/handles, MT5/logins, deposit/payment values, proof URLs, and credential-like values. Live isolated-runtime authorization remains open.
- [x] Harden VIP join-request approval to require the exact unexpired invite link stored for one unique Telegram identity and one unique Member ID; forged/missing/expired invites and duplicate identity rows fail closed in mocked tests.\n- [ ] Prove direct URL and API authorization using authenticated and unauthenticated tests in an isolated Apps Script runtime. UI hiding is not an authorization control.
- [x] Add candidate checks that Market Pulse data access fails closed when the parent Learning folder is not PRIVATE, while retaining the file-level PRIVATE check. Runtime mocks verify shared-folder denial before Drive file enumeration, shared-file denial before blob reads, duplicate data files fail closed, and private-file access proceeds to source validation.
- [x] Add candidate API-boundary tests confirming direct Market Pulse member/Admin calls reject missing sessions before Drive access, with authorization before per-principal throttling. These tests use mocked session guards and are not live Apps Script authorization evidence.
- [ ] Prove direct URL and API authorization for all member-only resources using authenticated, unauthenticated, wrong-role, pending, rejected, suspended, expired-session, and revoked-session cases in an isolated Apps Script runtime. UI hiding and mocked guards are not sufficient.
- [ ] Verify actual Drive folder/file ACL inheritance and Market Pulse access against a separately deployed isolated Apps Script project.

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

The candidate VIP `chat_member` transition path is wired to its scoped effect-ledger orchestration and spreadsheet-backed follow-up queue. Generic webhook ingress now uses the candidate spreadsheet-backed MPS Telegram Update Journal rather than the earlier CacheService-only PROCESSING/DONE marker; this update journal is not a global per-effect exactly-once guarantee. Non-`chat_member` handler reconciliation, ambiguous external-send recovery outside the outbox, real GAS runtime, public-center live transport, and all production dependencies remain open. The public-center feature flag remains disabled, and the backend candidate is not deployed. No production migration, merge, or deployment is authorized by this checklist.

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
- [x] Integrate stable effect keys into candidate VIP chat_member audit/ticker writes and update-ID propagation. Real GAS runtime and broader handler acceptance remain open.



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
- [x] Select and implement scoped lock ownership for candidate VIP transition writes; mocked Apps Script and Telegram-adapter tests cover lock ownership and nested-lock rejection.
- [x] Propagate original update metadata through the candidate chat_member handler and derive VIP transitions from Telegram old/new membership state. Join-request and other update types still require separate reconciliation.
- [x] Integrate stable ticker/audit effects into the isolated Code.gs candidate for VIP chat_member transitions. This is candidate-only; actual GAS runtime remains unverified.

See docs/MPS-TELEGRAM-EFFECT-LEDGER-INTEGRATION-PLAN.md. These are static source-review findings and an integration plan, not runtime acceptance. No Code.gs change or live resource change was made.


### Market Pulse folder and direct API guard regression — 2026-11-13

- [x] The candidate data reader checks the configured Learning parent folder is PRIVATE before enumerating the Market Pulse data file. The existing file-level PRIVATE check remains in place.
- [x] Runtime-mock regression cases cover a shared parent folder, shared data file, valid private file, and duplicate named files. Shared access is rejected before reading file contents.
- [x] Direct member/Admin endpoint guard tests confirm missing sessions are rejected before Drive access and before rate-limit consumption.
- [x] GitHub Actions runs #1726 and #1727 on candidate head `b49682351b57a1a7c4fbf1f0c97179cec5a3f3ac` completed successfully, each with **68/68 steps** and zero failed steps.
- [ ] Actual isolated Apps Script deployment, Google Drive ACL/inheritance behavior, and direct URL/API authorization with real Apps Script session/cache services remain unverified. No production resources were touched.

### Telegram VIP effect-ledger integration status reconciliation — 2026-11-13

The earlier checklist entries describing the Code.gs lock-ownership design, update-ID propagation, VIP activation effect keys, and ticker/audit integration as not yet implemented are superseded by the current candidate source and test suites. Current workbench evidence:

- [x] Candidate chat-member handler passes the original Telegram update and derives state from old/new membership events.
- [x] Candidate transition orchestrator persists update-scoped intent/cursor state and uses distinct deterministic ticker/audit effect keys.
- [x] Candidate effect-ledger adapter exposes a scoped `runExclusive` API. The orchestrator performs its scoped writes without recursively acquiring ScriptLock; nested lock acquisition is rejected.
- [x] Candidate tests cover replay, stale ordering, payload collision, transition status writes, keyed ticker/audit effects, lock ownership, and follow-up queue behavior using mocked Apps Script services.
- [x] Documentation now distinguishes the current integrated candidate from the earlier source-review plan.

Still open and not promoted to PASS:

- [ ] Execute the candidate in a separate real Google Apps Script project and test actual Sheets persistence/flush, ScriptLock contention, execution interruption, quotas, latency, and permissions.
- [ ] Verify recovery after real runtime interruption at each status/intent/cursor/effect write boundary.
- [ ] Test the explicit effect-key schema migration and backup/restore against a separate test spreadsheet.
- [ ] Complete handler-specific reconciliation for non-`chat_member` update types and ambiguous Telegram sends; the VIP transition ledger does not provide exactly-once delivery for all webhook effects.
- [ ] Keep production webhook, production spreadsheet, member data, Script Properties, Telegram configuration, and triggers untouched until separately authorized.

Historical note from 2026-11-13 (superseded for webhook ingress on 2026-11-16): at that point the generic webhook cache update key was unset. Current candidate ingress uses the spreadsheet-backed MPS Telegram Update Journal; VIP `chat_member` replay safety additionally uses the transition intent/cursor/effect ledger. Neither mechanism should be generalized into a claim of global per-effect exactly-once delivery. The real GAS runtime gate remains open.

### Non-chat_member Telegram source-call-site cross-audit — 2026-11-13

- Re-read the candidate `processTelegramUpdate_`, `processTelegramUpdateCore_`, `processVipJoinRequest_`, `sendVipInvite_`, admin approval/notification paths, and Telegram send helpers directly from the current workbench branch.
- Confirmed the durable transition intent/cursor/effect ledger and VIP follow-up outbox are scoped to the authoritative VIP `chat_member` transition path. They do not wrap every Telegram side effect elsewhere in the webhook.
- Remaining non-`chat_member` side-effect paths requiring handler-specific reconciliation and test-bot acceptance include: group `/start` candidate-group notice; private `/start` welcome; `chat_join_request` approval/decline and member DMs; `my_chat_member` permission-change admin alert; admin approval/rejection archive notices and applicant DMs; and VIP invite-link DM delivery/rollback.
- Historical finding (2026-11-13; superseded for ingress on 2026-11-16): webhook PROCESSING/DONE now uses the spreadsheet-backed MPS Telegram Update Journal. The journal prevents completed-update replay but is not a per-effect exactly-once ledger. Response-loss/timeouts can still be ambiguous for handler side effects that are not in the durable outbox; the VIP admin-alert REVIEW quarantine must not be generalized to those non-outbox notification classes.
- No broad automatic retry was added during this audit: doing so without per-effect identity and authoritative reconciliation could duplicate messages or repeat consequential actions. These paths remain explicitly open for separately scoped changes and regression tests.
- This is a source-level call-site audit only. No live Telegram calls, bot settings, webhook changes, GAS deployment, production database, or production triggers were touched.

### VIP join-request welcome DM durable outbox — candidate update 2026-11-13

- Replaced direct member DMs on the approved and declined `chat_join_request` paths with durable `SEND_DM` tasks in the existing VIP follow-up queue. The approved welcome task is also used when Telegram already shows the member joined after a previous ambiguous approval attempt; a declined-request replay queues its rejection notice when Telegram confirms the request is closed.
- The task key is deterministic from the VIP chat, Telegram requester identity, request timestamp (or update-ID fallback), and exact invite-link identity. A redelivered request therefore reuses the existing task rather than creating another welcome DM.
- Queue writes occur before the immediate worker drain. If queue provisioning or persistence fails, the handler surfaces a retryable error rather than silently treating the welcome notice as complete.
- `SEND_DM` uses the same lock/lease/outside-lock network boundary as other outbox actions. An unconfirmed Telegram send is moved to `REVIEW`, not automatically retried, because the DM may already have reached the member. The regression verifies exact request replay does not send twice and ambiguous delivery is not resent by a later worker pass.
- This is scoped to VIP join-request member notices (approval welcome and rejection explanation), the separate `my_chat_member` admin warning, private `/start` welcome, and group `/start` candidate notice. Admin approval/rejection notices use the durable decision-intent outbox; VIP invite-link delivery is now routed through a durable VIP_INVITE_DM task. Live one-time-link and VIP invite outbox acceptance remain outstanding.
- The queue sheet and 5-minute worker trigger must already have been explicitly provisioned in the isolated candidate spreadsheet before this path can complete. This change does not provision or alter any live resource.
- Candidate-only source and mocked-runtime regression; real GAS persistence/locking, Telegram test-bot delivery, and live group behavior remain NOT RUN. No production configuration, member data, webhook, trigger, or deployment was changed.

### Telegram bot-permission warning outbox — candidate update 2026-11-13

- The `my_chat_member` handler no longer sends a bot-permission warning directly through `sendTelegram_`. It enqueues an `ADMIN_ALERT` task keyed by the Telegram update ID and VIP chat, then performs the best-effort queue drain outside the queue lock.
- Replaying the same update reuses the same task key; the existing worker quarantines an unconfirmed admin-alert delivery as `REVIEW` rather than automatically resending it.
- Added a candidate integration regression asserting the warning uses the update-scoped outbox and does not call the direct admin-alert sender. Existing queue runtime regression covers ambiguous alert quarantine.
- Candidate/mock-only verification. Actual Telegram test-bot delivery and isolated real GAS queue persistence/trigger behavior remain NOT RUN. Other admin notices and non-VIP notification paths remain open.

### Latest candidate Telegram outbox regression verification — 2026-11-13

- GitHub Actions PR run **#1783** on code/test commit `3d9ad292a821e417be7519d0cde76b4c0ab8f2d9` completed **SUCCESS, 68/68 workflow steps, 0 failures**.
- Candidate Telegram handler integration suite: **39/39 passed**; candidate VIP transition GAS-like runtime suite: **17/17 passed**; public ticker/privacy suite: **20/20 passed**; isolated GAS acceptance harness static validation: success; Chromium browser checks: success.
- New coverage includes stable task-key deduplication for approved and rejected VIP join-request notices, replay after Telegram confirms a rejected request is closed, propagation of queue persistence failures for webhook retry, bot-permission warning routing through the update-scoped admin-alert outbox, and quarantine of ambiguous admin-alert/member-DM delivery as `REVIEW`.
- The run used repository CI with mocked Apps Script/Telegram services and local Chromium. It is not live Google Apps Script, live Sheets/ScriptLock/trigger, Telegram test-bot, public deployment, or physical Android acceptance.
- The latest tested code/test commit remains candidate-only. The follow-up documentation commit is separate. PR #12 remains Draft/unmerged and release remains NO-GO; production resources remain untouched.

### Telegram /start notice outbox — candidate update 2026-11-13

- Private `/start` welcome messages and the verified-admin group `/start` candidate notice now use the durable message outbox instead of direct `sendMessage` calls.
- Task identity is scoped to Telegram update ID, effect type, and target chat. Private chats use `SEND_DM`; group notices use `SEND_MESSAGE` and validate signed Telegram chat IDs.
- Ambiguous send outcomes for both task types are quarantined as `REVIEW`; no blind automatic resend is performed. Queue write/worker failures propagate so Telegram can redeliver the update and the stable task key prevents a second task.
- Added candidate integration coverage for private welcome replay, group-chat target validation, and worker quarantine for ambiguous group-message delivery.
- Live Telegram and real GAS queue acceptance remain NOT RUN. One-time-link verification responses are now routed through the durable update-scoped outbox in the candidate; live GAS/Telegram acceptance and other direct notification paths remain open.

### Latest Telegram message-outbox verification — 2026-11-13

- GitHub Actions PR run **#1797** on code/test commit `10cc67f27dc8399c3b30ac48e5aa867428f33068` completed **SUCCESS, 68/68 workflow steps, 0 failures**.
- Candidate Telegram handler integration and outbox suites, the `/start` command suppression/regression suite, candidate VIP runtime mocks, isolated-harness static checks, and Chromium browser checks all passed.
- The run validates the candidate changes that route private `/start` welcomes and verified group `/start` notices through update-scoped durable message tasks, with ambiguous delivery quarantined rather than blindly retried.
- This remains CI evidence using mocked Apps Script/Telegram services and local Chromium. It does not establish live GAS persistence, live Telegram delivery, trigger behavior, production authorization, or Android-device acceptance.

### Telegram group-message delivery regression — 2026-11-13

- GitHub Actions PR run **#1801** on code/test commit `5f952bc91d5f4a872dab4ed4c45e3fa01d6fa72d` completed **SUCCESS, 68/68 workflow steps, 0 failures**.
- The run includes a positive-path regression proving a queued group `/start` message reaches `DONE` exactly once, plus the ambiguous-delivery test proving an uncertain send is quarantined as `REVIEW` and not resent automatically.
- Candidate Telegram handler integration, edited-message suppression, VIP runtime mocks, static isolated-GAS safety, and Chromium browser checks all passed. No live GAS or Telegram test-bot execution is implied.

### Group-start successful delivery regression — 2026-11-13

- GitHub Actions PR run **#1801** on commit `5f952bc91d5f4a872dab4ed4c45e3fa01d6fa72d` completed **SUCCESS, 68/68 workflow steps, 0 failures**.
- Added an explicit candidate GAS-runtime regression proving a valid `SEND_MESSAGE` task is delivered once, transitions to `DONE`, and performs exactly one Telegram-send mock call. The adjacent ambiguous-delivery regression continues to require `REVIEW` and no automatic retry.
- This is mocked CI only. It does not prove live Telegram delivery or live Google Apps Script queue/trigger behavior.


### One-time-link verification response outbox — candidate update 2026-11-14

- Candidate `processTelegramUpdateCore_` now passes the immutable Telegram `update_id` into the one-time-link verification path.
- Missing-link, private-chat guard, and application/legacy verification-failure notices are queued as update-scoped `SEND_DM` tasks using the existing spreadsheet-backed follow-up outbox. The verifier paths no longer call `telegramSendToChat_` directly for these notices.
- Task identity is derived from update ID, effect type, and target chat. The outbox stores only user-facing status text; raw verification tokens, PINs, invite URLs, and member/payment identifiers are excluded. Rollback-failure notices expose no internal exception or row details; diagnostic output is limited to an internal count.
- Queue persistence errors propagate so the webhook can retry with the same stable task key. Ambiguous Telegram send outcomes remain quarantined as `REVIEW`; no blind resend is introduced.
- GitHub Actions run **#1867** (run ID `43527607406`) on commit `9e76df5796c99ba65aa814d26ac04699b9ff352d` completed **SUCCESS**. The candidate Telegram one-time-link replay/notice suite passed **16/16**, and Chromium browser checks completed successfully.
- Verification used repository CI with mocked Apps Script/Telegram services and local Chromium. It is not live Apps Script persistence, live Telegram test-bot delivery, trigger behavior, or production acceptance. Real isolated GAS and Telegram test-bot acceptance remain open; admin decision notices use the durable decision-intent outbox and VIP invite-link delivery now uses a durable VIP_INVITE_DM task; live acceptance remains open.
- PR #12 remains Draft/unmerged; production remains unchanged.


### VIP invite delivery and decision-notice outbox — candidate update 2026-11-14

- Admin approval/rejection notices are materialized from the durable DECISION_INTENT journal only after the business state is verified committed. Member and admin notice tasks use stable keys and avoid persisting member names or free-form admin notes.
- VIP invite generation no longer sends a Telegram DM directly from the admin request. The generated invite is stored as pending and enqueued as a stable VIP_INVITE_DM task; the worker rechecks the current member status, deposit approval, PIN-delivery flag, Telegram user/chat binding, exact current invite URL, and expiry immediately before sending.
- The new invite URL is stored in the existing private spreadsheet-backed follow-up queue. The previous invite is revoked only after the new invite DM is confirmed successful. If queue persistence fails, the new link is revoked and the previous access/member invite fields are restored; if revocation cannot be confirmed, an audit warning is recorded.
- Telegram send tasks with expired PROCESSING leases are moved to REVIEW, not re-sent. This closes the worker-crash window that could otherwise duplicate a message after Telegram accepted it but before the queue row reached DONE. Unconfirmed VIP invite sends also remain REVIEW and require admin reconciliation; the old invite remains until expiry/reconciliation if the new delivery is uncertain.
- Admin retry now drains the queue immediately after durable enqueue, while the scheduled worker remains the recovery path. API responses distinguish queued from confirmed delivery; the candidate does not label a queued invitation as already sent.
- Added candidate GAS-runtime tests for successful one-time VIP invite send, stable task-key replay, stale/ineligible member rejection, expired in-flight send quarantine, suppression when the member has already joined, delivery-status updates after Telegram acknowledgement, and static confirmation that the admin invite path does not call Telegram directly.
- After Telegram confirms delivery, the worker changes the invite status from pending to sent under ScriptLock, but never overwrites a concurrently confirmed ACTIVE membership. If the member has already joined before delivery, the invite DM is suppressed.
- GitHub Actions commit run #1893 completed SUCCESS: 68/68 workflow steps, zero failures; candidate VIP transition GAS-runtime suite 24/24 passed; Chromium browser checks passed. The run validates commit f17727123fab5fa9ab34a1ae4b0c6d775dbf1c6c and includes the preceding admin retry-drain adjustment and documentation update. It uses mocked Apps Script/Sheets/Telegram services.
- These checks do not establish live Google Apps Script, real spreadsheet ACL/trigger behavior, or Telegram test-bot delivery. Live isolated GAS and Telegram test-bot acceptance remain open. Direct PIN delivery remains a separate credential-delivery path and has not been moved into the generic notification queue.
- PR #12 remains Draft/unmerged; production resources remain untouched.


### Durable public request ledger and persistent aggregate rate limits — candidate update 2026-11-14

- Public registration/deposit requests now reserve an idempotency record under ScriptLock before business writes. Completed requests replay only the safe result fields; interrupted PENDING requests fail closed for admin reconciliation rather than blindly repeating a business write.
- The request ledger stores the request ID, payload fingerprint, processing state/timestamps, action, application/member references, and generic result status. It does **not** store or replay Telegram one-time invite URLs, PINs, MT5 logins, proof images, or other credential material.
- Public request status returns only a generic pending/completed status. It does not expose application payloads or private member fields.
- The new \`MPS Request Ledger\` sheet is provisioned only through the explicit Super Admin \`apiAdminInitializeContent\` path. It is not created automatically on page load or by public request handlers. Before enabling public registration/deposit in a target Apps Script project, the ledger must be provisioned and its containing spreadsheet's PRIVATE access verified.
- Aggregate throttles for public registration, public deposit, member login, and advertising requests now use four fixed allow-listed Script Properties buckets under ScriptLock. Cache loss cannot reset these aggregate counters; malformed stored limiter state fails closed. Per-identity throttles remain in place.
- Repository tests cover persistence across execution contexts, fixed-bucket isolation, attacker-controlled bucket rejection, expired/corrupt state, Super Admin-only ledger provisioning, generic public status, idempotency reservation, and fail-closed post-commit recovery. These are static/isolated CI tests, not live Apps Script quota, persistence, or spreadsheet ACL acceptance.
- The read-only Super Admin system-configuration diagnostic now explicitly reports whether `MPS Request Ledger` exists and has the exact expected headers; it never creates or repairs the sheet while checking.
- Remaining live gate: in a new isolated Apps Script project, run the Super Admin initialization path, verify the ledger headers and spreadsheet PRIVATE ACL, then exercise duplicate/replay and cache-loss scenarios with synthetic data. No production migration, ledger provisioning, or database write has been performed.


### Mandatory Admin TOTP MFA — candidate update 2026-11-14

- Admin and Super Admin login now require a role-specific six-digit TOTP code in addition to the existing password/token. The implementation follows RFC 6238 with HMAC-SHA1, a 30-second step, and a one-step clock-skew window; login attempts remain subject to the persistent rate limiter.
- Accepted TOTP time steps are recorded separately for Admin and Super Admin in `MPS_ADMIN_TOTP_LAST_STEP` / `MPS_SUPER_ADMIN_TOTP_LAST_STEP` under Script Properties. A code already accepted for that role cannot be replayed; malformed replay state fails closed.
- Configure two **different** Base32 secrets in Apps Script Script Properties: \`MPS_ADMIN_TOTP_SECRET\` and \`MPS_SUPER_ADMIN_TOTP_SECRET\`. Each secret must be 32–64 Base32 characters, with length divisible by 8 (at least 160 bits). Enroll each secret manually in an authenticator app. Never place either secret in GitHub, frontend code, chat, or logs.
- If either secret is missing, malformed, or identical to the other role's secret, the read-only Super Admin configuration diagnostic reports MFA as not ready and login fails closed. The diagnostic never displays secret values.
- The read-only Super Admin diagnostic also validates the two replay-counter properties without exposing their values; malformed or empty persisted counters fail closed at login.
- There is no in-app MFA bypass or recovery token. If an authenticator is lost, the system owner must reset the affected Script Property directly through the Apps Script project owner account, then re-enroll the authenticator and verify access before restoring normal operations.
- Added RFC 6238 reference-vector tests, Base32 decoding checks, time-window boundary tests, login-gating assertions, and UI contract checks. These repository tests do not replace a real authenticator login in an isolated Apps Script deployment.
- Remaining live gate: configure separate Admin and Super Admin secrets in an isolated project, enroll the authenticator devices, test both roles and clock-skew handling, and confirm recovery procedures. No Script Properties or production credentials were changed by this candidate update.


### Admin registration archive notification outbox — candidate update 2026-11-14

- `apiAdminResendRegistrationNotice` no longer calls Telegram directly. It validates the admin session and eligible deposit state, then reserves an `ADMIN_ALERT` task in the existing spreadsheet-backed durable follow-up queue while holding ScriptLock across the member snapshot and enqueue.
- A five-minute idempotency bucket derives a stable task key from the member ID and time bucket. Repeated taps/transport retries in the same bucket reuse the existing task; a later intentional resend can enqueue a new task. The existing per-member admin rate limit remains in force.
- The archive text retains the existing admin-facing fields (nickname, Telegram username, country, join goal, member ID, and registration status) and is stored in the existing spreadsheet-backed queue used by Telegram follow-ups. Its confidentiality depends on the spreadsheet retaining PRIVATE access; actual live ACL verification remains an open release gate. No proof image, PIN, or MT5 login is added to this task.
- The API reports `queued`, not delivered. The existing worker performs the Telegram send; successful acknowledgement transitions the task to `DONE`, while ambiguous outcomes are quarantined as `REVIEW` and never blindly retried.
- Candidate runtime regressions cover successful worker delivery, repeated request deduplication, eligible-state validation, and absence of direct Telegram sending from the admin endpoint. CI uses mocked Apps Script/Sheets/Telegram services; live GAS, spreadsheet ACL, trigger, and Telegram test-bot acceptance remain separate gates.


### Candidate consolidation — 2026-11-14

- The Admin archive-notification outbox implementation and its runtime regression tests have been fast-forwarded into the main v4.8 workbench candidate. PR #12 now contains this code; the separate archive-outbox branch is identical to the workbench and is no longer an independent change.
- This consolidation changes only the development branch. It does not merge PR #12 into \`main\`, deploy Apps Script, alter production Script Properties, provision Sheets, modify Drive permissions, or send Telegram messages.
- Re-run the complete candidate CI against the consolidated workbench head before considering source integration complete.


## Current checkpoint — 2026-11-17 (Public Center backend gate)

- Current code/test head at this checkpoint: `f4b81c289fdde6850e2d224fc268ac1d146fa212`; PR #12 remains OPEN / DRAFT / NOT MERGED against base `43d9fb9c9383853e9e2d2775393e7e700c18f5d6`.
- The candidate Apps Script `doGet(e)` Public Center route is now independently default-deny. It requires Script Property `MPS_PUBLIC_CENTER_ENABLED` to equal the exact string `true`; missing, false, malformed values, or property access errors deny the direct URL route. The public website config remains disabled.
- GitHub Actions [run #44022596543](https://github.com/marketpsychologysociety/mps-website/actions/runs/44022596543) completed **SUCCESS, 78/78 workflow steps, 0 failures** on the exact code/test head above. The backend route-gate regression, public-center GET bridge, public ticker privacy, API contract, and Chromium browser checks passed.
- CI remains repository-based with synthetic/mocked Apps Script, Sheets, Drive and Telegram dependencies. It is not live Apps Script, live spreadsheet/Drive ACL, Telegram delivery, or physical Android acceptance.
- No production resources or `main` were changed. No Public Center activation property was configured; the feature remains disabled. Official Winner Draw remains BLOCKED / NO-GO; Lucky Roulette remains SIMULATION ONLY.
- The Market Pulse replacement dataset/provenance handoff remains pending; no historical candidate dataset is approved for publication.


## 2026-11-17 — Member recovery and Exness rebate transparency

- **Candidate implementation added:** member can request forgotten PIN or forgotten Member ID using registered MT5 login and the previously linked private Telegram identity. A one-time 8-character code is sent to the verified Telegram chat; expiry 10 minutes; wrong-code attempts capped at five; global/per-target rate limits; new PIN is member-chosen and stored using the existing salted verifier; previous sessions become invalid. Member ID is delivered only to Telegram and never returned to browser.
- **Admin fallback:** if the prior Telegram account is inaccessible or linkage is ambiguous, self-service does not accept a new Telegram ID. Member is directed to Admin for verification against existing registration/deposit evidence.
- **Synthetic validation:** latest completed code/test checkpoint run #44023899652 passed 78/78 steps on exact SHA `932904aa2c1f1716bd11c19e0ecd41c0d4f164ec`. This included API contract checks, MT5 lookup helper tests and Chromium checks. Live Telegram, deployed Apps Script and Android device tests remain outstanding.
- **Exness public transparency:** Rebate page clearly shows **NOT CONNECTED / WAITING FOR PARTNER API ACCESS**; no live member amount or payment status is fabricated. Intended source is official Exness Partnership API with read-only `partnership.all:read`; partner reward, member rebate, batch status, row status and payment status remain distinct.
- **Not implemented yet:** live Exness adapter/signer and member-specific Rebate Saya figures. Prerequisites are partner eligibility/access verification, read-only API key and Ed25519 signing key stored securely, approved signing runtime, unique MT5/client-account mapping, reconciliation tests and explicit owner authorization for credential setup. No credentials or production access were supplied or used.
- The public Rebate page deposit minimum was aligned to Rp1.000.000, matching the current Membership page. This is a copy consistency correction, not a change to deposit processing.
- No production resources, main branch, member database, Telegram bot configuration or Exness settings were changed. Official Winner Draw remains BLOCKED / NO-GO; Lucky Roulette remains SIMULATION ONLY.

## Current PR checkpoint — 2026-11-17 (latest verified)

- PR #12 is OPEN / DRAFT / NOT MERGED. Head: `e4fe4bdc20d95c50e82b33ae45239defb9df2092`; base: `43d9fb9c9383853e9e2d2775393e7e700c18f5d6`; GitHub reports mergeable, but that is not a release-readiness approval. The PR currently spans 186 changed files and 1,407 commits; this unusually broad integration surface requires scope/history review before merge.
- Workflow run #2263 (`44042338957`) completed SUCCESS on the exact head. The run contains one `validate-pwa` job only. It is not evidence that the full Apps Script synthetic regression suite was rerun on this exact head. Latest identified full 78-step candidate code/test success remains run #2261 on code/test head `01e7fcb2ad7aab6fc51ffb7fdddd200aa20e5963`.
- The recovery-challenge concurrency hardening is included in the code/test head and passed the workflow that includes `request-security-hardening.test.mjs`. PIN reissue Telegram response-loss ambiguity remains an explicit pre-release hardening gate.
- Merge/deploy remains NO-GO until PIN delivery ambiguity is resolved and tested, and the isolated live Apps Script/Sheets/ScriptLock, Drive ACL, Telegram delivery/reconciliation, physical Android/PWA, independent security review, backup/restore, Market Pulse replacement dataset/provenance, and owner release checks are evidenced. Exness remains NOT CONNECTED pending approved partner API access and mapping. Public Center stays disabled; Winner Draw stays NO-GO; Lucky Roulette stays simulation-only.
- No merge, deployment, production setting change, production data mutation, or external Telegram/Exness operation was performed.


## 2026-11-17 — PIN delivery ambiguity quarantine and latest CI

- The Admin PIN reissue flow now persists `PENDING_DELIVERY` before replacing the verifier. If Telegram returns a failure or ambiguous response, the candidate retains the new verifier, marks the exact current issuance `REVIEW_REQUIRED`, and does **not** restore the previous PIN because Telegram may already have delivered the new one.
- Member login fails closed whenever a delivery-state property exists and is not `ACTIVE`. The legacy state-absent path remains compatible for existing members; confirmed Admin delivery and verified member self-recovery set the state to `ACTIVE`.
- Quarantine is bound to the exact current verifier under ScriptLock, so a late failure from an older concurrent issuance cannot overwrite the state of a newer PIN.
- Added `tests/apps-script/admin-pin-delivery-hardening.test.mjs` and made it part of the main CI workflow. It covers ordering of quarantine before delivery, no rollback on ambiguous Telegram outcomes, login gating, activation on confirmed delivery/recovery, and protection against stale concurrent failure. This is source/VM-level regression coverage with mocked properties/locks; it is not real Telegram or Apps Script runtime acceptance.
- GitHub Actions run **#44043034780** (pull_request) and **#44043024661** (push) both completed **SUCCESS** on exact head `c47e4414307bd63641c26824e058c9f1369ac611`; both ran the expanded validation workflow, including the new PIN delivery test and Chromium checks.
- Correction to the prior checkpoint: the `validate-pwa` job is the single job name, but its workflow definition runs the complete expanded test sequence (not just the initial PWA validator). The above runs completed the full sequence successfully.
- PR #12 remains OPEN / DRAFT / NOT MERGED. Latest head `c47e4414307bd63641c26824e058c9f1369ac611`; base remains `43d9fb9c9383853e9e2d2775393e7e700c18f5d6`. Current comparison reports 1,412 commits ahead and 187 changed files; the unusually broad integration history/scope still requires owner review before merge.
- Remaining NO-GO gates are unchanged: real isolated Google Apps Script/Sheets/ScriptLock/trigger acceptance; real Drive ACL and direct-route checks; Telegram test-bot delivery and handler reconciliation; physical Android/PWA acceptance; independent security/operational review; backup/restore evidence; final Market Pulse replacement dataset/provenance handoff; and explicit owner release approval. CI remains synthetic/mocked and does not close these live gates.
- Public Center remains disabled, official Winner Draw remains NO-GO, Lucky Roulette remains simulation-only, and Exness remains NOT CONNECTED pending partner API access and approved mapping. No merge, deployment, production resource change, or external Telegram/Exness action was performed.


## 2026-11-17 — Legacy Heatmap navigation cleanup

- Removed standalone `heatmap.html` navigation entries from all top-level site pages where they appeared (About, Announcements, Contact, Deposit Confirmation, Education, Home, Join, Membership, Rebate, Rewards, and System).
- Replaced the Home page's standalone Heatmap preview CTA with a Portal Member CTA and updated its copy to direct members to the authenticated MPS Market Pulse in the member portal.
- Audited all top-level HTML pages on the workbench branch; no remaining navigation or CTA references to `heatmap.html` were found. The standalone file itself was not deleted; this change removes its site navigation entry as requested, without destroying the page artifact.
- This is a source change only; the updated pages still require CI and production deployment/route acceptance.

## 2026-11-17 — Legacy approval PIN delivery convergence

- Source audit found the legacy member-ID approval path still sent a PIN directly through Telegram before storing its verifier. Although the member remained blocked by the pending-activation status, an ambiguous Telegram response could leave a delivered PIN unusable and bypass the newer explicit PIN-delivery state.
- The legacy approval path now delegates PIN issuance to the shared `apiAdminIssuePin` flow after its approval transaction commits. The shared flow stores `PENDING_DELIVERY` before changing the verifier, retains the new verifier and sets `REVIEW_REQUIRED` on ambiguous Telegram outcomes, and only marks the PIN `ACTIVE` after confirmed delivery of the exact current verifier.
- Removed the legacy direct PIN send and direct verifier write. Added a regression contract asserting the legacy path uses the shared hardened issuer and cannot call Telegram or write the PIN verifier directly.
- GitHub Actions run [#44045574395](https://github.com/marketpsychologysociety/mps-website/actions/runs/44045574395) completed **SUCCESS, 79/79 workflow steps, 0 failures** on the documented candidate update. The PIN delivery regression suite passed **6/6**, including the new legacy-path assertion; Chromium checks passed across 15 pages. The regression suite uses repository Node/V8 tests and does not replace real Apps Script or Telegram test-bot acceptance.
- This is candidate-branch source only. No production deployment, live member data, Script Properties, Telegram configuration, or production `main` was changed.

## 2026-11-17 — Recovery-code Telegram response-loss handling

- A second audit found that member recovery deleted the one-time challenge whenever Telegram did not return a confirmed success. If Telegram had accepted the message but its response was lost, the member could receive a code that the backend had already invalidated.
- The candidate now retains the exact 10-minute, one-time challenge on an unconfirmed send. A new recovery request replaces the challenge; the code remains protected by its salted hash, expiry, five-attempt cap, existing rate limits, and verified private Telegram binding.
- The response remains generic and does not disclose whether an account matched. The audit outcome is recorded as `DELIVERY_UNCONFIRMED`, not a definite delivery failure.
- Added a regression assertion that challenge persistence precedes Telegram send and ambiguous delivery does not delete the possibly delivered challenge. The first follow-up CI run exposed one stale assertion in the older request-security test, not a runtime/source failure; that assertion was updated to match the new fail-safe behavior. GitHub Actions run [#44046178827](https://github.com/marketpsychologysociety/mps-website/actions/runs/44046178827) then completed **SUCCESS, 79/79 workflow steps, 0 failures**. The request-security suite passed **11/11**, the PIN/recovery delivery suite passed **7/7**, and Chromium checks passed across 15 pages. Real Telegram test-bot acceptance remains open.
- Candidate branch only; no production resources or live member data changed.

## 2026-11-17 — Stale PIN delivery-success isolation

- A further concurrency review found that a late Telegram success callback for an older PIN could fail its verifier comparison but still delete the shared `MPS_PIN_DELIVERED_<member>` marker belonging to a newer, already-confirmed issuance.
- The candidate helper now returns without mutating any delivery marker/state when the verifier no longer matches. This preserves the newer issuance's `ACTIVE` state and delivery marker.
- Added VM regression coverage for stale success as well as stale failure, and runtime fault injection for a possibly delivered recovery code with guaranteed ScriptLock release. GitHub Actions run [#44049472255](https://github.com/marketpsychologysociety/mps-website/actions/runs/44049472255) completed **SUCCESS, 79/79 steps, 0 failures** on exact candidate head `fd7a76483cbd8e64d02b209d39ada4d0d54b67a8`. The PIN/recovery delivery suite passed **9/9**, including both runtime checks; Chromium checks passed across 15 pages.
- Candidate branch only. No live PIN, member data, Telegram, Script Properties, or production resources were touched.


## Exact-head CI verification correction — 2026-11-17

- Rechecked the GitHub Actions job for PR head `13b7d98668ad6420761d9ee0fe1ac466f14a0972`, run [#44049746709](https://github.com/marketpsychologysociety/mps-website/actions/runs/44049746709).
- The run completed successfully. Although the workflow job is named `validate-pwa`, its actual step list includes the full synthetic validation sequence: schema compatibility, P1.23–P1.33 security/recovery suites, Telegram webhook/journal/outbox and handler reconciliation tests, VIP transition tests, Apps Script API and authorization tests, Market Pulse conversion/access/Drive rollback tests, deposit and PIN delivery regression tests, backup/privacy checks, Admin TOTP MFA, isolated GAS harness static checks, and Chromium browser checks. Every listed step completed with success.
- This supersedes any earlier note implying run #44049746709 only performed the initial PWA validation. The exact PR head is therefore covered by the full repository CI workflow, not merely a documentation/PWA subset.
- This remains repository CI with synthetic data and mocked Apps Script, Sheets, Drive, Telegram, and local Chromium. It does not close real isolated Apps Script/Sheets/ScriptLock/trigger acceptance, live Drive ACL checks, Telegram test-bot delivery/reconciliation, physical Android/PWA acceptance, independent security review, or a real backup/restore drill.
- PR #12 remains OPEN / DRAFT / NOT MERGED. No production resources, member data, credentials, deployment, or production `main` were changed by this verification.

## Candidate source audit follow-up — public request-status read amplification (2026-11-17)

- Static review of the exact Apps Script handoff identified that the public `doGet?action=status` endpoint returned only generic completion state, but opened and scanned the durable request-ledger sheet without an aggregate throttle. Random or repeated status polling could therefore amplify spreadsheet reads even though no member/form data was disclosed.
- Candidate-only correction: added the fixed persistent allow-listed bucket `public_status_global` (1,200 requests per 60-second window) before the first ledger lookup. The bucket name is fixed and cannot be attacker-controlled; it uses the existing ScriptLock-protected Script Properties limiter and fails closed if stored limiter state is malformed.
- Added regression assertions that the public status throttle precedes `getMpsRequestLedgerSheet_()`, that the bucket is allow-listed, and that the persistent limiter enforces the new bucket. Local Node syntax check and static ordering assertion passed. GitHub Actions run #2329 on exact code/test head `948da56a5e4bbbd2a7de3bf1490e92c81e17b3f7` completed **SUCCESS, 79/79 steps, 0 failures**; documentation-only follow-up run #2331 on head `3bb301f3f57637071a97b6641845edb92211cad6` also completed **SUCCESS, 79/79 steps, 0 failures**. These are repository CI/synthetic checks and do not establish live Apps Script runtime acceptance.
- Scope: this is aggregate project-wide throttling, not per-IP throttling (Apps Script web apps do not expose the client IP through this handler). It reduces unbounded ledger-read amplification but does not replace platform-level abuse protection or live load testing.
- No production resources or settings were changed. PR remains Draft; live Apps Script/Sheets/Drive/Telegram and physical Android/PWA acceptance gates remain open.
