# MPS Project Master Continuity Record

> Last reconciled: 2026-11-23 (Asia/Jakarta)  
> Purpose: durable handoff/source-of-truth index so future work resumes from verified project state without asking the owner to repeat known decisions or completed work.

## Mandatory working protocol

1. Read this file and the linked source documents before starting each MPS task. Reconcile against the current GitHub main branch and latest relevant CI/workflow evidence.
2. Do not ask the owner to repeat facts, decisions, approvals, repository paths, prior test results, or constraints already recorded here or in linked project docs.
3. Do not mark work complete merely because source code exists or mocked CI passes. Distinguish:
   - **DONE / VERIFIED**: exact artifact/result checked.
   - **IMPLEMENTED / NOT LIVE-ACCEPTED**: source exists; real service/runtime acceptance remains open.
   - **NOT DONE**: not implemented or not verified.
   - **BLOCKED / OWNER ACTION**: genuinely requires owner account, device, credentials, or physical access.
4. Perform all safe independent checks, code review, test runs, cross-checks, and documentation updates without asking the owner to do them.
5. Owner uses Android only and has difficulty with Apps Script editor/code editing. Prefer complete ready-to-use files/artifacts and short, clear instructions. Avoid patches, long manual edits, ZIP-only handoffs, or unnecessary screenshots.
6. Never claim a test, deployment, integration, or live operation succeeded unless it was actually executed and verified. CI with mocks is not live acceptance.
7. Do not modify production Apps Script, deployment, Script Properties, spreadsheet/member rows, Drive assets/ACLs, production Telegram bot/group, payment configuration, or live member access without explicit owner authorization. Never expose or request passwords, PINs, bot tokens, TOTP seeds, webhook secrets, or other secrets in chat or GitHub.
8. Keep all progress and decisions in this repository. Update this record and the relevant detailed runbook/readiness docs after meaningful work, including exact commit/PR/workflow evidence and remaining gates.

## Repository and public site

- Repository: https://github.com/marketpsychologysociety/mps-website
- Public website: https://marketpsychologysociety.github.io/mps-website/index.html
- Join page: https://marketpsychologysociety.github.io/mps-website/join.html
- Default branch: `main`
- Current candidate Apps Script source of truth: `rebuild/v4.8.1/Code.gs` and `rebuild/v4.8.1/Index.html`.
- Do not treat legacy folders `google-apps-script/` or `google-apps-script-v2/` as the deployed source. They are historical and contain older registration/deposit behavior.
- Read first: `rebuild/v4.8.1/README-ISOLATED-RUNBOOK.md`, `docs/MPS-V4.8-RELEASE-READINESS.md`, `docs/MPS-V4.8-REMAINING-ACCEPTANCE-GATES.md`, and `docs/MPS-V4.8-POST-MERGE-STATUS-2026-11-18.md`.

## DONE / VERIFIED

### Public site and PWA
- PR #130 merged: PWA manifest, service worker, install button, app icon, and related PWA support.
- PWA/website validation previously passed across 17 pages, including icon presence, service-worker behavior, offline fallback, mobile navigation, install-prompt flow, and public/private preview boundaries.
- GitHub Pages deployment for the PWA work completed successfully.
- PR #131 merged: public join-page status wording corrected from a misleading open-registration status to **“PORTAL PENDAFTARAN SEDANG DISIAPKAN”** and explanatory copy says submissions cannot yet be sent. The CTA now points to information rather than implying a live portal.
- PR #131 merge commit: `06ec894cc65f0b301a3745ee13e0f10143a888b0`.
- Join-page main-branch content was re-fetched and checked: new status/warning present; old misleading status absent. GitHub Pages workflow completed successfully.
- Existing membership wording preserved: Regular Member fee Rp100,000/month and Active IB first-deposit minimum Rp500,000.

### Candidate v4.8.1 source and CI
- Candidate is isolated under `rebuild/v4.8.1/`; it is not production-deployed and is not connected to production spreadsheet, Drive, bot, or webhook.
- Relevant GitHub Actions run #45109434521, job #137478152681: completed successfully. The job included the synthetic v4.8.1 suites, browser checks, static preview checks, and Apps Script handoff artifact. Treat this strictly as repository CI with synthetic/mocked services.
- Source/runbook reviewed on 2026-11-23. Provisioning is owner-only and guarded by `MPS_REBUILD_TEST_LABEL=MPS-ISOLATED-TEST`, expected owner email, synthetic resource naming, private Drive ancestry, exact recognized schema, and a one-time provisioning flag.
- Provisioner preflights the legacy sheet and every auxiliary sheet before first write; rejects populated test sheets or unknown schemas; creates only missing sheets after all preflight checks; does not clear/delete/rewrite member rows; binds the exact test spreadsheet ID; removes the one-time allow-provision flag.
- Initial registration creates Application Ref only (not Member ID) and does not send an initial Telegram admin notification. Later deposit/proof and Admin approval govern Member ID/PIN flow.
- Candidate source has separate Admin and Super Admin credential bootstrap and separate Google Authenticator TOTP secrets. Bootstrap refuses to overwrite existing hashes/secrets.
- Candidate source includes Telegram linking, Admin backup summary after deposit, VIP invite/join reconciliation, audit/health view, private proof checks, and backup/restore helpers; all real integrations remain subject to isolated acceptance.

