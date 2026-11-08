# MPS v4.7.0 — Staging Notes

Status: **DRAFT / NOT FOR MERGE**

This branch stages website-facing changes for the MPS v4.7.0 backend workflow. It is intentionally isolated from `main`.

## Included
- Homepage image loading optimization: below-the-fold imagery uses lazy loading and async decoding.
- Member Portal wording aligned to Application Ref → deposit/Telegram verification → admin approval → Member ID → PIN activation.
- Member Portal deep links now target the corresponding Apps Script panels (registration, learning, dashboard, heatmap, and admin); the companion v4.7.0 backend/frontend route patch is supplied separately and must be installed before these links are considered live.
- Join and deposit pages no longer submit legacy HTML forms or load the old join/deposit form scripts; they direct applicants to the official Member Portal.
- Privacy policy updated to describe separate pending applications/deposit records, post-approval Member ID issuance, PIN activation, and public ticker privacy boundaries.

## Explicitly not changed
- `config.js` is deliberately unchanged.
- No Google Apps Script deployment, Google Sheets/Drive, Telegram, Android release, or production settings were changed.
- No merge to `main` has been performed.

## Mandatory release blockers
1. Verify the canonical Web App URL in Apps Script → Deploy → Manage deployments. The URL currently in public `config.js` differs by character order from the deployment URL noted in the MPS project handoff. Do not replace or publish an endpoint based only on a remembered/copied string.
2. Deploy and runtime-test backend v4.7.0 before publishing website text that describes its new workflow.
3. Test registration, separate deposit application storage, Telegram identity linking, admin approval, Member ID issuance, PIN delivery retry, and final activation against a controlled test environment.
4. Confirm that all Portal links resolve to the verified deployment URL.
5. Install the companion Code.gs / Index.html route patch so `?page=` deep links open the requested panel; then verify every route in the deployed Web App.

## Static staging checks
- All five changed HTML files have no HTML `<form>` elements.
- No duplicate HTML IDs detected.
- No `target="_blank"` links missing `rel="noopener"`.
- Homepage: 9 image elements; 7 lazy-loaded; logo assets remain eager.
- Legacy `js/join.js` and `js/deposit.js` are no longer referenced by the staged Join/Deposit pages.

These checks are static only. They do not establish live Apps Script, browser, Telegram, or device runtime success.
