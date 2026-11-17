# MPS v4.8 — Member Recovery & Exness Rebate Transparency (2026-11-17)

## 2026-11-17 — Workbench implementation checkpoint: member recovery and Exness transparency

### Member recovery implementation
- Added backend methods `apiMemberRecoveryStart` and `apiMemberRecoveryComplete` to the isolated candidate Apps Script source.
- The request is bound to the existing registered MT5 login, an active/approved member record, and the already-linked private Telegram Access record. Caller-supplied Telegram IDs/usernames are not accepted.
- The backend returns a generic acknowledgement, sends an 8-character one-time confirmation code only to the previously verified private Telegram chat, expires the challenge after 10 minutes, stores only a salted hash of the code, and limits challenge attempts to five. Global and per-target rate limits are applied.
- Forgot Member ID sends the identifier only to the verified Telegram chat; the browser never receives the Member ID from the recovery endpoint. Forgot PIN lets the member choose a new six-digit PIN after confirmation; the existing salted PIN verifier is reused, and prior sessions fail the current PIN-verifier check.
- Recovery does not alter deposit approval, member status, MT5 mapping, or VIP membership. Audit events exclude the raw code and PIN. If Telegram is unavailable, the UI directs the member to Admin; Admin must verify existing registration/deposit evidence before any assisted recovery.
- Current tests include static contract assertions. Full synthetic runtime tests, Telegram-delivery failure/race tests, abuse testing, and Android browser acceptance remain required before any deployment.

### Exness Partnership API transparency
- The public Rebate page now states **NOT CONNECTED / WAITING FOR PARTNER API ACCESS** and explicitly says no live member-level figures are currently synchronized or being represented as verified.
- The planned integration remains read-only and uses the official Exness Partnership API, not Trading API. The minimum intended scope is `partnership.all:read`; no write endpoints or rebate configuration changes are allowed.
- Official Exness API reference documents signed requests using the `EXN-*` headers and Ed25519 signatures; API key and private signing material must remain backend-only. Read endpoints include client-account reports, rebate batches, rebate history, payments, and payment rebate rows. Batch, row, and payment states must be reconciled separately; `PROCESSED` alone does not prove every member row is paid.
- API data is eventually consistent. Member mapping must use a unique, verified MT5/client-account relation; no fuzzy match by name, email, or Telegram handle. Partner reward must not be conflated with the member's allocated rebate.
- The live adapter is not connected: MPS partner eligibility, Partner Personal Area access, read-only API key, signing key, allowed source IP, exact response schema, and secure signing runtime are not verified/provided in this workbench. No API credentials were requested in chat or committed. No sample/mock amount is shown as real data.
- Before member-level figures can appear, complete credential/partner verification, secure Ed25519 signing design, synthetic contract tests, unique account mapping, batch/row/payment reconciliation, member-isolation tests, and explicit owner approval for the integration credential/configuration stage.

Evidence: Exness official Partnership API reference (checked 2026-11-17): https://www.exness-api.com/reference/partnership/exness-partner-api ; Rebates guide: https://www.exness-api.com/partnership/guides/autorebates



## Verification checkpoint — 2026-11-17

- Latest candidate head for this checkpoint: `932904aa2c1f1716bd11c19e0ecd41c0d4f164ec`.
- GitHub Actions run [#44023899652](https://github.com/marketpsychologysociety/mps-website/actions/runs/44023899652) completed **SUCCESS, 78/78 steps, 0 failed steps** on this exact SHA.
- The API contract suite passed, including the new recovery contract assertions and runtime tests for unique MT5 matching, duplicate MT5 rejection, inactive-member rejection, and non-matching MT5 rejection. Chromium browser checks also passed.
- This does not test a live Apps Script deployment, actual Telegram delivery, a real member account, or Android device acceptance. No production resource was changed.
- A prior run failed because the new test assertion helper referenced an undefined local extractor; that test harness was corrected. The latest exact-head run above passed.
- The rebate page's minimum-deposit wording was aligned from Rp1.500.000 to Rp1.000.000 to match the current Membership page. This is a text consistency correction only; no deposit policy or member data was changed.
