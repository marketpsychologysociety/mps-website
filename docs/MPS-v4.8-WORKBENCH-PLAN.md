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


## Visual system implementation pass — 2026-11-11 (workbench only)

- [x] Added centralized Premium Dark Neon tokens to the shared stylesheet: deep charcoal surfaces, fluorescent yellow Bull, electric blue Bear, fluorescent pink and racing-green supporting accents.
- [x] Added reusable semantic Bull/Bear text and panel classes for future signal/market components; these classes do not create or imply live market data.
- [x] Updated the public homepage Market Pulse preview cards, Heatmap/Pulse public preview surface, and Learning hero surface from the older navy-blue gradient to the shared charcoal premium surface.
- [x] Preserved the shared stylesheet references and existing reduced-motion accessibility rule.
- [x] Re-fetched all four changed files and passed eight source-level checks for tokens, semantic classes, dark surfaces, stylesheet references, and reduced-motion support.
- [ ] Still required: visual browser rendering/responsive review, cross-page regression review, member portal/dashboard review, and device testing. These have not been performed in this pass.

Evidence boundary: changes are committed only to `mps-v4.8-workbench`; no production deployment or live Apps Script/member data was changed. Source-level string checks are not a substitute for browser rendering or runtime tests.


## Site-wide living neon interaction pass — 2026-11-11 (workbench only)

- [x] Added a low-intensity ambient neon background layer with slow breathing motion.
- [x] Updated metallic heading sweep to the fluorescent-yellow neon family while retaining the MPS premium dark canvas.
- [x] Added consistent glow/hover/press feedback to site-wide buttons and navigation controls.
- [x] Expanded the red animated Join/Register CTA treatment to links targeting the member portal, registration endpoint, join page, and deposit-confirmation page; includes a moving light sweep and a visual press pointer.
- [x] Added restrained neon hover edges to cards and key preview panels.
- [x] Added reduced-motion overrides for ambient, heading, CTA, pointer, and shine animations.
- [x] Refreshed the shared stylesheet cache version on all 14 public HTML pages.
- [x] Re-fetched the stylesheet and all 14 pages; nine source-level checks passed.
- [ ] Browser rendering, interaction, mobile performance, cross-browser, and physical-device checks remain NOT TESTED in this pass.

Safety/design note: visual urgency is limited to genuine navigation/registration calls to action. No fabricated member activity, false countdowns, fake scarcity, or fake transaction notifications were introduced. Animations retain a reduced-motion fallback.

Evidence boundary: all edits remain on `mps-v4.8-workbench`; no production deployment, live Apps Script, database, member records, Drive, Script Properties, triggers, or Telegram settings were changed.


## Cross-platform + Netlify release parity gate — 2026-11-11

**Requirement confirmed by Super Admin:** MPS must provide the same product capability, content, navigation, visual identity, and working flows on desktop web, Android, and iPhone/iOS. Layout may adapt to screen size and platform conventions; feature availability and behavior must not diverge.

### Hosting / deployment facts observed in the workbench
- The current repository README still describes GitHub Pages as the public static-site host; it separately describes the Apps Script Web App as the member portal/backend.
- The inspected workbench root did not contain `netlify.toml`, `_redirects`, or `package.json`. This is not proof that the Netlify site is disconnected: Netlify may be configured through its dashboard or an external build/deploy configuration.
- No Netlify site/deployment API or dashboard connection was exposed in the available project tools during this inspection. Therefore the connected Netlify site's site ID, production branch, build command, publish directory, deploy contexts, custom domains, and current deployed commit remain **UNVERIFIED**.
- The existing `.github/workflows/pwa-validation.yml` runs PWA validation and Chromium checks on pull requests targeting `main` and pushes to `main` / `integration/**`; it does not currently validate the isolated `mps-v4.8-workbench` branch by its push trigger.
- Do not add Netlify configuration or change branch/domain settings by guessing. First establish the actual Netlify site's intended role (preview vs production) and its existing build/publish settings. Do not deploy workbench or change production routing without explicit release approval.

