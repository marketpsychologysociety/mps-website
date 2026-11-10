# MPS v4.8 — Workbench & Acceptance Plan

**Status:** Workbench branch only. Production `main` is unchanged.
**Baseline:** `main` at `9f5d9128f7226b1a53cbcaa1615068e7a7fbc6ff`.
**Branch:** `mps-v4.8-workbench`.
**Rule:** Never mark an item complete without evidence. Static inspection, automated browser tests, and live production tests are separate evidence classes.

## Operating SOP

- Check and re-check every change.
- Cross-check HTML routes, CSS selectors, JavaScript handlers, manifest, service worker, API calls, backend assumptions, and version compatibility.
- Run available static checks and automated tests after each coherent change.
- Record quality score, security risk, evidence, and remediation.
- Fix safe, isolated issues directly on this branch; do not mutate production.
- Preserve the existing Telegram bot, Apps Script deployment, database, member records, and secrets.
- Stop for explicit approval before production deployment, database/member-data changes, credential rotation, or any irreversible operation.
- Keep estimates as active-work estimates, not promises of background execution.

## Brand and product direction

**Primary brand line:** DISCIPLINE OVER IMPULSE  
**Supporting pillars:** Discipline · Psychology · Community  
**Positioning:** Market Intelligence · Trading Psychology · Community  
Signal is an engagement and member-value feature, not the entire MPS identity. Members should still find value when there is no valid trading setup.

Use clear Indonesian for important explanations and disclaimers. Retain common trading terms (BUY, SELL, Entry, Stop Loss, Take Profit, Market Pulse, Heatmap) where clearer, with Indonesian explanations when needed. Keep accurate claims aligned with features actually operating.

## P0 — Production/backend security audit (3–5 active hours)

- [ ] Identify the actually deployed Apps Script project/version and deployment URL.
- [ ] Compare deployed source with repository and candidate v4.8.
- [ ] Audit login, PIN, session lifecycle, expiry, admin/member roles, and all API entry points.
- [ ] Test direct URL/API access and tampered requests.
- [ ] Review Sheets, Drive, deposit proof, Learning files, Pulse datasets, and Telegram secret handling.
- [ ] Review spam, duplicate submissions, race conditions, validation, and authorization.
- [ ] Confirm public users cannot retrieve private Market Pulse/member data.
- [ ] Record findings by severity and evidence.

## P1 — v4.7 to v4.8 feature parity (3–5 active hours)

- [x] Compare top-level navigation labels: 10 legacy items were present in candidate v4.8; Calculator VIP is an addition.
- [ ] Compare routes, submenus, mobile navigation, role gating, buttons, forms, and APIs.
- [ ] Verify Beranda/ticker, registration, deposit, Heatmap, Dashboard, Learning/PDF, Pulse/datasets, News & Review/calendar, Advertise, Admin, verification/PIN/member management, Telegram/community, settings/announcements/briefing.
- [ ] Verify Calculator VIP, backend authorization, membership gating, and integration.
- [ ] Produce preserved/added/missing/unverified matrix.

## P2 — Member and database flow (2–4 active hours)

- [ ] Verify registration → Application Ref → deposit confirmation → Telegram verification → admin decision → Member ID → PIN → successful activation.
- [ ] Verify old and new member ID formats and exact deployed database schema.
- [ ] Check minimum-deposit consistency across UI/backend/terms.
- [ ] Verify duplicate handling, upload constraints, and status transitions.
- [ ] Preserve all existing member data and historical sheets.

## P3 — Signal Center and Market Intelligence (9–15 active hours)

- [ ] Audit the currently running analysis bot without interrupting it.
- [ ] Define one backend data contract feeding Telegram and MPS website.
- [ ] Build member-gated Signal Center with active signals, Plan A/B/C, Entry/SL/TP/RR, multi-timeframe 4H/1H/15M, SND/FVG/SNR context, and status lifecycle.
- [ ] Add Market Outlook (bullish/bearish scenarios, invalidation, and reasons).
- [ ] Add signal history and performance statistics with transparent methodology.
- [ ] Add Tokyo, London, and New York session clocks, local times, WIB conversion, open/closed status, countdowns, and DST-aware rules.
- [ ] Verify no duplicate notifications and consistent state between Telegram and web.
- [ ] Keep tokens and internal bot details server-side.