## IMPLEMENTED / NOT LIVE-ACCEPTED

- v4.8.1 backend/frontend source exists and passes repository synthetic tests, but it has NOT been accepted in a real isolated Apps Script project.
- No live Apps Script runtime test, real Sheets persistence/ScriptLock contention, Drive ACL ancestry/editor/direct-file access verification, Telegram TEST bot/webhook delivery, VIP group join/leave, live Binance/PAXG market feed, physical Android acceptance, real backup trigger/restore, or quota/load test has been completed.
- Apps Script handoff source must only be installed into a brand-new standalone TEST project with synthetic resources. Never paste it into the old production MPS Apps Script project.
- Do not deploy, create triggers, or register Telegram webhook during initial source acceptance. The detailed runbook defines later owner-only isolated setup and acceptance order.

## NOT DONE / OPEN RELEASE GATES

- Create and configure a completely separate standalone Apps Script TEST project.
- Create empty synthetic spreadsheet and private synthetic proof, backup, and (if needed) Learning folders. Verify every parent folder is private. Use no production IDs or resources.
- Configure only the TEST Script Properties, including exact owner email and TEST marker. Never share secrets in chat.
- Run owner-only provisioning and read-only validation; inspect every boolean and error.
- Configure separate Admin/Super Admin credentials and Google Authenticator in TEST only.
- Complete isolated end-to-end acceptance: registration -> Application Ref -> plan-specific deposit/proof -> Telegram username verification -> Admin approval -> Member ID/PIN -> member authorization -> VIP invite -> confirmed join/leave and ticker.
- Verify Regular QRIS and Active IB conditions. QRIS asset is approved in source for the stated Regular Member fee but no payment is live/verified until the TEST acceptance and explicit deployment; Active IB verification remains manual, no Exness partner API integration.
- Verify member-only Market Pulse, Learning, News, VIP ticker, announcements, and backend/API authorization. Market data label must be transparent: UI may say XAUUSD for familiarity, but source is Binance Spot PAXGUSDT proxy, M5, WIB; never claim it is a broker XAUUSD feed.
- Complete real private backup/restore drill, Drive privacy checks, Telegram TEST bot/group tests, mobile acceptance, and security review.
- Reconcile candidate source against actual deployed project only after isolated acceptance. Production migration/deployment requires a separate explicit owner approval and rollback plan.
- Current release decision: **NO-GO for production** until the above gates are completed.

## Production and legacy storage — preserve

Existing production storage must remain untouched unless explicitly authorized:
- Spreadsheet: `MPS - Database Member`, sheet `Database Member`.
- Drive proof folder: `MPS - Bukti Konfirmasi`.
- Script Properties historically include `MPS_SPREADSHEET_ID` and `MPS_PROOF_FOLDER_ID`, plus Telegram/admin/PIN-related properties.
- Legacy core schema: 18 headers, in order:
  1. ID Member
  2. Waktu Daftar
  3. Nama Panggilan
  4. Username Telegram
  5. Negara
  6. Tujuan Bergabung
  7. Catatan Member
  8. Status Pendaftaran
  9. Nama Sesuai Akun
  10. Login MT5
  11. Jenis Akun
  12. Deposit Pertama (IDR)
  13. Tanggal Deposit
  14. Link Bukti Deposit
  15. Status Verifikasi Deposit
  16. Catatan Admin
  17. Waktu Konfirmasi
  18. Terakhir Diperbarui
- Candidate recognizes exact legacy 18-column schema or exact 30-column v4.8 schema. No live migration has been approved.
- Do not print, copy, or request property values or secrets.

## Product decisions and member-flow rules