### Required release parity checks
- [ ] Record the canonical source branch and commit for each Netlify deploy context (production, deploy preview, branch deploy).
- [ ] Confirm Netlify publish directory and build command match the static-site repository structure; confirm no generated output directory is assumed without evidence.
- [ ] Verify custom domains, HTTPS, redirects, headers, SPA/static routing behavior, and canonical URLs without exposing private endpoints.
- [ ] Ensure GitHub Pages and Netlify cannot silently serve different code versions to users; define one canonical production host and a clear preview host.
- [ ] Compare deployed commit SHA and asset versions after every approved release.
- [ ] Validate manifest, service worker scope, asset paths, cache versioning, install/update behavior, and offline fallback on the actual canonical host.
- [ ] Test desktop Chromium/Firefox/Safari where available; Android Chrome; iPhone Safari and Add to Home Screen standalone mode.
- [ ] Test narrow widths, tablet widths, landscape/portrait, safe areas, keyboard behavior, touch targets, form validation, external Apps Script navigation, and session continuity.
- [ ] Confirm the same member-only authorization boundaries on every entry path; hosting separation must never weaken backend authorization.
- [ ] Report platform-specific PASS / FAIL / NOT TESTED. Desktop emulation is not physical Android/iPhone evidence.

**Current evidence:** source inspection only. Responsive breakpoints exist in the shared stylesheet (1080px, 700px, and 380px), and the service worker uses a public-asset allowlist while bypassing HTML navigation caching and non-allowlisted/parameterized requests. Actual Netlify deployment, live host parity, physical Android/iPhone behavior, and cross-browser rendering remain **NOT TESTED**.


### CTA interaction and integration discovery — 2026-11-11

- Inspected CTA anchors on `index.html`, `membership.html`, `join.html`, `member-portal.html`, `deposit-confirmation.html`, and `heatmap.html` against the shared red CTA selectors in `css/style.css`.
- Primary button-class CTAs to `member-portal.html`, `join.html`, `deposit-confirmation.html`, and the Apps Script `page=register` destination are covered by the global selector families. Navigation-only anchors are not treated as primary animated CTAs.
- The animated shine/finger pseudo-elements inspected use `pointer-events:none`; reduced-motion overrides are present. This is source-level inspection, not a physical touch test.
- Plugin discovery for Netlify hosting/deployment did not return a Netlify connector. This does not prove Netlify is disconnected; its dashboard settings and live deploy remain inaccessible/unverified from the current workbench tools.
- Latest workbench CI run #67 for commit `df74aa8b54d69f7dc06c05519c559defbbfef8af` completed successfully, including PWA validation and Playwright Chromium checks. See https://github.com/marketpsychologysociety/mps-website/actions/runs/42868447946.
- No production branch, hosting deployment, Apps Script backend, database, credentials, or member records were changed.


### Heatmap / Member Portal / service-worker privacy audit — 2026-11-11

- `heatmap.html` contains an explicitly illustrative static preview asset and Member Only messaging; the page does not contain actual market statistics/history or a client-side data fetch. Its full-data CTA routes to the configured Apps Script Web App with `page=pulse`.
- `member-portal.html` exposes navigation links for registration, Learning, Dashboard, Pulse, and Admin through the same Apps Script deployment endpoint with separate page routes. These are public navigation links only; they are not proof of backend authorization.
- The public `config.js` contains brand/contact/routing configuration and the Apps Script endpoint. Its own comment prohibits secrets; source review found no password, PIN, bot token, or secret API key in that file. The endpoint is routing information, not an authorization control.
- `sw.js` caches only explicit public asset paths (CSS, JS, public config, and selected icons); all document navigations are network-first with offline fallback and are never cached as HTML. Cross-origin Apps Script requests bypass the service worker. Query-bearing requests other than a single non-empty version parameter on allowlisted public assets bypass caching; non-GET requests bypass caching.
- CI browser tests exercise exclusion of token/query URLs, mock API/member paths, and HTML/member pages from the cache, plus mobile navigation and install-prompt simulations. These tests do not contact the live Apps Script backend.
- **Security boundary:** a static GitHub Pages/Netlify host cannot protect member data by hiding a link or page. Authorization must be enforced server-side on every Apps Script page and API route, including direct URL and API requests. The backend source and live unauthenticated/unauthorized behavior were not available for this workbench-only audit; therefore Pulse/Learning/Dashboard/Admin backend authorization remains **NOT VERIFIED**. Do not expose real member data until separately verified.
- No live backend request was used to mutate data. No Apps Script, production database, credentials, triggers, or deployment was changed.


### Public configuration, external links, and legacy-source review — 2026-11-11