## P4 — Android/iPhone PWA (3–5 active hours)

- [ ] Validate manifest identity, scope, start URL, icons, display mode, and installability.
- [ ] Validate service-worker cache allowlist; never cache private API/session/HTML responses.
- [ ] Validate update lifecycle and offline fallback.
- [ ] Test Android Chrome installation and standalone launch.
- [ ] Test iPhone Add to Home Screen / Open as Web App and standalone launch.
- [ ] Test responsive layouts, orientation, safe areas, forms, navigation, and session continuity.
- [ ] Record actual device/browser test evidence separately from desktop emulation.

## P5 — Language, brand, design, ticker (3–5 active hours)

- [ ] Audit every page's title, meta description, nav, headings, CTA, labels, notices, errors, status, and disclaimer.
- [ ] Preserve clear/accurate text; revise only inaccurate, confusing, inconsistent, or off-brand copy.
- [ ] Use the agreed brand lines and positioning consistently.
- [ ] Update disclaimer in plain Indonesian: analysis/signals are informational/educational, not personalized advice or profit guarantees; trading risks loss; decisions remain with each trader.
- [ ] Implement a responsive, accessible, continuously moving ticker across intended pages.
- [ ] Respect reduced-motion preferences and pause/avoid disruptive animation when appropriate.
- [ ] Never expose phone, email, Telegram ID/username, MT5 login, deposit amount/date, proof, PIN, or tokens in public ticker.
- [ ] Apply premium dark styling with restrained neon blue, orange, and green accents.

## P6 — Regression and acceptance testing (3–5 active hours)

- [ ] Test every menu, submenu, CTA, form, API, and role boundary.
- [ ] Test member lifecycle and private resources.
- [ ] Test Telegram + Signal Center state consistency.
- [ ] Test ticker and market session clocks.
- [ ] Test Android, iPhone, desktop, offline, and PWA update.
- [ ] Run repository validation and browser automation.
- [ ] Report PASS / FAIL / NOT TESTED with evidence.

## P7 — Release preparation (1–2 active hours)

- [ ] Cross-check complete final Code.gs and HTML files.
- [ ] Produce full files one at a time and concise installation notes.
- [ ] Back up and document the current production baseline.
- [ ] Obtain explicit approval before production deployment.
- [ ] Verify live site/backend after approved release.

## Initial repository inspection — evidence-based notes

- The public repository has static HTML pages, a PWA manifest, service worker, public configuration, and a PWA validation workflow.
- `index.html` currently uses “TRADE WITH DISCIPLINE.” and states “Bukan penyedia sinyal atau jaminan profit.” This conflicts with the intended future Signal Center positioning and must be revised only after feature scope and disclaimers are accurate.
- `config.js` currently repeats “TRADE WITH DISCIPLINE.” as the configured tagline.
- Navigation labels differ between pages; `terms.html` and `privacy.html` have an older English navigation set.
- `js/main.js` handles mobile nav and the home image slider; no shared ticker implementation was found in the inspected home page and main script.
- `manifest.webmanifest` already declares standalone display, Indonesian language, and icons. This is a useful foundation, not proof of installability on real devices.
- `sw.js` uses an explicit public asset allowlist and bypasses HTML navigation caching and non-allowlisted paths. Preserve these privacy protections during any changes.
- README explicitly warns that repository Apps Script files are historical/legacy, not proof of the currently deployed backend. Do not deploy them as a replacement.
- The public website uses a separate Apps Script web app for member operations. The live deployment source and current bot source have not yet been verified from this repository.

## Acceptance rules

A feature is not complete because a menu exists or code parses. It is complete only when its expected behavior is tested with evidence at the appropriate level. Do not report production security, Google Sheets/Drive, Telegram, or device behavior as passed without actual end-to-end evidence.


## P1/P5 — Detailed requirements recovered from prior MPS decisions (added 2026-11-10)

### Learning — premium member library

