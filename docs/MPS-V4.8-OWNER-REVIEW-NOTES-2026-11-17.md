# MPS v4.8 — owner review notes (2026-11-17)

**Scope:** read-only source review of workbench head `5f6a817eab02bd88d91a781b35d3caf7686ddffe` for PR #12. This note records review findings and safe next steps only. It does not authorize merge, deployment, production changes, Public Center activation, or an official draw.

## Current-head reconciliation — 2026-11-17

This reconciliation was added after the original read-only review above. The original review scope/head remains historical; this update is **not** an independent security review and does not claim live operational acceptance.

- Current PR #12 head after the latest test-contract correction: `1a1cd61d59105be67ad9d7cf13b9d1d619aacd8e`. PR remains OPEN / DRAFT / NOT MERGED.
- Current PR-triggered CI run [#44068537403](https://github.com/marketpsychologysociety/mps-website/actions/runs/44068537403) completed SUCCESS, **79/79 workflow steps, 0 failures**, including the Apps Script API contract suite and Chromium browser checks.
- The earlier Public Center direct-route finding is closed in candidate source: `isMpsPublicCenterEnabled_()` requires Script Property `MPS_PUBLIC_CENTER_ENABLED` to equal exactly `true`; `doGet(e)` returns generic `Not Found` otherwise. Contract tests cover missing, false, malformed values and explicit enablement in an isolated harness. The frontend flag remains disabled; no live Script Property was changed.
- The earlier Market Pulse provenance finding is closed in candidate source: the converter emits the exact Binance Spot / `PAXGUSDT` provenance object; the backend validator rejects missing, altered, or extra provenance fields; the candidate UI discloses that PAXGUSDT is a gold-market proxy and not a broker forex XAUUSD feed. The final replacement dataset handoff remains pending.
- Current release blockers remain unchanged: real isolated GAS/Sheets/ScriptLock/trigger acceptance; actual Drive ACL and direct-route/API authorization; Telegram test-bot delivery/reconciliation; physical Android acceptance; independent security/operational review; real backup/restore evidence; final Market Pulse dataset handoff; and explicit owner release authorization.
- No production deployment, live Script Property, spreadsheet/member data, Drive ACL, Telegram configuration, trigger, or production resource was changed.

## Verified GitHub snapshot

- PR: https://github.com/marketpsychologysociety/mps-website/pull/12
- State: OPEN / DRAFT / NOT MERGED.
- Head: `5f6a817eab02bd88d91a781b35d3caf7686ddffe` (`mps-v4.8-workbench`).
- Base: `43d9fb9c9383853e9e2d2775393e7e700c18f5d6` (`main`).
- PR-triggered workflow run #2160: https://github.com/marketpsychologysociety/mps-website/actions/runs/43990241055
- Run #2160 was completed/success on the exact head above. Job `validate-pwa` completed all listed steps successfully, including Chromium checks. Apps Script, Sheets, Drive, and Telegram tests in this workflow use synthetic or mocked services and are not live operational acceptance.

## Findings requiring closure before any release proposal

### 1. Public Center needs a backend-side default-off gate

In `candidates/Code.gs`, `doGet(e)` dispatches `?publicCenter=1` directly to `apiGetPublicCenter()`. In `config.js`, `publicCenter.enabled` is false, but that is a frontend configuration value and does not itself guard the Apps Script route.

**Safe release requirement:** keep the frontend flag false and add an independent server-side default-deny control for the Public Center route. The server gate must remain off unless a separately approved, explicit activation is configured. Add regression tests for direct URL requests with the gate absent, false, malformed, and explicitly enabled in an isolated test harness. Do not test against or alter the configured live Apps Script deployment.

Relevant source:
- `config.js` Public Center flag.
- `candidates/Code.gs` `doGet(e)` Public Center route.

### 2. Public VIP ticker identity contract

The current product requirement is to display a verified member's real display name in the VIP ticker, not the internal MPS Member ID. The current candidate renderer reads `MemberName` and filters email/phone-like strings, MT5/login identifiers, Telegram handles/IDs, MPS IDs, URLs, and payment-like values before rendering with text content.

**Acceptance requirement:** preserve the approved real-name display behavior, keep internal Member IDs and unrelated sensitive fields out of the public response, and verify both backend projection and frontend rendering with regression tests. Do not revert to an ID-only display contract. Live GAS response verification remains outstanding.

Relevant source:
- `candidates/Code.gs` public feed projection and identity validation.
- `js/public-center.js` ticker renderer.

### 3. Market Pulse source provenance must be explicit

The candidate converter emits `instrument: XAUUSD`, `timeframe: M5`, and `timezone: Asia/Jakarta`, but the generated dataset schema does not include a source/provenance field.

**Required product disclosure:** identify the data source as Binance Spot `PAXGUSDT`, described as a gold-market proxy. Do not describe it as a broker-forex XAUUSD feed. Preserve the familiar XAUUSD display label only alongside this explicit source disclosure. Add schema/validator tests requiring the provenance metadata before any replacement dataset is accepted.

No final replacement dataset is approved or published by this review. The user's post-PR dataset handoff remains pending.

Relevant source:
- `scripts/build-market-pulse-dataset.mjs`.

### 4. Acceptance documentation is stale

The current `docs/MPS-V4.8-REMAINING-ACCEPTANCE-GATES.md` snapshot still cites older heads and workflow runs (for example, #2152 / `fe1864b...`) rather than the exact current head and run #2160.

**Safe documentation action:** reconcile the authoritative snapshot after the next code or documentation change, clearly distinguish current CI evidence from historical notes, and keep live Apps Script/Sheets/Drive/Telegram/Android acceptance marked open until performed.

## Explicit non-claims and boundaries

- CI success is not proof of live Apps Script execution, production spreadsheet behavior, actual Drive ACL inheritance, Telegram delivery, or physical Android acceptance.
- This review did not inspect or change the production Apps Script deployment, live spreadsheets, Drive ACLs, Script Properties, Telegram configuration, triggers, DNS, hosting, or production member data.
- No merge or deployment was performed or authorized.
- `publicCenter` remains disabled; no public activation was performed.
- Official Winner Draw remains BLOCKED / NO-GO; Lucky Roulette remains SIMULATION ONLY.
- No production or candidate source code was changed as part of this review note.

## Recommended work order

1. Add and test a server-side default-deny Public Center gate in the isolated candidate.
2. Add required Market Pulse provenance fields and validator tests using the approved PAXGUSDT proxy disclosure.
3. Re-run full CI on the resulting exact head and record the run ID/SHA.
4. Reconcile the acceptance snapshot and PR description to current GitHub metadata.
5. Keep all live operational gates and owner approvals outstanding until separately completed.

**Disposition: REVIEW ONLY — RELEASE NO-GO.**


## Follow-up hardening checkpoint — 2026-11-17

This section supersedes the earlier Public Center route finding above for the candidate source at head `f4b81c289fdde6850e2d224fc268ac1d146fa212`.

- Added `isMpsPublicCenterEnabled_()` in `candidates/Code.gs`. The direct `?publicCenter=1` route now returns a generic `Not Found` text response unless Script Property `MPS_PUBLIC_CENTER_ENABLED` is exactly the string `true`. Missing, false, malformed values, and property-read exceptions fail closed. The public `config.js` flag remains false and is not treated as backend authorization.
- Added isolated regression coverage in `tests/apps-script/api-contract.test.mjs` for absent/false/malformed property values and explicit true, and updated `tests/apps-script/public-ticker-privacy.test.mjs` to load the new backend helper in its isolated GET-bridge harness.
- GitHub Actions run [#44022596543](https://github.com/marketpsychologysociety/mps-website/actions/runs/44022596543) completed **SUCCESS, 78/78 steps, 0 failed steps** on this exact head. Both new route-gate and existing public-center bridge regression tests passed. The public VIP ticker privacy test also passed.
- The earlier intermediate run #44022484266 failed because the pre-existing public-center bridge test harness did not load the new helper. That harness was updated; the later exact-head run above passed. Do not treat the intermediate failure as a source runtime failure.
- PR #12 remains OPEN / DRAFT / NOT MERGED. The head is `f4b81c289fdde6850e2d224fc268ac1d146fa212`, base `43d9fb9c9383853e9e2d2775393e7e700c18f5d6`; mergeability was true at the time of this checkpoint.
- No production deployment, live Script Property, Google Sheet, Drive ACL, Telegram setting, trigger, or production resource was changed. The backend flag was not set to true anywhere; Public Center remains disabled.
- This is isolated candidate CI only. It does not prove execution in a real Apps Script deployment or live data transport.


## Member recovery and Exness transparency follow-up — 2026-11-17

- Candidate backend and login UI now include MT5-bound self-service recovery for forgotten PIN and forgotten Member ID. Confirmation is sent only to the previously verified private Telegram chat; Member ID is not returned to the browser. PIN reset uses the existing salted verifier and invalidates sessions through the existing verifier-bound session check.
- Recovery fallback points to Admin when the old Telegram account is unavailable; Admin must verify existing registration/deposit evidence. This has not been tested against a live Telegram bot or production member.
- Rebate page now discloses that Exness Partnership API data is **NOT CONNECTED / WAITING FOR PARTNER API ACCESS**, explains the future read-only data model and status semantics, and shows no fabricated live figures. The public page's deposit minimum is aligned to Rp1.000.000, matching Membership.
- GitHub Actions run #44023899652 passed 78/78 steps on candidate SHA `932904aa2c1f1716bd11c19e0ecd41c0d4f164ec`. Latest doc-only commits after that SHA require their own exact-head CI before claiming a pass for the latest head.
- Exness integration remains blocked on verified partner API eligibility/access, read-only key, Ed25519 signing-key handling, secure backend signing runtime, verified unique account mapping, and reconciliation acceptance. Do not ask for secrets in chat or commit them.
- No production deployment, live Apps Script changes, Telegram bot settings, Exness API calls, member data changes, or payout operations were performed.


## Follow-up hardening — Telegram link creation and current CI (2026-11-17)

- Candidate `createMemberTelegramLink_()` now reads and validates the Telegram bot username before any persistent link-row append. The exact intended row/token is still exposed to the caller's compensation callback before append, covering a remote append that persisted but returned an ambiguous error.
- Added two end-to-end deposit rollback regressions using the actual candidate helper: configuration-read failure before append leaves no link row; append-after-write response loss cancels the exact prepared row and restores deposit/application/previous-link state.
- The updated deposit rollback suite passed **5/5**. Admin verification rollback/reconciliation tests and all other workflow steps also passed in the same run.
- GitHub Actions run [#44036830268](https://github.com/marketpsychologysociety/mps-website/actions/runs/44036830268), run number 2220, completed **SUCCESS, 78/78 workflow steps, 0 failures** on exact code/test head `3cca60f93c3116199498b1049992b8951ac16f4d`.
- This is repository CI using synthetic/mocked Apps Script, Sheets, Drive, Telegram and local Chromium. It does not establish real Apps Script execution, real spreadsheet locking/persistence, live Drive ACL, Telegram delivery, or physical Android acceptance.
- Exness referral assets are now owner-confirmed for MPS: direct registration URL `https://one.toexness.com/a/bdthbxwb2q?platform=mobile` and QR destination `https://one.toexness.com/a/bdthbxwb2q?method=qrcode`, both using referral code `bdthbxwb2q`. This is a blueprint/documentation decision only; API access and live integration remain unverified.
- PR #12 remains OPEN / DRAFT / NOT MERGED. No production main, Apps Script deployment, database, Drive ACL, Script Properties, Telegram configuration, or Exness account settings were changed.


## Market Pulse provenance correction and exact-head CI — 2026-11-17

- Closed the source-provenance gap noted in the earlier owner review: the converter now emits `source.provider=Binance Spot`, `source.symbol=PAXGUSDT`, and an explicit statement that this is a gold-market proxy, not a broker forex XAUUSD feed.
- The backend validator requires the exact provenance object and fails closed on missing/altered/extra source metadata. Public preview, Market Pulse header, and authenticated member/Admin note visibly disclose the PAXGUSDT source while retaining the familiar XAUUSD label.
- Market Pulse converter/validator/access suite passed **12/12**; deposit rollback suite passed **5/5**; Chromium browser checks passed.
- GitHub Actions run [#44037414873](https://github.com/marketpsychologysociety/mps-website/actions/runs/44037414873), run number 2235, completed **SUCCESS, 78/78 workflow steps, 0 failures** on exact code/test head `42df8a43fc3abe5cf99f6603bd382b4c742dfa2d`.
- This does not approve a final dataset. The user-directed replacement dataset handoff remains pending; the earlier raw PAXGUSDT conversion remains candidate-only and must not be published as final.
- All checks are repository CI, synthetic/mocked Apps Script/Drive/Sheets, and local Chromium. Live GAS/Sheets/Drive ACL, actual API authorization, Telegram delivery, and physical Android acceptance remain outstanding.

## Focused backend authorization and recovery review — 2026-11-17

- Re-read the current workbench `candidates/Code.gs` and the related session/Market Pulse regression suites. This was a source-level review of selected high-risk entry points, not a complete independent penetration test.
- Web App routing: the public-center bridge is default-deny behind the exact server-side Script Property flag; the health/status routes return bounded metadata/status only; Telegram webhook processing requires the configured secret path and constant-time comparison. The public `tradingSignal` POST path separately validates the per-bot secret, bot enablement, instrument/timeframe allowlists, event fingerprint, ownership, and allowed state transitions.
- Member access: member sessions are opaque random tokens stored by hash, bound to the current PIN verifier, and re-check current member/deposit approval on each protected call. Admin sessions are bound to the current role credential hash; Admin/Super Admin use distinct credentials and TOTP secrets, and Super Admin endpoints re-check the server-side role. Market Pulse member/Admin endpoints require the corresponding session, and the source file plus parent folder are checked for PRIVATE sharing before data is read.
- Recovery flow: MT5 lookup must resolve to exactly one active member; Telegram recovery requires exactly one valid prior link whose user ID equals its private chat ID and whose link timestamp is valid; completion rechecks that the Telegram chat has not changed. Member ID is sent only to that private Telegram chat, not returned to the browser. Existing automated session-authorization and Market Pulse suites cover key fail-closed boundaries.
- **Resolved in candidate code:** the earlier recovery-challenge replacement race is now serialized with ScriptLock across challenge write, Telegram delivery, and completion; the exact-challenge cleanup and lock release are regression-asserted in `request-security-hardening.test.mjs`.
- The latest documentation-only PR-head workflow run #2250 completed SUCCESS on `2cc5e461d3fd007d5b170a4807dec20c59aa8c88`; its reported job was PWA validation. The broader code/test workflow run #2235 completed SUCCESS (78/78 steps) on exact code/test SHA `42df8a43fc3abe5cf99f6603bd382b4c742dfa2d`. Do not conflate these two commits or imply the latest documentation-only run repeated all code suites.
- Remaining external gates are unchanged: isolated real Apps Script/Sheets/ScriptLock acceptance, real Drive ACL checks, isolated Telegram Bot API delivery/reconciliation, physical Android/PWA acceptance, independent security review, backup/restore drill, final replacement Market Pulse dataset handoff, and explicit owner release authorization. No production service, data, credentials, or deployment was changed.

## Member recovery challenge race hardening — 2026-11-17

- Implemented in candidate code: `apiMemberRecoveryStart` now acquires the Apps Script `ScriptLock` before replacing the MT5-keyed recovery challenge and holds it through Telegram delivery and failed-delivery cleanup. `apiMemberRecoveryComplete` already uses the same script lock, so challenge replacement/delivery cannot interleave with another start or completion.
- Failed-delivery cleanup deletes only the exact challenge written by that invocation. The lock is released in `finally`; audit records are written after release.
- Added a regression assertion to `tests/apps-script/request-security-hardening.test.mjs` for lock ordering, serialization through Telegram delivery, shared completion lock, guaranteed release, and exact-challenge cleanup. The workflow includes this test file.
- Candidate source and regression test are committed on the workbench branch. Workflow run #2261 (`44042182475`) completed SUCCESS on exact head `01e7fcb2ad7aab6fc51ffb7fdddd200aa20e5963`; the workflow includes `request-security-hardening.test.mjs`. This is synthetic/mocked CI, not live Apps Script or Telegram acceptance.


## PIN reissue delivery ambiguity — resolved in candidate source; live acceptance still open

- The earlier direct-rollback behavior described below has been replaced in candidate `apiAdminIssuePin`: `PENDING_DELIVERY` is persisted before the verifier changes; ambiguous Telegram outcomes retain the exact new verifier in `REVIEW_REQUIRED`; member login fails closed until delivery is confirmed; and stale failures cannot quarantine a newer issuance.
- The legacy member-ID approval path now delegates to this shared hardened issuer and no longer sends a PIN or writes a verifier directly. Regression tests cover both paths.
- This resolves the source-level design gap, not the external delivery proof. Real isolated Apps Script/ScriptLock execution and an isolated Telegram test-bot “accepted message, response lost” test remain required before production release. Never infer delivery failure from an ambiguous Telegram response or expose PIN values in logs/browser/public data.
- Latest verified full CI for candidate head `fd7a76483cbd8e64d02b209d39ada4d0d54b67a8`: run [#44049472255](https://github.com/marketpsychologysociety/mps-website/actions/runs/44049472255), **SUCCESS, 79/79 steps**; PIN/recovery delivery suite **9/9**, Chromium checks **15 pages**. Synthetic CI does not replace live Apps Script or Telegram acceptance.

## Recovery-code delivery ambiguity — source-level mitigation

- The recovery challenge is stored before Telegram send and is retained for its exact 10-minute lifetime when Telegram delivery is unconfirmed, because the message may have been accepted despite a lost response. A fresh recovery request replaces the challenge; salted hash, five-attempt limit, rate limits, and verified private Telegram binding remain enforced.
- The response remains generic and audit status is `DELIVERY_UNCONFIRMED`; no code is returned to the browser. Regression coverage is in `admin-pin-delivery-hardening.test.mjs` and passed in the same full CI run.
- Real Telegram test-bot acceptance and real Apps Script runtime acceptance remain open.