- Reviewed the public `config.js`: it contains brand/contact/routing values and the Apps Script Web App URL. No password, PIN, bot token, or secret API key was observed in this file. The Web App URL is a public route, not a credential.
- Reviewed the two repository Apps Script files. They are explicitly identified in README as historical/legacy source, not proof of the currently deployed backend. Their setup code reads spreadsheet/folder IDs and Telegram credentials from Script Properties rather than embedding those credentials as literals. Do not deploy either historical file as a replacement backend without separate review and approval.
- Reviewed the static public HTML pages and the shared public JS files for common hard-coded secret assignment patterns, insecure `http://` resources, `innerHTML` sinks, and `target=_blank` links missing `rel=noopener`. No matches were found in the reviewed set. This is a targeted static pattern scan, not a comprehensive secret scanner or penetration test.
- `js/join.js` and `js/deposit.js` are present in the repository but are not loaded by the current `join.html` or `deposit-confirmation.html`; those pages load `config.js` and `js/main.js`. The unused legacy scripts contain stale v4.1 wording and old member-ID flow descriptions. They are not changed because they are not active page dependencies and the correct v4.8 copy must be derived from the actual current registration/deposit flow.
- `manifest.webmanifest` declares relative scope/start URL and standalone display. It references the SVG app icon at 192/512 and the 512px PNG icon. Existing CI validates manifest structure and icon file presence/decoding; actual installation on physical Android/iPhone remains untested.
- No production branch, hosting configuration, Apps Script deployment, live database, credentials, or member records were changed.
- A broad automated repository-wide secret scan was attempted through the GitHub connector but hit the tool's call limit; therefore the audit is limited to the explicitly reviewed files and targeted patterns above. Do not interpret this as a clean full-repository secret scan.


### Backend source security review (historical repository files only) — 2026-11-11

Scope: static review of `google-apps-script/Code.gs` (legacy v1) and `google-apps-script-v2/Code.gs` (historical v2). These files are not confirmed to match the deployed Apps Script endpoint. No deployment, spreadsheet, Drive folder, Script Property, trigger, webhook, or member record was accessed or changed.

**Critical boundary:** both files document a Web App deployment with access set to `Anyone`, and both expose `doPost(e)` without caller authentication. This may be appropriate only for narrowly scoped public intake endpoints. It is not sufficient authorization for member portal, Learning, Dashboard, Market Pulse, or Admin operations. Neither source contains those member/admin route handlers or a complete session/role authorization layer. Therefore backend authorization for those protected services remains NOT VERIFIED; the public portal's copy asserting session checks is not proof.

**Historical v2 observations:**
- Registration accepts caller-supplied nickname, Telegram username, country, goal, and note. A repeat Telegram username updates the existing row's profile fields without verifying control of that Telegram account or a member session.
- Deposit accepts caller-supplied name, Telegram username, MT5 login, account type, amount, date, MIME label, filename, and base64 image. It locates a member row by Telegram username only; it does not require Application Ref, Member ID, PIN, a verified Telegram challenge, or a logged-in session. A caller who knows a member's Telegram username could attempt to attach/overwrite that member's deposit fields. This is a serious identity-binding/authorization weakness if this code were deployed as the member workflow.
- The 1.5m server-side deposit minimum and 5 MB decoded-size limit are checked. MIME type is accepted from the caller and checked by string pattern, but image file signatures are not verified in this source. No effective per-IP/per-user rate limit or durable anti-abuse control is visible; a honeypot is not adequate authorization or rate limiting.
- Uploaded proof is created in a Drive folder and no public sharing call is present; source comment says private by default. Actual Drive ACLs and deployment owner permissions remain unverified.
- Telegram notification includes member identity, Telegram username, MT5 login, and deposit amount. This is a private destination configured in Script Properties in the source, but actual recipient/configuration and access controls are unverified; data minimization should be considered in a future approved redesign.
- `setupMPSStorage()` creates sheets if absent. The associated `createDashboard_()` does not clear the existing dashboard, which is safer for repeat execution than v1, but the setup function still requires a separate controlled migration/backup review before any real use.

**Historical v1 observations:**
- The public deposit action writes a new row to a separate `Data IB MPS` sheet and does not match the submission to an existing member row in this source.
- It accepts public `doPost` submissions without caller authentication; same broad concerns about identity binding, abuse controls, and file-content verification apply.
- `setupMPSStorage()` calls `dashboard.clear()` in `formatMpsWorkbook_()`. Re-running setup against a workbook with dashboard content would clear that dashboard. This is a destructive operational risk; do not run the function against production without a verified backup and explicit approval.

**Required v4.8 backend controls before protected data is exposed:** authenticated server-side session on every protected page and API action; server-side role checks (member/admin/Super Admin) and member status checks; verified identity binding rather than username-only matching; short-lived/revocable sessions and PIN handling with secure hashing/attempt throttling; object-level authorization for every file/dataset; private Drive ACL verification and download mediation; server-side MIME/signature/size validation; request throttling/idempotency/audit logs; least-privilege deployment and secrets in Script Properties; safe error messages; backup/restore and rollback; direct-URL and direct-API negative tests for anonymous, pending, rejected, successful member, and non-admin accounts.