- [ ] Public visitors see an attractive visual/interactive teaser only; full lessons and files remain member-only.
- [ ] Member content covers trading psychology, money/risk management, SMC/ICT, market structure, liquidity/order blocks, price action, trading plans/journals, and case studies.
- [ ] Organize by category and learning level; support PDF, visual, and video resources, descriptions, ordering, publication status, updates, and archive/history.
- [ ] Admin can upload private PDFs (historical requirement: maximum 8 MB), validate files, set title/category/level/order/description/status, publish/unpublish, edit, archive, and control public teaser content.
- [ ] Keep Learning files in private Drive storage; enforce authorization in backend, not only by hiding UI.
- [ ] Verify member progress/catalog behavior only if the current implementation supports it; do not claim progress tracking exists without testing.

### News & Review — premium market intelligence

- [ ] Public visitors see teaser cards/visuals only; full analysis is member-only and backend-authorized.
- [ ] Coverage includes NFP, FOMC, CPI/PCE, Federal Reserve statements, macroeconomic releases, geopolitics/international events relevant to XAU/USD.
- [ ] Each published item should include source and publication time, concise summary, why it matters, potential USD/XAUUSD impact, bullish/bearish/neutral scenarios, and volatility/risk notes.
- [ ] Admin workflow includes source/sync review queue, editorial review, impact analysis, publish/edit/archive, and source URL tracking.
- [ ] Economic calendar records should support event name, date/time and timezone, importance, currency/asset impact, forecast/previous/actual where applicable, status, and source URL.
- [ ] Announcements should support audience targeting (Public / Member / VIP), scheduling, visibility controls, and history.
- [ ] VIP Briefing should support controlled publication and VIP-only access.
- [ ] Never imply automatic live news synchronization until the source connector and refresh behavior have been verified.

### Advertising / Advertise — public advertiser intake, admin-controlled delivery

- [ ] Public page explains cooperation opportunities and displays available packages.
- [ ] Prospective advertisers can submit a request with brand/company, contact details, offer/proposal, preferred placement, and ad materials.
- [ ] Admin exclusively controls package creation, IDR pricing, duration, placements, review/approval, payment status, scheduling, active dates, publication, pause/stop, and performance statistics.
- [ ] Published ads require admin approval and controlled target/placement/start/end dates.
- [ ] Public teaser must not expose advertiser private contact or proposal data.
- [ ] Validate uploaded material and prevent unsafe files or untrusted scripts from being served.
- [ ] Advertising workflow must be tested end-to-end before claiming it is operational.

### Admin Control Room integration

- [ ] One coherent admin area manages Learning, News & Review, calendar, announcements, VIP briefings, advertising packages/requests/placements, and member/VIP access.
- [ ] Every admin action is role-authorized server-side and leaves an auditable status/history record where supported.
- [ ] Verify private Drive folder permissions and backend authorization before publishing or serving files.

These requirements are recovered from the user's earlier MPS decisions and are binding acceptance criteria. They are now explicit checklist items; their presence in this document does not mean implementation or runtime verification is complete.


## Follow-up static audit — 2026-11-10

### Confirmed public-site findings (source inspection only)

