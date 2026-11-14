# MPS v4.8 — Claude Independent Audit Handoff

**Purpose:** independent, adversarial review of the current workbench candidate. This document is a review map, not a release approval.

## Exact review target

- Repository: `marketpsychologysociety/mps-website`
- Pull request: [#12 — Draft](https://github.com/marketpsychologysociety/mps-website/pull/12)
- Branch: `mps-v4.8-workbench`
- Exact audit target: **the current PR head SHA shown by GitHub when the audit begins**. At the time of this update, the head is `5906419b264b20e226fbd42b930d485a47fbca42`; re-read the PR head and audit that exact commit. The handoff document itself may advance the branch head without changing candidate source.
- Base / production main SHA: `9f5d9128f7226b1a53cbcaa1615068e7a7fbc6ff`.
- Current PR snapshot at this update: 171 changed files; 29,074 additions; 64 deletions. Recheck live metadata before reporting.
- PR remains Draft and unmerged. No production deployment or live database operation is authorized.

## Latest verified CI evidence

Commit-associated GitHub Actions run [#43347203275](https://github.com/marketpsychologysociety/mps-website/actions/runs/43347203275) on the current audit target completed successfully. Its single validation job completed all 64 substantive steps, including:
- PWA/privacy and schema compatibility checks;
- synthetic SQLite persistence, contention, crash-recovery, restore, and security-contract suites;
- Telegram journal/outbox/reconciliation and VIP transition suites;
- mocked Apps Script member activation, deposit rollback, Learning-file authorization, proof validation, session/role authorization, API contract, and calculator-template checks;
- static isolated-GAS harness validation;
- Chromium browser checks.

**Interpretation:** this is repository CI evidence. Mocked Apps Script services, synthetic storage, and local Chromium do not establish live Google Apps Script, live Sheets locking/durability, Telegram API behavior, production CORS, physical Android behavior, or production security acceptance.

## High-priority files to inspect

1. `candidates/Code.gs` — candidate backend, authorization, sessions, rate limiting, database writes, Telegram webhook, member/VIP/Pulse APIs.
2. `candidates/Index.html` — candidate frontend, session handling, role-gated UI, API calls and rendering.
3. `config.js`, `js/public-center.js`, `announcements.html` — public endpoints, CORS/redirect behavior, data-only parsing, public feature flag and privacy.
4. `sw.js`, `.github/workflows/pwa-validation.yml` — cache scope, stale/private response risk, workflow integrity.
5. `tests/telegram-webhook/` — webhook idempotency, replay, VIP transitions and the boundary between mocked tests and actual handlers.
6. `tests/apps-script/` — member/session/API/file authorization regressions.
7. `docs/MPS-V4.8-REMAINING-ACCEPTANCE-GATES.md` and `docs/MPS-P1.20-PRODUCTION-ACTIVATION-READINESS.md` — outstanding acceptance gates.

## Source-review leads already identified — independently verify, do not assume

- `getMpsApplicationsSheet_()` and `getMpsMemberLinksSheet_()` in candidate `Code.gs` create missing tabs and initialize headers on first use. The same pattern also exists in `getMpsDepositsSheet_()` and `getOrCreateTelegramSheet_()` (used by `getTelegramAccessSheet_()`). These getters are reached from public and ordinary business flows, not only the explicit Super Admin initializer. In particular, `submitCore_()` → `registerMember_()` / `saveDeposit_()` can reach sheet-creating getters, and public `apiCheckTelegramLink()` reaches `getMpsMemberLinksSheet_()`. Assess whether an untrusted public request can mutate the configured spreadsheet schema when a tab is missing, whether this masks accidental deletion/misconfiguration, and whether initialization should be isolated behind the explicit Super Admin setup path. Verify every call site before recommending a change. Candidate source is not deployed.
- `processTelegramUpdate_()` uses CacheService PROCESSING/DONE state. The source comment acknowledges CacheService is best-effort and can evict early; do not treat this as durable exactly-once processing. Review crash windows and duplicate side effects.
- Telegram handler source review documents a VIP activation ordering gap: member/access status may be committed before ticker/audit effects, and replay can then skip those effects. Verify current exact call paths and whether the proposed durable effect ledger is actually wired into all handlers; do not confuse helper/contract tests with integration.
- `requireMember_()` validates session via CacheService plus a Script Properties PIN-record comparison and checks member approval state. Independently examine session entropy, revocation, role separation, cache eviction, expiry, replay, and every sensitive API path.
- `apiGetMarketPulse()` calls `requireMember_()` and rate-limits by member ID. Verify direct URL/API access, session role/state, all alternate endpoints, public projections, caching and data leakage—not only the frontend gate.
- Public `doGet` health/status branches and request-ID handling should be checked for enumeration, information disclosure, cache-key abuse, and unintended payload exposure.

## Required adversarial audit

Please inspect actual source and call graphs, not only README claims or passing tests. For every finding provide:
- severity (Critical/High/Medium/Low/Info) and confidence;
- exact file, function, and line range or a unique code excerpt;
- attacker prerequisites and concrete exploit/abuse sequence;
- security/privacy/integrity/availability impact;
- whether it is exploitable in the current candidate, only after deployment/configuration, or merely theoretical;
- minimal safe remediation and regression test;
- any production/runtime evidence still required.

At minimum cover:
1. Authentication, authorization, IDOR/BOLA, privilege escalation, session/PIN lifecycle, CSRF and direct endpoint access.
2. Telegram webhook authenticity, replay, idempotency, concurrency, lock ordering, crash windows, rate limits and message injection.
3. Spreadsheet/schema mutation, data integrity, race conditions, quotas, rollback, backup/restore and accidental PII exposure.
4. Drive file access, proof upload validation, file-ID bypass, content-type/signature checks and download proxy.
5. Market Pulse, Learning, Calculator, VIP-only news, Announcement Center and public ticker privacy boundaries.
6. XSS/HTML injection, DOM sinks, URL handling, CORS, service-worker cache poisoning/stale private data, PWA and browser compatibility.
7. Dependency/workflow/supply-chain risks, secret leakage, logging, error handling and operational recovery.

## Known open acceptance gates

- Actual isolated Google Apps Script execution and real isolated spreadsheet persistence/locking/failure recovery.
- Telegram test bot/group integration and delivery/reconciliation behavior.
- Live isolated Apps Script CORS/redirect/final-body browser test for Public Center.
- Direct URL/API authorization tests in actual Apps Script runtime, including Market Pulse.
- Physical Android/WebView tests for login/session, upload/download, access revocation and private features.
- Independent operational/security review, backup/restore, rollback and incident/recovery evidence.

These are not to be marked passed based on mocks or synthetic CI.

## Release and safety boundary

- Do not merge, deploy, change production Script Properties, migrate or write the live member database, alter webhook/Telegram configuration, provision cloud resources, or enable public-center/member-only features.
- Do not run migration or acceptance harnesses against production. Any real GAS execution must use a separately authorized isolated project and synthetic spreadsheet; the current project constraints prohibit creating a new Apps Script project/spreadsheet without the owner's explicit change of instruction.
- Treat official Winner Draw as simulation-only / NO-GO.
- Return a prioritized finding report first. Remediation must preserve existing member data and the legacy database compatibility contract, and must be retested.

## Evidence caveat

The PR description contains older verification snapshots and commit references. Use the exact target SHA and live Actions run above, not historical numbers embedded in the PR body. Recheck PR head SHA after this handoff document is committed; audit the resulting new head, not the prior SHA alone. The latest CI run above validates the candidate source at the pre-document head; the document-only commit should not be described as a new code test.


## Additional high-priority source-review finding (2026-11-13)

### Auxiliary-sheet auto-creation is reachable from public request paths

The current candidate `candidates/Code.gs` defines several accessors that silently create missing database sheets and write their headers:

- `getMpsApplicationsSheet_()` creates `MPS Applications`.
- `getMpsDepositsSheet_()` creates `MPS Deposit Applications`.
- `getMpsMemberLinksSheet_()` creates `MPS Member Telegram Links`.
- `getOrCreateTelegramSheet_()`, called by `getTelegramAccessSheet_()` and `getTelegramLinksSheet_()`, creates `VIP Access` and legacy `Telegram Links`.

This is not merely an admin-only initialization mechanism. Verified call paths include:

1. Public registration: `apiSubmit()` → `submitCore_()` → `registerMember_()` → `getMpsApplicationsSheet_()`.
2. Public deposit: `apiSubmit()` → `submitCore_()` → `saveDeposit_()` → `getMpsApplicationsSheet_()` / `getMpsDepositsSheet_()` / `getMpsMemberLinksSheet_()`.
3. Public Telegram status check: `apiCheckTelegramLink()` → `getMpsMemberLinksSheet_()`; on fallback it may call `getTelegramLinksSheet_()`.
4. Telegram webhook/start-link handling and admin workflows also use Telegram sheet accessors.

The explicit Super Admin setup path `apiAdminInitializeContent()` already provisions Applications, Deposits, Member Links, and VIP Access. It does not visibly provision the legacy `Telegram Links` tab through that same explicit list.

**Security/operational concern:** a missing auxiliary sheet can be silently created as a side effect of an unauthenticated public request or webhook processing. That can mask incomplete setup, create schema outside the explicit Super Admin provisioning boundary, and leave partially initialized storage if a later step fails. This is a schema-integrity / least-privilege concern; it is not evidence that an attacker can read existing sheet contents or gain spreadsheet ownership.

**Audit request:** trace every caller and distinguish public, webhook-secret, Admin, Super Admin, and test paths. Determine whether the correct design is strict read-only accessors that fail closed when a required sheet is absent, plus separate explicit Super Admin provisioning helpers. Ensure the legacy Telegram Links compatibility path is handled deliberately. Do not make production changes.

**Regression tests requested:**
- Missing auxiliary sheet + public registration: returns a controlled configuration error and creates no sheet.
- Missing deposit/link sheet + public deposit: creates no sheet and no orphan Drive proof file; if file creation occurs before schema validation, verify rollback/trash behavior.
- Missing Member Links/Telegram Links + public token check: returns an unavailable/invalid result without creating tabs.
- Super Admin explicit initialization: creates only the intended missing tabs with exact headers; existing tabs and rows remain unchanged.
- Existing but mismatched headers: fail closed without rewriting the header or creating a replacement tab.
- Existing fully initialized storage: registration, deposit, Telegram verification, and webhook regression suites continue to pass.

This finding is from direct static source tracing on the workbench branch. No live spreadsheet or Apps Script project was accessed or changed. It is an audit lead requiring independent confirmation, not a claim of a completed exploit.


### Additional creation paths found by enumerating every `insertSheet()` and `getMpsContentSheet_(..., true)` call

A second source pass found the following beyond the four primary accessors above:

- `getTelegramLinksSheet_()` also delegates to the auto-creating `getOrCreateTelegramSheet_()`. The explicit `apiAdminInitializeContent()` list visibly initializes `VIP Access`, but does not initialize the legacy `Telegram Links` tab. Audit whether the fallback is still required and provision it explicitly if retained.
- `recordMpsAudit_()` calls `getMpsContentSheet_(MPS_AUDIT_LOGS..., true)`. This helper is called from public workflows as well as admin workflows; for example, public `apiSubmitAdvertisingRequest()` writes an ad request and then records an audit event. Because the audit helper catches errors, missing audit storage may be silently auto-created or audit failure may be hidden from the caller.
- Authenticated member endpoint `apiMemberSetLearningProgress()` calls `getMpsContentSheet_(MPS_LEARNING_PROGRESS..., true)`. The sheet is also included in explicit Super Admin initialization.
- `apiAdminPrepareTelegramVipTransitionStorage()` contains a nested `ensure_()` that creates only the two transition tabs after Super Admin authorization and schema preflight. This is an intentional explicit provisioning path; keep it distinct from request-path auto-creation.
- `getMpsContentSheet_(name, headers, createIfMissing)` already supports a strict `false` read path. Several public read endpoints correctly use `false`; preserve this pattern.

A repository-wide source scan found six direct `insertSheet()` sites in the candidate: Applications, Member Links, Deposits, generic Telegram sheets, the explicitly Super Admin-gated transition `ensure_()`, and generic content sheets when `createIfMissing` is true.

Please classify all `true` call sites by endpoint role and side-effect boundary, not just by the accessor name. Public submissions may legitimately append business records to pre-provisioned tabs, but should not silently create or repair database schema. A missing required tab should fail closed with a controlled configuration error; explicit Super Admin initialization should be the only route that creates ordinary MPS auxiliary tabs. Audit writes must not silently imply that an incomplete audit subsystem is healthy.


### Further important nuance: `createIfMissing=false` still writes headers to an existing empty sheet

The generic helper `getMpsContentSheet_(name, headers, createIfMissing)` returns `null` only when the sheet itself is absent and `createIfMissing` is false. If the tab exists but `getLastRow()===0`, it still writes the header row unconditionally. Therefore, the `false` argument is **not fully read-only**: a read path can mutate an existing blank tab.

Confirmed source shape at the helper:
- Missing tab + false → returns null.
- Missing tab + true → creates tab, then writes headers.
- Existing empty tab + either true or false → writes headers.
- Existing non-empty tab → validates headers, then returns it.

Audit call paths that read through `readMpsContentRows_()` and `getMpsContentSheet_(..., false)`, including public-center rendering and partner-click tracking. A public request against a pre-existing blank auxiliary tab can therefore initialize its schema without Super Admin authorization even though the call site passes false.

**Required regression:** for every read-only call, missing and existing-empty sheets must both remain unchanged (no tab creation, no header write, no formatting change). Move all header initialization to explicit Super Admin provisioning or a separately authorized setup routine. Keep write operations requiring a pre-provisioned sheet and fail closed if missing/empty/mismatched.


## Remediation update — sheet provisioning boundary (2026-11-13)

The candidate source was updated on the workbench branch after reviewing Claude's F-01/F-02/F-03/F-09 findings. This is a candidate-only change; no live Apps Script project, spreadsheet, Drive file, Script Property, Telegram configuration, or production deployment was accessed or changed.

### Implemented in `candidates/Code.gs`

- Added `getMpsSheetStrict_()`: operational getters now fail closed when a required tab is missing or empty and validate the expected header without creating or repairing a tab.
- Added `provisionMpsSheets_()`: the explicit provisioning helper preflights every existing target schema before creating any missing/empty target. A mismatched existing header aborts before any target tab is created or header is written.
- Changed Applications, Deposits, Member Links, VIP Access and legacy Telegram Links accessors to strict operational access. The explicit Super Admin `apiAdminInitializeContent()` provisions the intended auxiliary schemas, including legacy `Telegram Links` while its fallback remains supported.
- Changed `getMpsContentSheet_()` so read-only calls return null for both missing and existing-empty tabs without writing headers, formatting or creating tabs. A call with the legacy `createIfMissing=true` flag now fails closed and instructs the operator to run Super Admin initialization; it no longer creates a tab. This also constrains public ad requests, member learning-progress writes, ordinary admin writes and audit logging.
- Updated the Super Admin VIP transition-storage preparation path to use the explicit provisioning helper for Audit Logs and VIP Ticker Events after its existing schema preflight.
- Moved Member Links schema validation in `saveDeposit_()` before Drive proof-file creation, preventing a missing link tab from leaving an orphan proof file.

### Regression coverage and CI

- Added `tests/apps-script/sheet-provisioning-boundaries.test.mjs`: runtime tests for missing/empty strict access, read-only missing/empty content reads, rejection of operational create flags, preflight-before-create, exact header provisioning, legacy Telegram Links initialization, and deposit storage validation before Drive file creation.
- Updated `tests/telegram-webhook/candidate-vip-chat-member-integration.test.mjs` to assert and mock the new explicit provisioning boundary rather than the former content getter.
- Added the new test to `.github/workflows/pwa-validation.yml`.
- Final GitHub Actions run [#43352928309](https://github.com/marketpsychologysociety/mps-website/actions/runs/43352928309) completed successfully on head `caee5183834e6b10ca3280fc0ccfd26352f54b7f`; all 68 job steps succeeded. The new sheet-provisioning boundary test and the existing candidate VIP integration test both passed. These are Node/V8 tests with mocked Apps Script services plus the existing repository checks; they are not live GAS/Sheets/Telegram/Android acceptance.

### Remaining limitations / audit instructions

- Review every remaining `getMpsContentSheet_(..., true)` caller. It is now fail-closed rather than a creation path, but callers should eventually be renamed/refactored to remove the misleading legacy boolean and receive endpoint-specific controlled errors.
- Verify all required tabs are represented in the Super Admin initialization manifest and that the legacy Telegram Links fallback can be retired safely before removing its provisioned tab.
- `recordMpsAudit_()` still catches a missing-audit-sheet error and returns false; the system configuration diagnostic should explicitly report missing/empty Audit Logs and VIP Ticker Events, and callers must surface audit-persistence warnings where required.
- The helper `provisionMpsSheets_()` is internal and is currently called only from Super Admin-guarded initialization/transition setup paths. Independently verify its call-site inventory remains restricted.
- F-04 through F-08 (including Telegram candidate authorization, durable webhook idempotency, backup/restore completeness and the remainder of Claude's truncated F-08) remain separate review/remediation items.
- PR #12 remains Draft and unmerged. Do not merge or deploy based on this CI result. Live GAS/Sheets, Telegram, production CORS and physical Android/WebView tests remain outstanding.