**Status:** static source review only. No live endpoint requests or unauthorized-access tests were performed because the files are historical and the active deployment/version and safe test identities are not established. Do not deploy either historical source as a fix or use it as evidence of the active backend's behavior.


### Live GitHub Pages production smoke check — 2026-11-11

- Fetched the currently public GitHub Pages home page, `member-portal.html`, `heatmap.html`, `join.html`, `deposit-confirmation.html`, `manifest.webmanifest`, and `config.js`. All six public resources responded to the external fetch check; this confirms public hosting availability for these URLs at the time checked, not full browser/device correctness.
- The live public pages currently describe the registration/deposit requirements as minimum IDR 1,000,000, Application Ref, MT5 login (not password), proof image up to 5 MB, and Telegram verification. The live public config labels itself v4.7.0 and points to the same Apps Script Web App endpoint used by the public portal links.
- The live public Market Pulse page presents a static preview and says actual statistics/history are not shown publicly. It links to the Apps Script `page=pulse` route. The member portal links to `page=learning`, `page=dashboard`, `page=pulse`, and `page=admin`.
- Unauthenticated GET fetches were attempted for all five Apps Script routes (`register`, `learning`, `dashboard`, `pulse`, `admin`). The extraction layer returned only Google's generic Apps Script wrapper text for each route, not the rendered application. This result is inconclusive: it does NOT prove that the routes deny anonymous access, and it does NOT prove that they expose member data. No form was submitted and no data was modified.
- A live browser-based inspection of the Apps Script page could not be started because the external browser runner rejected the run for insufficient tool-wallet balance. No top-up or payment was requested or made. The audit continues on independent repository tasks; this external blocker is not evidence of a website/backend defect.
- GitHub Pages is confirmed to be serving the public site. Netlify's dashboard configuration, production/preview role, and live deployment were not inspected; do not infer that Netlify is disconnected or that it is the canonical host.
- No live member records, personal information, proof files, or private datasets were intentionally requested or copied. No production changes were made.


## Security blueprint — mandatory v4.8 requirement (2026-11-11)

- [x] Added companion threat model and mandatory security/anti-abuse acceptance requirements in [MPS-v4.8-SECURITY-BLUEPRINT.md](MPS-v4.8-SECURITY-BLUEPRINT.md).
- [ ] Identify the active Apps Script deployment/source/version and execution/access model; current production backend authorization remains NOT VERIFIED.
- [ ] Define and implement server-side authentication, member status, role, session expiry/revocation, PIN protection, privileged MFA/step-up, and object-level authorization.
- [ ] Protect against frontend cloning/impersonation: public assets contain no secrets or authority; copied frontend cannot access private backend resources; establish canonical official host and anti-phishing guidance.
- [ ] Secure API schemas, identity binding, request validation, idempotency, replay/duplicate prevention, rate limits/quotas, safe errors, and audit records.
- [ ] Protect Sheets/database with exact legacy 18-column compatibility, additive/versioned migration only, dry-run, backup/restore, and rollback; no destructive production operation without explicit approval.
- [ ] Verify private Drive ACLs and enforce per-object authorization, upload signature/type/size validation, safe filenames, and private download mediation.
- [ ] Protect public forms, bots, expensive endpoints, and integrations; assess edge CDN/WAF separately from Apps Script endpoint capabilities.
- [ ] Protect GitHub/Google/hosting/DNS accounts, deployment permissions, secret storage, canonical/preview host separation, and release rollback.
- [ ] Secure Telegram webhook/commands, notification idempotency, least privilege, and kill switch without touching production integration during workbench work.
- [ ] Add synthetic adversarial tests for anonymous/pending/rejected/member/non-admin actors, ID tampering, session replay/revocation, brute force, malicious uploads, private file access, duplicate writes, forged webhook, abuse traffic, and backup restoration.
- [ ] Require zero unresolved Critical/High security findings before protected member features are accepted for production.
- [ ] Document incident response, evidence preservation, containment, member communication, restore, and post-incident review.

**Security boundary:** the blueprint is a requirement, not evidence of implementation. Static frontend copying cannot be prevented absolutely; the security goal is to ensure a clone cannot gain authority over genuine MPS services. The actual Apps Script deployment, Drive ACLs, live authorization, Netlify settings, account MFA, and DNS protections remain unverified. No production data, deployment, credentials, hosting, DNS, triggers, or Telegram webhook were changed.


## Database compatibility audit — source-level findings (2026-11-11)

