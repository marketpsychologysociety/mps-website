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
