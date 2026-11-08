# MPS v4.7.0 — Staging Notes

Status: **DRAFT / NOT FOR MERGE**

This branch stages website-facing changes for the MPS v4.7.0 backend workflow. It is intentionally isolated from `main`.

## Included
- Homepage image loading optimization: below-the-fold imagery uses lazy loading and async decoding.
- Member Portal wording aligned to Application Ref → deposit/Telegram verification → admin approval → Member ID → PIN activation.
- Member Portal links target Apps Script panels for registration, learning, dashboard, heatmap, and admin.
- Join and deposit pages no longer submit legacy HTML forms or load the old join/deposit form scripts; they direct applicants to the official Member Portal.
- Privacy policy updated to describe separate pending applications/deposit records, post-approval Member ID issuance, PIN activation, and public ticker privacy boundaries.

## Current integration evidence (8 November 2026)
- The endpoint string in public `config.js` is identical to the MPS v4.7.0 Web App URL used for the successful health check.
- The health endpoint returned `service: MPS Member Backend`, `status: ready`, and `version: 4.7.0`.
- The latest saved v4.7.0 source files in the project Library contain a whitelist for all ten intended initial routes in `doGet()`, and the matching `Index.html` contains the corresponding page panels and initial `go(INITIAL_PAGE)` call.
- However, the earlier browser check reported that some direct `?page=` links initially opened Home. A health check showing version 4.7.0 does not prove that the active deployment uses the latest saved Code.gs/Index.html revision. The active deployment's source revision and direct-route runtime behavior must be reconciled.
- This confirms only that the health endpoint responds as v4.7.0. It does **not** prove registration, deposit, Telegram, admin approval, PIN activation, private-file access, or all API authorization paths.

## Explicitly not changed
- `config.js` is deliberately unchanged because its endpoint string matches the health-checked v4.7.0 endpoint. Do not change it without new evidence.
- No Google Apps Script deployment, Google Sheets/Drive, Telegram, Android release, or production settings were changed by this PR.
- No merge to `main` has been performed.

## Mandatory release blockers
1. Compare the active Apps Script deployment revision with the latest saved v4.7.0 Code.gs and Index.html. If the active deployment is older, publish the latest source as a new version only after the user confirms the deployment action.
2. Verify direct links for all intended routes (`home`, `register`, `deposit`, `heatmap`, `dashboard`, `learning`, `pulse`, `news`, `advertise`, `admin`), including refresh and browser back/forward behavior.
3. Test registration, separate deposit application storage, Telegram identity linking, admin approval, Member ID issuance, PIN delivery retry, and final activation in a controlled test environment.
4. Verify member/admin API authorization and private Drive file access using authorized and unauthorized sessions; do not rely on hidden UI panels as security.
5. Complete Android build, installation, and device checks only after the backend route behavior and website integration are stable.

## Static staging checks
- All five changed HTML files have no HTML `<form>` elements.
- No duplicate HTML IDs detected.
- No `target="_blank"` links missing `rel="noopener"`.
- Homepage: 9 image elements; 7 lazy-loaded; logo assets remain eager.
- Legacy `js/join.js` and `js/deposit.js` are no longer referenced by the staged Join/Deposit pages.

These checks are static only. They do not establish live Apps Script workflow, API authorization, Telegram delivery, browser, or device runtime success.