- The workbench tree contains 31 tracked files, including 14 public HTML pages, shared CSS/JS, PWA assets, two historical Apps Script source copies, and PWA validation scripts.
- The main Indonesian navigation is not consistent across pages. The home/education/member portal mostly use Indonesian labels, while About/Contact/System/Membership/Join/Rewards/Rebate retain older English navigation labels (Home, Core System, Education, Membership, Join, Free Heatmap). Footer navigation also varies.
- index.html and config.js still use the older TRADE WITH DISCIPLINE tagline; no shared ticker/marquee code was found in the inspected home page or js/main.js.
- No dedicated public News & Review, Advertise, Signal Center, or Market Outlook page exists in the inspected repository tree. This is a repository-tree observation, not a claim about other external systems.
- education.html and heatmap.html link to the same published Apps Script web-app deployment URL with different page=learning and page=pulse parameters. member-portal.html links to register, learning, dashboard, pulse, and admin routes on that same URL. The deployment's active source and authorization behavior remain unverified.
- join.html and deposit-confirmation.html intentionally contain no legacy HTML forms; they direct users to the member portal. This matches the current PWA validator's regression expectation.
- membership.html and deposit-confirmation.html state a minimum deposit of Rp1,000,000. The historical repository copies google-apps-script/Code.gs and google-apps-script-v2/Code.gs enforce Rp1,500,000. Because README marks these Apps Script copies as historical/legacy, this is a critical version-consistency item to verify against the actually deployed backend, not proof of a live production mismatch.
- Both historical backend copies are publicly readable in this public repository. The v2 copy accepts public registration/deposit POSTs and uses a supplied Telegram username to locate/update a member row; it has no identity-bound authorization in the inspected registration/deposit handlers. This is a high-risk legacy-source finding only; do not infer that this code is deployed. Confirm the live deployment before any security conclusion or change.
- The first historical backend copy has a public doPost deposit path that appends a deposit record without matching a verified member identity in the inspected handler. It also enforces Rp1,500,000. Again, this is legacy source evidence only.
- sw.js uses a public asset allowlist, bypasses cross-origin and non-GET requests, does not cache document navigations, and uses network-first updates for CSS/JS/config. Preserve these protections. config.js is cached as a public asset; inspect it for secrets before any future configuration change.
- The existing PWA validator checks 14 HTML pages, manifest/icons, inline JavaScript syntax, local references, duplicate IDs, _blank rel attributes, Join/Deposit regression, and selected service-worker privacy/update rules. It does not prove member authorization, live Apps Script behavior, Telegram integration, real-device installability, or the correctness of every route/API.
- The PWA workflow runs both the static validator and Playwright Chromium checks. The last previously inspected successful main run is historical evidence only; no new CI run was triggered by this audit.

### Current evidence / blockers

- Static inspection: performed on the mps-v4.8-workbench branch.
- Workbench-to-main comparison: workbench is based on main; the only changed path is this planning/audit document. Production main remains unchanged.
- Browser audit: not run in this turn. TinyFish previously failed before launch because its wallet balance was negative; no retry is appropriate until the wallet is funded.
- Live Apps Script source, deployed version, spreadsheet schema, Drive permissions, Telegram bot source, and actual member authorization remain NOT VERIFIED.
- No production data, deployment, credentials, or running bot were modified.

### Immediate priorities from this audit

1. Obtain a read-only copy/export of the actually deployed Apps Script source and identify its deployment/version without changing it.
2. Compare its schema and role/session authorization with the 18-column legacy database and the v4.8 candidate schema before any migration or code change.
3. Resolve the Rp1,000,000 UI versus Rp1,500,000 historical backend discrepancy only after confirming the live rule and business decision.
4. Normalize all public-page navigation labels and route targets on the workbench branch.
5. Implement the agreed ticker and missing product pages only after route, role, and data contracts are defined.
6. Add targeted automated checks for all internal links, public/private route boundaries, and API contract assumptions; retain live E2E as a separate acceptance stage.


## Follow-up implementation audit — 2026-11-11 (workbench)

### Evidence checked in current branch

- Re-fetched `index.html`, `js/main.js`, `css/style.css`, `config.js`, and `sw.js` directly from `mps-v4.8-workbench`; current blob SHAs were recorded during the audit.
- `index.html` now shows the intended primary tagline, `DISCIPLINE OVER IMPULSE`, in the page title, brand label, and hero. `js/main.js` uses the same value as the dynamic fallback. The prior finding that the homepage still used the old tagline is therefore superseded for this workbench snapshot.
- No ticker/marquee markup or ticker runtime was found in the current `index.html` or `js/main.js`. The animated member social-proof ticker is still NOT IMPLEMENTED.
- The public homepage's Market Pulse section explicitly labels the preview `MEMBER ONLY`, says actual data is not shown publicly, and links to `heatmap.html`. This is correct public-facing intent only; it does not prove backend protection.
- `config.js` contains public brand/contact settings and the published Apps Script endpoint URLs. The inspected file does not contain an apparent bot token, password, PIN, or secret API key. Endpoint URLs are public routing information and must never be treated as authorization.
- `sw.js` retains its public-asset allowlist and parameterized-request cache bypass rule for session/token/auth requests. Do not weaken these controls while adding ticker or member features.
- `js/main.js` currently updates brand strings through `textContent`, which avoids interpreting configuration text as HTML. Preserve this behavior.

### Decision and safe next actions