- [x] Retrieved saved v4.6.1 backend source and confirmed its exact 18-column Database Member header contract.
- [x] Retrieved saved reconstructed v4.8.0 candidate and confirmed it declares 30 columns: the first 18 headers match exactly and in order; 12 fields are appended at columns 19–30.
- [x] Reviewed v4.8.0 getMemberSheet_()/validateHeaders_(): the candidate requires at least 30 columns and exact positional equality for all 30. An 18-column sheet is rejected before member operations proceed.
- [x] Targeted source search found no explicit additive migration routine in the saved v4.8.0 candidate.
- [x] Added detailed source-level mapping, compatibility findings, and a non-destructive append-only migration design in [MPS-v4.8-DATABASE-COMPATIBILITY.md](MPS-v4.8-DATABASE-COMPATIBILITY.md).
- [ ] Verify the actually deployed Apps Script source/version and active spreadsheet schema. The production header row and width remain NOT VERIFIED.
- [ ] Build and test an isolated synthetic 18-column fixture; append only the 12 new headers in the test copy; prove legacy values remain unchanged and migration is idempotent.
- [ ] Review every candidate member-row read/write and all auxiliary sheet contracts against the schema.
- [ ] Do not migrate, deploy, clear, rename, reorder, or rewrite production data without explicit Super Admin approval and verified backup.

**Compatibility decision:** the candidate's 30-column requirement is not backward-compatible with an unmodified 18-column sheet at runtime. The first 18 fields are structurally preservable, but an append-only schema migration is required before this candidate can operate against that legacy layout. The isolated runbook's 30-column fixture is a test setup, not evidence that production is already migrated. No live spreadsheet or member data was read or changed.


## Synthetic schema migration harness — added to CI (2026-11-11)

- [x] Added `scripts/test-schema-compatibility.mjs` with nine synthetic tests for 18→30 append-only compatibility, legacy-cell preservation, idempotency, mismatched headers, unexpected trailing data, already-migrated schemas, both legacy ID lengths, and fail-closed partial headers.
- [x] Added the synthetic schema test to the PWA validation GitHub Actions workflow.
- [ ] Wait for the new CI runs and confirm the schema test step passes.
- [ ] Do not interpret synthetic test success as proof of live Apps Script/Google Sheets migration or production compatibility.


## Backend row/schema audit update — 2026-11-11

- [x] Static review of the saved reconstructed v4.8.0 Code.gs candidate and historical repository v2 backend.
- [x] Confirm exact 30-column header gate and document why accepting an 18-column sheet without migration would be unsafe.
- [x] Review application/deposit/member row lifecycle, positional mapping, locking, and compensating rollback behavior.
- [x] Identify auxiliary-sheet accessors that create missing sheets; prohibit their use in read-only health checks.
- [x] Confirm strict paid-VIP authorization gate and document that a trial must use a separate, limited entitlement path.
- [x] Confirm passkey and 60-minute trial are not yet implemented in the candidate.
- [ ] Build isolated Apps Script failure-injection tests for approval/deposit rollback and migration.
- [ ] Build a non-mutating read-only schema inspection routine and test it against synthetic/cloned spreadsheets.
- [ ] Implement trial/passkey only after their server-side contracts and architecture are reviewed.

Evidence: `docs/MPS-v4.8-BACKEND-ROW-WRITE-AUDIT.md`. The source passed Node JavaScript syntax checking after temporary extension normalization; Apps Script runtime and live integration remain NOT TESTED.


## Read-only inspector and isolated failure-test preparation — 2026-11-11

- [x] Added `scripts/mps-readonly-schema-inspector.gs`: explicitly receives a Spreadsheet object; reads only the four known header rows and row counts; does not open by ID, create sheets, write, format, or read member rows.
- [x] Added synthetic VM tests for exact schemas, legacy 18-column fail-closed, missing auxiliary sheet, altered header, invalid input, and zero write calls.
- [x] Added the read-only inspector mock test to the PWA validation workflow.
- [x] Added [isolated failure-injection test plan](MPS-v4.8-ISOLATED-FAILURE-INJECTION-PLAN.md) covering approval, deposit, rollback failure, concurrency, and migration interruption.
- [x] CI run 42876672500 completed successfully on commit 9e0346a3ee06460b59b5eed8dea2a9aa47192db6; PWA validator, synthetic schema compatibility tests, read-only inspector tests, and Chromium browser checks all passed.
- [ ] Execute the inspector against an authorized disposable spreadsheet clone in Apps Script.
- [ ] Refactor candidate write orchestration into a test-injectable adapter in a disposable Apps Script project, then run deterministic failure injection.
- [ ] Do not claim rollback safety until the actual candidate flow passes Apps Script runtime tests with rollback-failure and concurrency cases.

**Evidence boundary:** the helper's synthetic VM tests and repository CI passed. This is not a Google Sheets/Apps Script runtime inspection. The failure-injection document is a runbook, not evidence that failure injection has occurred. No production spreadsheet, Apps Script deployment, Drive file, Telegram bot, or member record was accessed or changed.


