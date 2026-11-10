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
