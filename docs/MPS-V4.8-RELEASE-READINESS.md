# MPS v4.8 — Release Readiness Gates

**Audit date:** 22 November 2026  
**Release date:** Not formally set in the reviewed project decisions. Do not infer a launch date from preview publication dates or PR merge dates.  
**Production status:** NO-GO until every mandatory gate below has evidence.

This checklist records repository evidence only. A merged GitHub PR is not proof of GitHub Pages deployment, and CI success is not proof of Apps Script, Sheets, Drive, Telegram, or production behavior.

## 1. Repository implementation status — verified 22 November 2026

| Work | Repository status | Release interpretation |
|---|---|---|
| PR #93 — clocks, watermark, event alarm UI, Journal and browser-level deterrents | Merged | In main; Android OS screenshot prevention is not provided by browser code |
| PR #98 — News & Review macro research center | Merged | Static research center, not a live news feed or live economic calendar |
| PR #102 — rebased PWA validation/Journal experience (supersedes PR #94) | Merged | In main; CI/Chromium checks passed, physical Android acceptance remains open |
| PR #95 — Regular Member renewal fail-closed correction | Merged | Candidate source in main; actual Apps Script runtime acceptance remains open |
| PR #96 and #101 — six public Learning modules and portal wording | Merged | Public reading content is in main; member PDF download is separately protected by the backend proxy |
| PR #97 and #105 — private Learning PDF checks and authenticated download proxy | Merged | Source and synthetic security tests are in main; real Drive ACL/runtime acceptance remains open |
| PR #99 — sitewide News & Review navigation alignment | Merged | In main; Pages publication still requires verification |
| PR #100 — release-readiness gates documentation | Merged | Documentation only; does not certify production readiness |
| PR #103 — incident and mitigation runbook | Merged | Operational guidance in main; real recovery drills remain open |
| PR #106 — consistent rejected membership-plan state and rollback | Merged | Source and synthetic regression test are in main; live Sheets failure behavior remains unverified |
| PR #108 — pending Member ID issuance after proof submission, reuse on Admin approval | Merged | Candidate flow now reserves an ID after Regular QRIS/Active IB proof, shows it to the applicant, and activates it only after approval; isolated Apps Script runtime still required |
| PR #109 — Admin queue displays pending Member ID | Merged | Admin review cards now show the reserved ID or `Belum diterbitkan`; verified by source regression and Chromium CI |
| PR #110 — release-readiness checkpoint update | Merged | Documentation-only checkpoint refresh; release remains NO-GO until isolated runtime and deployment gates pass |

**Current repository checkpoint:** `main` = `5824b1ad23f57c6cbd5c7c98c34c9d3da2aad400` (PR #110). The repository query at this checkpoint found no pending pull requests.

**CI evidence:** main-branch run [#45015378765](https://github.com/marketpsychologysociety/mps-website/actions/runs/45015378765) for the current checkpoint completed SUCCESS (109 steps). Main-branch run [#45014911712](https://github.com/marketpsychologysociety/mps-website/actions/runs/45014911712), which includes PR #108, also completed SUCCESS. PR #108 and PR #109 each passed the full CI/Chromium workflow before merge. These are repository automation results, not live Google Apps Script/Sheets/Drive/Telegram acceptance.

**Source audit:** the v4.8.1 frontend's 29 distinct API calls all have matching backend function definitions. This confirms name-level coverage only; it does not prove correct runtime behavior or successful external service integration.

The canonical Pages address recorded for this project is https://marketpsychologysociety.github.io/mps-website/index.html. A read-only scan of the homepage, News & Review, Journal, README, and v4.8.1 frontend found no obsolete `mafiapipssyndicate1.github.io` URL and no hard-coded Apps Script deployment URL. This limited scan does not prove the Pages site is currently deployed or connected to the intended Apps Script version.

## 2. Mandatory release gates

### A. Public website and deployment
- [ ] Confirm canonical production URL and remove obsolete mafiapipssyndicate1.github.io references.
- [ ] Review all navigation links, page routes, mobile layouts, and internal links on the final main branch.
- [ ] Verify GitHub Pages build/deployment after the final approved merges.
- [ ] Open the canonical URL on Android and desktop; verify the served commit/version matches the intended release.
- [ ] Verify PWA manifest, service worker scope, offline fallback, and install behavior without claiming OS-level screenshot prevention.

### B. Learning Center
- [ ] Public visitors can read all six complete learning modules without login.
- [x] Candidate frontend uses the authenticated download proxy and does not receive the raw Learning Drive URL; synthetic regression tests cover the path.
- [ ] Confirm the download on a real isolated member session and Android device.
- [ ] Live Drive test confirms the Learning folder, every PDF, and every ancestor folder are private.
- [x] Candidate member download endpoint verifies the member session, active status, entitlement, rate limit, and private PDF checks server-side; admin access is role-gated in source and synthetic tests.
- [ ] Verify the endpoint against real isolated Apps Script and Drive resources before production use.
- [ ] Confirm no public/guessable Drive URL or raw file ID can bypass authorization.

### C. Apps Script, database, and admin
- [x] Candidate source reserves a pending Member ID only after Regular QRIS or Active IB proof submission; registration alone returns only an Application Ref.
- [x] Admin approval reuses the reserved ID, activates the member, and retains PIN issuance after approval; Admin queue displays the pending ID.
- [ ] Confirm this lifecycle end-to-end in isolated Apps Script with synthetic Sheets/Drive, including Telegram linking and rollback behavior.
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

**Current decision: NO-GO.** The repository changes listed above are merged and the current main CI run is successful. No open PRs were found in this audit. Production deployment, live Apps Script runtime, Sheets persistence/locking, Drive ACL inheritance, Telegram delivery, physical Android behavior, and complete end-to-end member lifecycle have not been verified. Do not infer production readiness from merged PRs or CI.