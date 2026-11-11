# MPS v4.8 — remaining acceptance gates

**Snapshot:** 11 November 2026  
**Workstream:** Draft PR #12, branch mps-v4.8-workbench  
**Release status:** NO-GO for production deployment

## Completed in this workstream

- PR #12 remains open and Draft. Latest recorded PR CI run #636 completed successfully: 36/36 steps, including PWA/privacy validation, Telegram journal contract tests, mocked Apps Script spreadsheet-adapter tests, and Chromium browser checks.
- Telegram update journal contract now covers canonical payload hashing, duplicate deliveries, cache eviction independence, retry/review states, expired leases, fencing tokens, payload-ID collisions, reconciliation, and fail-closed behavior.
- A separate Apps Script spreadsheet adapter candidate exists under tests/telegram-webhook. It requires an explicit spreadsheet ID and exact pre-provisioned tab schema; it is not wired into doPost/processTelegramUpdate_ and does not read Script Properties.
- The public Market Pulse page has a browser regression check for Member Only labeling, static-preview disclosure, demo ticker, and absence of inline or external market-data datasets.
- The public-center loader no longer injects the Apps Script response as executable JavaScript. It fetches with CORS, omits credentials, uses no-store caching and a timeout, validates a strict envelope, and parses with JSON.parse. Browser tests cover a mocked CORS response, malformed executable payload rejection, and inert HTML-like announcement content.
- Public Center remains disabled by configuration. The live Apps Script CORS/redirect behavior has not been tested, so the flag must stay disabled.
- The latest isolated Code.gs candidate was source-reviewed for masked public ticker IDs, unique-suffix disclosure, exclusion of legacy name-bearing events, masked Admin ticker projection, and member/VIP Market Pulse authorization. A local static/mocked audit passed, including 250 populations of 250 generated IDs. This is not an Apps Script runtime test and the candidate is not deployed.

## Remaining gates

| Area | Remaining work | Current status |
|---|---|---|
| Telegram journal | Run adapter in a separate Apps Script project and isolated spreadsheet; test real lock contention, interruption, persistence, quota, latency, backup/restore | NOT STARTED |
| Telegram handlers | Implement per-handler reconciliation and effect outbox; resolve ambiguous welcome/admin notifications and VIP ticker/audit crash windows | PARTIAL — source gaps documented |
| Telegram deployment | Integrate only after isolated runtime acceptance; production webhook migration requires separate explicit approval | NOT AUTHORIZED |
| Public Center | Verify data-only CORS and redirect behavior against a separate Apps Script deployment; keep feature flag disabled until then | BLOCKED on isolated runtime |
| Backend privacy | Replace stale legacy ticker test assertions with a privacy-specific regression suite against the exact candidate Code.gs; run in isolated GAS | PARTIAL — local source audit only |
| API security | Prove direct URL/API authorization with authenticated and unauthenticated live runtime tests | NOT STARTED |
| Database | Test real isolated persistence, concurrency, failure recovery, and restore; do not touch production data | NOT STARTED |
| Android | Build APK and test WebView login/session, uploads/downloads, Pulse access, ticker, and revocation on supported devices | NOT STARTED |
| Winner Draw | Independent security and operational acceptance; no official draw until all gates pass | NO-GO |
| Production release | Independent review, explicit approval, migration/rollback plan, then separately authorized merge/deploy | NOT AUTHORIZED |

## Non-negotiable boundaries

- No changes to production main, live spreadsheet, Apps Script active deployment, Drive, Script Properties, Telegram webhook, Telegram bot/group, DNS, or hosting.
- Do not treat mocked Apps Script services or synthetic state-machine tests as proof of real durability or exactly-once behavior.
- Google Sheets plus ScriptLock is not a transactional database. If isolated runtime tests cannot prove adequate durability and operational headroom, use a transactional datastore.
- Telegram sendMessage has no caller-supplied idempotency key or reliable lookup by our local effect key. Ambiguous outcomes must be reviewed or an explicit duplicate-delivery tradeoff accepted.
- Do not enable the public feed through executable script injection. Keep the current data-only parser and feature flag disabled until live CORS behavior is verified.
- Do not merge or deploy PR #12 without separate explicit authorization.

## Evidence

- PR #12: https://github.com/marketpsychologysociety/mps-website/pull/12
- Latest successful CI run #626: https://github.com/marketpsychologysociety/mps-website/actions/runs/43015754675
- Production main remains at baseline commit 9f5d9128f7226b1a53cbcaa1615068e7a7fbc6ff.