### Additional backend rollback risks — static review (2026-11-11)

- [x] Found that failed deposit compensation does not restore previously active Telegram links changed to `Diganti` (RW-01).
- [x] Found that rejection compensation omits Telegram link/access snapshots (RW-02).
- [x] Found rollback errors may be swallowed/logged without a durable reconciliation-required state (RW-03).
- [x] Found post-commit cache failures can return a failed submission response after data was already persisted (RW-04).
- [ ] Correct these candidate-source gaps in a separately reviewed full backend candidate.
- [ ] Reproduce each failure and rollback-failure case in an isolated Apps Script project before accepting the correction.

**Risk:** RW-01/RW-02/RW-03 High; RW-04 Medium. Details and test points are in the backend row-write audit and isolated failure-injection plan. These are static findings, not live reproductions.


### Third-pass static review — additional findings (2026-11-11)

- [x] RW-05: Cache invalidation/request-cache writes can throw after persistent submission commits and still produce an `ok:false` response.
- [x] RW-06: Rejection path does not snapshot/restore Telegram link rows or Telegram Access status.
- [x] RW-07: Telegram-link row append can occur before a later configuration read throws, leaving an orphan pending link unknown to the caller.
- [x] Documented saga/journal direction: preflight first, exact before-images, pre-provisioned validated journal, explicit compensation and reconciliation states.
- [ ] Review a full corrected backend candidate against all seven findings before preparing any deployable file.
- [ ] Verify the transaction journal schema and operational repair workflow in an isolated Apps Script project.
- [ ] Run the complete deterministic fault-injection matrix, including cache failure, link creation failure, rollback failure, and concurrency.

**Updated static risk register:** RW-01/02/03/06 High; RW-04/05/07 Medium. None has been reproduced against an Apps Script runtime. No live service or production data was accessed or changed.

---

## Consolidated progress update — 2026-11-11 (workbench only)

This section supersedes earlier checklist assumptions where newer evidence is recorded below. A checked item means the stated artifact or source-level task exists; it does **not** automatically mean production/runtime acceptance.

### Completed / delivered in the isolated workbench

- [x] Security & Anti-Abuse Blueprint and companion threat model documented.
- [x] Winner-draw security review, dual-control/audit-journal design, identity/evidence architecture, official Draw API contract, abuse-case plan (TM-01–TM-32), and security-harness readiness review documented.
- [x] Announcement Center / Winner Board / Lucky Roulette prototype added with premium dark-neon styling, responsive layout, announcement categories, maintenance area, winner empty state, and demo-only roulette.
- [x] Shared public-center frontend controller added. External feed remains fail-closed behind `MPS_CONFIG.publicCenter.enabled=false` until an isolated Apps Script runtime test is completed.
- [x] Generic privacy-safe ticker integrated into 11 public routes. No real names or full member IDs are displayed; ticker uses generic text and a masked ID only when the backend privacy gate supplies a valid unique mask.
- [x] Public feed rendering uses DOM text nodes/textContent and URL validation; ticker does not use JSONP.
- [x] Service-worker public cache namespace advanced to v6 and the public-center script added to the explicit public asset allowlist.
- [x] Static route audit for the 11 ticker routes completed; local JavaScript syntax and synthetic DOM checks passed.
- [x] Draw sandbox adapter added as a loopback-only synthetic HTTP service; ownership checks and If-Match version preconditions added for state-changing actions.
- [x] Draw contract tests expanded for cross-owner execution and missing/stale version preconditions. Privacy test now explicitly SKIPs when no real public projection fixture exists rather than treating null as a pass.
- [x] Workbench documentation and security readiness review updated to distinguish implemented artifacts from unimplemented production controls.

### Completed checks — evidence scope

- [x] GitHub readback of updated workbench files and blob hashes.
- [x] Static route audit and local syntax/synthetic DOM checks for the announcement ticker integration.
- [x] Narrow sandbox contract run on a reconstructed local working copy of the fetched adapter and harness: **8 PASS, 1 SKIP, 0 FAIL**. The skipped test is public-projection privacy because no published projection fixture/serialization endpoint exists. This was not a clean checkout or CI run.
- [x] Latest GitHub compare reports `mps-v4.8-workbench` **136 commits ahead, 0 behind** `main`; the base `main` SHA remains `9f5d9128f7226b1a53cbcaa1615068e7a7fbc6ff`.

### In progress / pending — do not mark complete

