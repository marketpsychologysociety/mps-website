# MPS v4.8 — Release Readiness Gates

**Audit date:** 22 November 2026  
**Release date:** Not formally set in the reviewed project decisions. Do not infer a launch date from preview publication dates or PR merge dates.  
**Production status:** NO-GO until every mandatory gate below has evidence.

This checklist records repository evidence only. A merged GitHub PR is not proof of GitHub Pages deployment, and CI success is not proof of Apps Script, Sheets, Drive, Telegram, or production behavior.

## 1. Repository implementation status

| Work | Repository status | Release interpretation |
|---|---|---|
| PR #93 — clocks, watermark, event alarm UI, Journal and browser-level deterrents | Merged | In main; deployment and runtime behavior still need verification |
| PR #98 — News & Review macro research center | Merged | In main; static research center, not a live news feed or live economic calendar |
| PR #94 — PWA validation/experience work | Open; CI success per recorded audit | Not in main |
| PR #95 — Regular Member renewal fail-closed correction | Open; CI success per recorded audit | Not in main; Apps Script runtime acceptance still required |
| PR #96 — six public Learning reading modules and portal wording | Open; CI run 44969250907 succeeded | Not in main; public reading policy is correctly represented; PDF download remains intentionally unavailable in the public preview |
| PR #97 — Learning PDF private file and ancestor-folder access checks | Open; CI run 44971207250 succeeded | Not in main; test harness uses mocked Drive, not live Apps Script/Drive |
| PR #99 — sitewide News & Review navigation alignment | Open; CI run 44973218652 succeeded | Not in main; requires explicit merge approval |

No PR is merged by this document. PR merges remain subject to explicit owner approval.

## 2. Mandatory release gates

### A. Public website and deployment
- [ ] Confirm canonical production URL and remove obsolete mafiapipssyndicate1.github.io references.
- [ ] Review all navigation links, page routes, mobile layouts, and internal links on the final main branch.
- [ ] Verify GitHub Pages build/deployment after the final approved merges.
- [ ] Open the canonical URL on Android and desktop; verify the served commit/version matches the intended release.
- [ ] Verify PWA manifest, service worker scope, offline fallback, and install behavior without claiming OS-level screenshot prevention.

### B. Learning Center
- [ ] Public visitors can read all six complete learning modules without login.
- [ ] Member-only PDF/file downloads are not shown as available until the server endpoint is integrated and tested.
- [ ] Live Drive test confirms the Learning folder, every PDF, and every ancestor folder are private.
- [ ] Member download endpoint verifies active member session and status server-side; admin endpoint verifies admin authorization.
- [ ] Confirm no public/guessable Drive URL or raw file ID can bypass authorization.

### C. Apps Script, database, and admin
- [ ] Reconcile candidate Code.gs/Index.html against the actual deployed Apps Script project and deployed version.
- [ ] Confirm database schema compatibility without deleting or rewriting existing member data; explicitly validate legacy 18-column and v4.8 30-column cases.
- [ ] Validate required Script Properties and storage IDs without displaying their secret values.
- [ ] Resolve and test the admin initialization state using the deployed project; do not assume candidate code has been deployed.
- [ ] Run registration → Application Ref → deposit/proof → admin approval → Member ID/PIN issuance end-to-end.
- [ ] Confirm admin review requires admin authorization only and member access requires approved status.
- [ ] Test Regular Member renewal and Active IB eligibility with fail-closed behavior.

### D. Telegram, VIP, and recovery
- [ ] Test Telegram linking, one-time token expiry/consumption, username/chat association, and audit trail.
- [ ] Test approval-triggered VIP invite, expiry, join confirmation, and VIP status reconciliation.
- [ ] Test Account Recovery using the approved recovery flow, rate limits, one-time code expiry, session revocation, and audit logging.
- [ ] Verify no initial registration event sends an unintended admin notification.

### E. Premium services and privacy
- [ ] Verify Market Pulse preview is static for public visitors and all data/API routes enforce member authorization server-side.
- [ ] Display the XAUUSD label transparently as Binance Spot PAXGUSDT gold-market proxy, M5, WIB; never describe it as broker XAUUSD feed.
- [ ] Confirm ticker only displays verified VIP-joined members and never exposes MT5, deposit, proof, phone, or email details.
- [ ] Confirm admin announcements respect audience, schedule, active state, and non-intrusive display behavior.
- [ ] Keep News & Review clearly identified as static macro research until a real source-backed feed and admin publishing workflow are implemented.
- [ ] Keep rebate values unavailable or marked pending until supported by auditable official Exness/partner data or an auditable admin import.

### F. Security, recovery, and acceptance
- [ ] Test login and submission rate limits, session expiry/revocation, authorization boundaries, and fail-closed behavior.
- [ ] Verify audit logs and admin/super-admin separation for sensitive actions.
- [ ] Verify backup coverage and perform a documented restore drill; spreadsheet-only backup must not be described as full-system backup.
- [ ] Perform negative tests for direct API access, guessed file IDs, unauthorized member/admin sessions, and public data leakage.
- [ ] Complete Android/mobile, desktop, accessibility, and regression checks.
- [ ] Record test evidence, known limitations, rollback plan, and deployment commit.

## 3. Explicit non-goals / safety limits
- Browser/PWA JavaScript cannot guarantee blocking Android OS screenshots or screen recording; native Android FLAG_SECURE is required for that platform-level control.
- CI and mocked tests do not prove live Apps Script, Google Sheets, Drive permissions, Telegram delivery, or production deployment.
- Do not enable Winner Draw, public center backend, live market/news claims, or private file downloads without their separate acceptance gates.
- Do not alter production Script Properties, spreadsheet contents, Drive permissions, Telegram configuration, or deployments as part of a repository-only release audit.

## 4. Go / No-Go rule
**GO** only when every mandatory checkbox above is complete, evidence is recorded, the final website commit is deployed and verified, and the owner approves release.

**Current decision: NO-GO.** The repository contains useful merged work and several open PRs, but production deployment, Apps Script runtime, live storage permissions, complete member lifecycle, and end-to-end acceptance have not been verified in this audit.