- Do NOT fabricate member names or ticker events in frontend code. The ticker requires an authenticated/admin-controlled backend feed or a reviewed public-safe event feed. Until that contract is verified, it remains unimplemented rather than displaying synthetic social proof.
- The ticker must use only the member display name and a minimal approved event (for example, membership approval), and must exclude phone/email, Telegram handle/ID, MT5 login, deposit value/date, proof documents, PIN, and credentials.
- Backend authorization must be verified independently for direct URL and API access before any private Pulse or member data is rendered.
- No source file was changed during this audit pass; no deployment, live endpoint call, spreadsheet mutation, credential change, trigger change, or production database operation was performed.
- Evidence level: repository source inspection only. Browser rendering, automated browser tests, live backend authorization, Google Sheets/Drive integration, Telegram delivery, and physical-device tests remain NOT TESTED.


## Follow-up requirements — Admin-managed content and automated market intelligence (2026-11-11)

These requirements were explicitly confirmed by the Super Admin. They define the target architecture; they do not claim that the features are already implemented or connected to live services.

### A. Learning, Heatmap, and Market Pulse must be data-managed

- [ ] Super Admin can create, upload, edit, publish, unpublish, archive, restore where feasible, and delete Learning content from the Admin Control Room without editing or redeploying Code.gs or Index.html for routine content changes.
- [ ] Learning content supports title, description, category, level, ordering, media/file type, storage reference, publication status, timestamps, and optional member/VIP visibility.
- [ ] Super Admin can replace/update Heatmap images or datasets, set the applicable market/instrument and period, add source/updated-at metadata, publish/unpublish, and archive older versions without code changes.
- [ ] Super Admin can create/update/publish/archive/delete Market Pulse entries and datasets through an authenticated admin interface, without code changes for routine content updates.
- [ ] All content CRUD and file operations are authorized server-side by role; hiding admin controls in the browser is not authorization.
- [ ] Private/member/VIP resources are served through backend authorization (or short-lived access grants) and are not exposed through guessable public Drive links, static frontend bundles, public API responses, or service-worker caches.
- [ ] Upload validation covers file type/signature, size, filename, metadata, and safe rendering; never execute uploaded HTML/JS/SVG as trusted code.
- [ ] Content changes become visible after successful save/publish and validation; use versioning/audit history and confirmation for destructive actions. Prefer archive/unpublish over irreversible deletion when recovery is useful.
- [ ] Keep the existing public static Pulse preview and Member Only messaging. Public visitors must not receive actual private Pulse data through page source, direct URLs, API, or cached responses.
- [ ] Routine content operations must not require editing Code.gs/Index.html. Code changes remain necessary only for genuine schema, security, integration, or feature-logic upgrades.

### B. News & Review and economic calendar automation

- [ ] Build an automated economic-calendar ingestion/synchronization pipeline using a vetted provider/source with documented licensing, timezone, update cadence, and outage behavior.
- [ ] Cover high-impact XAU/USD-relevant events including NFP, CPI/Core CPI, PCE/Core PCE, FOMC rate decisions/statements/minutes, Fed speeches where available, and other material USD/macro releases.
- [ ] Store canonical event identity, title, currency, impact level, scheduled timestamp, source timezone, normalized UTC timestamp, WIB display time, forecast, previous, actual, status, source URL, last-synced time, and correction history where available.
- [ ] Display High/Medium/Low impact clearly and provide an accurate live countdown to scheduled high-impact releases. Countdown must derive from a canonical timestamp, handle timezone/DST correctly, and switch to Released/Delayed/Rescheduled rather than going negative or continuing after the event.
- [ ] Show Forecast / Previous / Actual only when supplied by the source; do not invent missing values. Record source and last update and visibly flag stale/failed synchronization.
- [ ] Generate or assist editorial summaries and potential USD/XAUUSD scenarios, but distinguish source facts from model-generated interpretation. Require review/approval before publishing consequential analysis unless an explicitly approved, tested policy says otherwise.
- [ ] Provide pre-event reminders/alerts with configurable lead times and audience targeting; prevent duplicate alerts and record delivery outcomes.
- [ ] Support manual admin correction/override with audit history, without allowing a manual edit to be silently overwritten by the next sync.
- [ ] Do not claim live automation until provider access, licensing, synchronization, failure handling, and end-to-end output have been verified.