- [ ] Run the test suite from a clean workbench checkout or CI and retain exact commit-bound logs.
- [ ] Implement a real synthetic public projection fixture and serialization endpoint; then turn the privacy SKIP into an actual canary-leak test.
- [ ] Implement real OIDC validation, individually authenticated privileged identities, revocation, MFA/step-up, and enforceable person-level dual control.
- [ ] Replace in-memory sandbox state with isolated durable synthetic persistence, journal intent/completion, idempotency ledger, and fault-injection coverage.
- [ ] Implement and independently verify the beacon signature verifier, pinned beacon configuration, deterministic unbiased selection, snapshot commitment, and reproducible draw proof.
- [ ] Build the official Draw API from the contract; the current sandbox is only a narrow test harness, not that API.
- [ ] Complete announcement CMS/backend integration and runtime-test the public Apps Script bridge. Feature flag remains OFF.
- [ ] Complete verified winner publication workflow. Winner Board remains empty; roulette remains simulation-only.
- [ ] Run Apps Script runtime tests, isolated Sheets/Drive ACL checks, backend direct-API tests, real browser tests, and Android/iPhone device tests.
- [ ] Complete outstanding P0–P7 workbench tasks, including deployed backend identification, v4.7/v4.8 parity, member/database lifecycle, Signal Center, PWA device acceptance, full regression, and release preparation.
- [ ] Resolve previously documented backend rollback risks RW-01 through RW-07 in a full candidate and reproduce them in an isolated Apps Script runtime before acceptance.
- [ ] Verify production hosting, Netlify settings, canonical domain/DNS, account MFA, Telegram integration and active Apps Script deployment only through authorized read-only evidence; no production mutation is implied.

### Explicit blockers / release decisions

- **Official winner draw: BLOCKED / NO-GO.**
- **Frontend roulette: SIMULATION ONLY.**
- **Public-center backend feed: DISABLED** until isolated Apps Script runtime validation.
- **Production backend security: NOT VERIFIED.**
- **Production database/schema and Drive ACLs: NOT VERIFIED.**
- **No deployment, merge, live DB change, credential rotation, DNS/hosting change, trigger, or Telegram webhook change is authorized by this plan.**

### Next recommended execution order

1. Clean-checkout/CI run for the sandbox and retain evidence.
2. Implement real public projection fixture + canary privacy test.
3. Build durable synthetic Draw API persistence/journal and fault-injection layer.
4. Implement actual OIDC/dual-control boundary in an isolated identity sandbox.
5. Implement beacon verifier and deterministic proof workflow.
6. Finish announcement CMS bridge and runtime tests.
7. Resume remaining P0–P7 acceptance items; only then prepare a separate release review.



## P0 public projection privacy gate — verified update (2026-11-11)

**Scope completed in the isolated workbench:** a synthetic private projection fixture now contains canary values for a name, raw member ID, phone, email, Telegram ID, MT5 login, deposit, proof-document reference, PIN, token, and participant reference. A strict allowlist serializer emits only the approved public result fields and a bounded proof summary, and only when the fixture is both VERIFIED and PUBLISHED. Anonymous collection and detail routes exercise the serializer through the local loopback HTTP server. The test checks every canary, exact top-level and nested field allowlists, and fail-closed empty/unknown-result behavior.

**Clean GitHub Actions evidence:** workflow run #173, commit `56379ed9bc11a07bd01d0455fff35d8f06106b56`, completed successfully:
- Official Draw synthetic security contract: **10 PASS, 0 FAIL, 0 SKIP**.
- Synthetic database schema compatibility: **9/9 PASS**.
- Read-only schema inspector: **5 scenarios PASS**.
- Chromium PWA/browser suite: **PASS**, 15 pages plus service-worker, cache/offline, mobile navigation, Android install prompt, and iOS guidance checks.
- Overall workflow: **SUCCESS**.

The browser suite initially exposed stale assertions that still opened cache namespace v5 after the service worker had been upgraded to v6. The test script was corrected to inspect v6; the full workflow then passed. This was a test assertion mismatch, not evidence of a production cache leak.

**Evidence boundary:** these results are for the exact clean GitHub Actions checkout of the isolated workbench commit and synthetic fixtures only. They do not verify the production CMS/Apps Script bridge, production member data, real cache/log pipeline, actual Draw API, OIDC, durable journal, beacon signature verification, or a fair winner-selection implementation. The Public Center backend feature flag remains disabled. Official winner draw remains **BLOCKED / NO-GO**; frontend roulette remains **SIMULATION ONLY**. No production branch, deployment, database, spreadsheet, Drive, credentials, webhook, or member data was changed.


### Updated next execution order

