# MPS v4.8.1 Candidate Reconciliation — 2026-11-24

Status: analysis only; no application source was replaced, no production resources were accessed, and no deployment was performed.

## Canonical sources inspected
- `candidates/Code.gs` — 425,709 characters; current workbench backend.
- `candidates/Index.html` — 160,643 characters; current workbench UI.
- `rebuild/v4.8.1/Code.gs` — 174,907 characters; isolated rebuild with separate membership/payment model.
- `rebuild/v4.8.1/Index.html` — 69,327 characters; matching rebuild UI.
- `rebuild/v4.8.1/assets/qris-regular.png` — static QRIS asset.

## Compatibility result: NOT SAFE TO OVERWRITE OR COPY WHOLE FILES

The candidate is a broader backend with many features absent from the rebuild (admin TOTP, request-ledger idempotency, recovery, legacy migration inspection, content/news/ad systems, Market Pulse validation, Trading Signals, durable Telegram/VIP transition queues, and extensive audit/security controls). The rebuild has a cleaner plan/payment separation but is a narrower application. Replacing either pair of files wholesale would discard functionality.

## Concrete data-model differences

Candidate:
- `MPS Applications`: 15 columns; no membership-plan field.
- `MPS Deposit Applications`: 14 columns; assumes broker deposit fields (account name, MT5 login, account type, amount, date, proof).
- `submitCore_` accepts only `register` and `deposit`.
- `saveDeposit_` enforces the Exness/broker deposit path and the Rp500,000 minimum.
- `adminVerifyApplication_` validates Telegram + broker deposit proof, then writes the 30-column member row. It requires MT5 uniqueness and deposit approval.
- Candidate frontend has a single broker-deposit form with MT5 fields and no Regular QRIS payment panel.

Rebuild:
- Adds `MPS Membership Plans` and `MPS Regular Payments` as distinct sheets.
- Has separate `apiSubmitRegularPayment`, `apiSubmitMemberRenewal`, and Admin renewal-review routes.
- Regular payment is exactly Rp100,000 by static QRIS, separate from the Rp500,000 Exness deposit path for Active IB.
- The QRIS image is static; user enters Rp100,000 manually. It is not a dynamic QRIS transaction and does not prove that a payment has been received.
- Membership approval/entitlement logic is separate from the candidate's current broker-deposit-only approval path.

## Required integration design (next coding phase)

1. Add an explicit plan choice at initial registration: `REGULAR` or `ACTIVE_IB`. Persist it in a dedicated plan ledger keyed by Application Ref; do not repurpose existing member columns or silently change the 15-column application schema.
2. Route `REGULAR` applications to a dedicated QRIS payment submission endpoint and separate payment sheet. Validate exactly Rp100,000, valid payment date, image signature, 5 MB cap, private Drive storage, request idempotency, and duplicate prevention.
3. Route `ACTIVE_IB` applications to the existing broker-deposit endpoint. Preserve the Rp500,000 minimum and broker account fields only for this plan.
4. Extend Admin queue payload/UI to show plan and the correct proof/payment fields. Do not show MT5 fields for Regular members. Admin approval must validate the correct evidence for the selected plan.
5. Keep Member ID issuance, PIN issuance, Telegram identity verification, and VIP entitlement gated behind the appropriate Admin decision. Regular payment approval must not be treated as Exness deposit approval.
6. Add explicit membership ledger records for plan, start/end, renewal, and entitlement state. A Regular approval starts a 30-day entitlement; renewal extends from the later of current expiry or approval time. Active IB requires periodic verified IB status and must not be charged the Regular fee while active.
7. Update member login, API authorization, dashboard, ticker eligibility, and content gates to check the authoritative membership entitlement—not merely a legacy `Berhasil` status.
8. Port the QRIS asset with a relative/controlled asset path and verify the deployed Apps Script HTML can load it. Keep the existing static image and label it as a static QRIS; never imply automatic payment verification.
9. Add regression tests for both plans, cross-plan rejection, duplicate/replayed requests, invalid amount/date/file, private proof storage, admin approve/reject, renewal boundaries, expiry, and preservation of the legacy 18/30-column member schema.

## Safety gates before any Apps Script update
- Do not run storage provisioning against production.
- Do not run migration or cleanup functions against existing member data.
- Do not change Script Properties, bot, webhook, triggers, spreadsheet, or Drive permissions.
- Use only isolated TEST spreadsheet/folders and dedicated TEST bot/group for runtime acceptance.
- Reconcile the two candidate files first, then execute static checks and tests, then isolated Apps Script acceptance. Production update remains a separate final approval step.

## Current verified status
- The rebuild package is present on `mps-v4.8-workbench` from commit `28aed7076b035788ab1a142f24b5119bdc04535e`.
- Candidate files remain unchanged.
- This report is an engineering reconciliation record, not evidence that the payment feature has been integrated or runtime-tested.