### C. Signal Bot automation and shared state

- [ ] Audit the currently running Telegram bot and its source/data flow before integration; do not interrupt, replace, rotate credentials, or change its webhook/triggers during the audit.
- [ ] Define one canonical server-side signal store/API as the source of truth for both the MPS website and Telegram notifications.
- [ ] Support XAU/USD multi-timeframe analysis (4H → 1H → 15M), Bullish/Bearish bias, SND/FVG/SNR context, Plans A/B/C, Entry, SL, TP, RR, rationale, validity/expiry, timestamps, and lifecycle status.
- [ ] Define and validate status transitions (e.g. Draft → Pending → Filled/Active → Closed/Invalidated/Expired, or Skip) and preserve a full event history. Never infer Filled/Closed solely from an unverified price tick.
- [ ] Automate notifications only from validated state changes; implement idempotency, duplicate suppression, retries with backoff, timeout handling, delivery logs, and admin pause/kill switch.
- [ ] Add high-impact event countdown/context to the signal dashboard and configurable pre-event risk warnings. Do not automatically suppress, create, or close a signal unless an explicitly approved strategy rule defines that behavior.
- [ ] Keep Telegram bot tokens, provider API keys, and internal credentials exclusively in server-side secret storage. Never expose them in frontend files, public repository, logs, or client API responses.
- [ ] Admin can review, correct, publish, pause, and audit signals according to role permissions. Clearly distinguish automated analysis from human-approved publication.
- [ ] Verify that Telegram and website show the same signal ID, content revision, and status; test duplicate/out-of-order webhook events and partial provider outages.
- [ ] Preserve the existing bot until a tested migration/rollback plan and explicit production approval exist.

### D. Architecture and acceptance gates

- [ ] Separate stable application code from dynamic content records and media storage. Use a backend content API/CMS and private storage; frontend pages render authorized data rather than embedding frequently changing content.
- [ ] Use stable content IDs, schema validation, pagination, caching rules, publication state, and audit logs. Cache only public content; bypass service-worker/browser caches for authenticated/private data.
- [ ] Verify role authorization on every read/write endpoint, including direct URL/API calls and tampered requests.
- [ ] Keep spreadsheet/member database schema and existing member records intact unless a separately reviewed migration is explicitly approved.
- [ ] Test upload/update/delete/restore, member/public/VIP access boundaries, direct-link denial, cache isolation, economic event timezone/countdown transitions, source outages, signal state transitions, Telegram idempotency, and rollback.
- [ ] Report PASS / FAIL / NOT TESTED with evidence. Source inspection or a successful code parse is not proof of live provider, Drive, Apps Script, or Telegram operation.


## Confirmed visual direction — MPS Premium Neon Signature (2026-11-11)

The Super Admin confirmed the recovered design direction from the 2026-11-07 visual references.

- [ ] Treat **MPS Premium Neon Signature / Premium Dark Neon** as the approved visual direction for the v4.8 workbench.
- [ ] Core canvas: deep black / charcoal dark surfaces with a premium futuristic fintech feel; use neon glow selectively, not as visual noise.
- [ ] Bull visual identity: metallic/neon gold-yellow emphasis.
- [ ] Bear visual identity: electric blue emphasis. Do not recolor both Bull and Bear yellow; preserve clear directional contrast.
- [ ] Supporting accent colors may include fluorescent pink and vivid racing green, used sparingly for secondary highlights/status accents.
- [ ] Preserve strong contrast, legible typography, accessible status distinctions, and consistent colors across public pages, member portal, dashboards, Heatmap, Market Pulse, and Signal Center.
- [ ] Keep the MPS brand tagline **DISCIPLINE OVER IMPULSE** and descriptor **Discipline · Psychology · Community**.
- [ ] Reference assets recovered from the Library: Beranda Neon Futuristik MPS.png, Dasbor Futuristik MPS: Psikologi Pasar.png, and Kolase Desain UI MPS Futuristik.png (2026-11-07). Treat these as visual references, not proof of implemented UI.
- [ ] Before broad restyling, compare each target page against the reference assets and document any intentional deviations; do not change production.