1. Build durable synthetic Draw API persistence/journal and fault-injection tests.
2. Implement isolated OIDC identity validation, revocation, MFA and person-level dual control.
3. Implement pinned beacon verification and deterministic unbiased proof workflow.
4. Complete Public Center CMS/backend bridge only after isolated Apps Script runtime validation.
5. Continue production read-only verification and remaining P0–P7 gates; prepare a separate release review only after objective evidence exists.


## P1.1 — durable synthetic audit journal prototype (2026-11-11)

**Implemented in isolated workbench:** `tests/official-draw/durable-audit-journal.mjs` is a local-file, append-only JSONL journal with sequential records, SHA-256 hash chaining, file fsync, initial directory fsync, recovery on reopen, durable INTENT/COMPLETION records, idempotency-key replay/conflict handling, serialized concurrent writes within one process, bounded completion-result allowlist, and fail-closed integrity validation. A truncated final line is discarded during recovery; malformed complete records and hash-chain tampering are rejected.

**Fault-injection coverage:** tests inject failures before append, after write but before fsync, and after fsync but before acknowledgement. Uncertain write outcomes block further writes until reopen/reconciliation. A durable intent whose acknowledgement was lost is recovered and replayed without creating a second intent.

**Local evidence:** Node.js 22 syntax checks passed. GitHub Actions clean-checkout run #175 completed the committed journal suite with **7 PASS, 0 FAIL, 0 SKIP**; the full workflow succeeded.

**Important scope boundary:** this is a single-process, local-filesystem test prototype, not yet integrated into the loopback Draw API adapter or its event/draw state transitions. It has no cross-process lock, database transaction, external hash anchor, independent tamper-proof storage, backup/restore process, OIDC identity, or production hardening. A hash chain detects accidental/partial tampering but an attacker able to rewrite the whole file can recompute the chain. Do not store real participant data or secrets in it. Production official draw remains **BLOCKED / NO-GO**; roulette remains **SIMULATION ONLY**.


### Updated next execution order

1. Integrate the journal into the loopback Draw API adapter for operation intent/completion and state recovery; add API-level restart and fault-injection tests.
2. Add durable event/draw state persistence, single-writer/process coordination or a transactional database boundary, and reconciliation tooling.
3. Implement isolated OIDC identity validation, revocation, MFA and person-level dual control.
4. Implement pinned beacon verification and deterministic unbiased proof workflow.
5. Complete Public Center CMS/backend bridge only after isolated Apps Script runtime validation.
6. Continue production read-only verification and remaining P0–P7 gates; prepare a separate release review only after objective evidence exists.


### P1.1 CI verification — 2026-11-11

**Clean GitHub Actions evidence:** workflow run #175 on commit `44d23528692539846238462335a4ce4b21e9c843` completed successfully from a clean checkout. The durable synthetic journal fault-injection suite reported **7 PASS, 0 FAIL, 0 SKIP**. The same workflow also passed the Official Draw contract (**10/10**), schema compatibility (**9/9**), read-only inspector (**5 scenarios**), and Chromium PWA/browser checks. Workflow run #176 on documentation-correction commit `a1b2ea9589013c06e3ad5ba14d36a12367296209` also completed successfully.

This proves only the standalone synthetic journal prototype and the repository's existing synthetic/browser checks in GitHub Actions. The journal is still not integrated into the loopback Draw API state transitions. It is single-process local-file storage without a cross-process lock, transactional database, or external hash anchor. API-level restart/fault-injection tests remain the next gate. Official draw remains **BLOCKED / NO-GO** and roulette remains **SIMULATION ONLY**.


### P1.1 strict journal schema hardening — verified CI (2026-11-11)

The recovery verifier now requires an exact record-key allowlist; unknown extra fields fail closed before hash-chain application. A synthetic canary test confirms that an unexpected private payload field is rejected during recovery. Completion results also remain restricted to the bounded allowlist.

**GitHub Actions run #180** on commit `ec9c3df600dbd7e3509f56dc9e620309aa4fb606` completed successfully from a clean checkout: durable journal suite **8 PASS, 0 FAIL, 0 SKIP**; Official Draw contract **10 PASS**; schema compatibility **9/9**; read-only inspector **5 scenarios**; Chromium PWA/browser checks passed. Overall workflow: **SUCCESS**. The immediately preceding run #179 failed because the new canary test reached CI one commit before its matching exact-schema guard; the follow-up commit added the guard, and run #180 verified the combined change green.

This closes the standalone journal's synthetic test gap only. The journal is not yet integrated into API state transitions and remains single-process local-file storage without a cross-process lock, transactional database, or external hash anchor. API-level restart/fault-injection tests remain next. Official draw remains **BLOCKED / NO-GO**; roulette remains **SIMULATION ONLY**.