- Regular Member: Rp100,000/month via QRIS. The QRIS payment channel is not to be represented as live until the approved QRIS asset/configuration is deployed and accepted.
- Active IB Member: no MPS monthly fee while Exness IB status is verified active and MPS conditions are met; first deposit minimum Rp500,000 goes into the member's own Exness account through the official MPS IB referral, not to MPS.
- No free trial. No profit/earnings guarantees.
- Initial registration creates only internal Application Ref and pending application; no Member ID and no initial Admin Telegram notification.
- Deposit/proof submission precedes Member ID reservation; Admin approval activates membership; PIN is issued only after approval.
- Admin review uses Admin authentication only; member content requires approved member status and valid member session/PIN.
- Public Market Pulse must remain static preview only. Private Pulse data/API endpoints must enforce authorization server-side.
- Public VIP ticker may show nickname only after backend confirms VIP group join; do not reveal MT5/login, deposit, proof, phone, or email.
- Learning and member News content must be real, source-backed premium content; do not fabricate placeholder content as live.
- Public announcements must respect audience, schedule, active state, and non-intrusive dismissal behavior.

## Important safety and product constraints

- No browser/PWA can guarantee Android OS screenshot blocking; that requires native Android FLAG_SECURE.
- Apps Script Web Apps do not expose client IP to handlers; application throttles are not a substitute for edge/WAF protection.
- Candidate temporary throttles use Apps Script cache and are not atomic/distributed.
- Super Admin currently has same review permissions as Admin; elevated Super Admin-only management actions remain undefined.
- Telegram webhook registration is not automatic. Only a dedicated TEST bot with username containing TEST and a TEST-named VIP group may be used in isolated acceptance. Never use production bot `MPS_Notificationnew_bot` or production VIP group for tests.
- The runbook's full acceptance suite creates a private backup snapshot and temporary restore copy, then cleans up the temporary copy; do not run until TEST resources are correctly configured and owner authorizes the TEST setup.
- Do not activate public center, Winner Draw, live market/news, private downloads, or other sensitive public features before their acceptance gates pass.

## Next work sequence

1. Continue independent source/runbook/security review of v4.8.1 and record findings here.
2. Prepare complete, exact TEST handoff files/artifacts for Android-friendly use; do not ask the owner to paste long partial snippets.
3. When the owner is ready, perform isolated TEST setup only, with explicit confirmation before any account-side resource creation or configuration.
4. Run and record validation and acceptance evidence. Fix source issues in an isolated branch/PR, not production.
5. Reassess release readiness. Keep production NO-GO until all mandatory gates pass and owner separately approves deployment.

## Progress update template

For each substantial task, append:
- Date/time (Asia/Jakarta)
- Scope and exact files changed
- Branch/PR/commit
- Tests run and exact result
- What was verified vs mocked/unverified
- Data/security/production impact (explicitly state none if none)
- Remaining blockers and next safe step


## 2026-11-23 — MPS Discipline X prototype
- User approved the MPS Discipline X direction: Neon Cyan + Purple + Gold; all interface text in Bahasa Indonesia; score based only on discipline and psychology (not profit/loss); journal fully private to each member.
- Product blueprint created: `docs/MPS-DISCIPLINE-X-BLUEPRINT.md`.
- Mobile-first static prototype created: `prototypes/mps-discipline-x/index.html`.
- Prototype includes a simple home screen, pre-trade check, psychology monitor, nominal risk-boundary calculator, trade note, daily review, and progress report.
- Prototype is explicitly labelled preview/demo; it does not authenticate users, save to a server, connect to Apps Script, or store member journal data.
- It is an isolated repository artifact only. No production website integration, Apps Script, spreadsheet, Drive, member data, Telegram, or deployment configuration was changed.
- Next safe step: review the mobile prototype visually and simplify any confusing wording/navigation before designing private backend storage and access-control. Do not claim the journal is live or private until backend authorization and cross-member isolation tests pass.


### 2026-11-23 19:47 WIB — MPS Discipline X prototype review
- Reviewed the current main-branch prototype and corrected the demo feedback handler: both example-save buttons now pass their own button reference explicitly instead of relying on the browser's deprecated implicit global `event`.
- Prototype commit: `fcf4198fd17376487fb800484b7cfc78108c3608`; file: `prototypes/mps-discipline-x/index.html`.
- Verified by source inspection that the interface remains a static Indonesian-language preview, with no member data persistence, authentication, Apps Script connection, or production integration.
- Attempted to inspect the two previously queued GitHub Actions runs (#45151018970 and #45151018827), but the available GitHub connector does not expose a general workflow-run status lookup, and direct page retrieval was unavailable in this session. Therefore deployment status and live Pages availability remain UNVERIFIED; do not present the preview URL as confirmed live.
- Local browser/device execution was not available in this session; no claim of Android/browser runtime testing is made.
- Production website, Apps Script, Sheets, Drive, member records, Telegram, and live access were not changed.
- Current stage result: prototype source updated; UI/backend integration and production release remain NOT DONE / NO-GO pending isolated test implementation and real acceptance.
