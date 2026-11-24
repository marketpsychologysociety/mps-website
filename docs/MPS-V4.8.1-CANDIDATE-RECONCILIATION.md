# MPS v4.8 Candidate Reconciliation — 2026-11-25

Status: workbench integration and static/browser validation completed for the current candidate. This document is not a production acceptance or deployment approval.

## Canonical candidate sources
- `candidates/Code.gs`: integrated workbench backend; preserves the legacy 30-column member row and uses dedicated plan/payment/renewal ledgers.
- `candidates/Index.html`: matching candidate interface, including plan selection, Regular QRIS payment, renewal, and Admin review queues.
- `rebuild/v4.8.1/`: separate isolated rebuild/reference package. It is not interchangeable with the broader candidate pair and must not overwrite it.

## Membership model now integrated in the candidate

### MPS Regular Member
- Fee: exactly Rp100,000 per 30-day membership period, submitted through the supplied static QRIS image. Payer must enter the amount manually; the QR is not a dynamic transaction and does not automatically verify receipt.
- First payment is stored in `MPS Regular Payments`; renewals are stored separately in `MPS Regular Renewals`.
- Payment proofs are restricted to supported image types, capped at 5 MB, stored in the private proof folder, and revalidated before Admin approval.
- Telegram username/link verification is required before first-payment approval. The member row retains `Tidak Berlaku - Regular QRIS` as the broker-deposit status; QRIS is never written as an Exness deposit.
- Member ID is reserved after proof submission and finalized into the member row only after Admin approval. PIN issuance follows approval and requires confirmed Telegram delivery before account activation.
- The 30-day entitlement starts after PIN delivery is confirmed. Expired members may use the renewal-only path; member content remains blocked while expired.
- Renewal proof is private and Admin-reviewed. A renewal extends from the later of the current expiry or the approval timestamp, by 30 days. A pending renewal does not extend entitlement.

### MPS Active IB Member
- First deposit minimum remains Rp500,000 into the member's own Exness account through the official MPS IB referral, not paid to MPS.
- Active IB uses the separate Exness/broker-deposit evidence path. Regular QRIS proof is not accepted as broker deposit evidence.
- IB status is still manually verified by Admin. Automatic Exness Partner API verification, scheduled revalidation enforcement, and rebate integration are not implemented and remain release blockers.

## Telegram link reissue correction
The Admin reissue endpoint previously recognized Regular payment/renewal references but then fell through into the Member ID parser, and its Regular application branch rejected the actual `Pembayaran Dikirim` state. The current candidate now:
- resolves Payment Ref to its Application Ref;
- accepts a Regular application only while its matching Rp100,000 payment is pending and Telegram is not already verified;
- validates the plan-specific pending evidence before issuing a new one-time link;
- expires prior pending application links after creating the replacement;
- explicitly refuses to create a new registration link for a renewal, because the renewing member already has a linked Telegram identity;
- retains the legacy Member ID reissue path.

A regression assertion was added to `tests/apps-script/regular-membership-entitlement.test.mjs`.

## Data preservation and isolation
- The legacy `Database Member` schema remains 30 columns in the candidate; no silent migration or destructive cleanup is introduced by this change.
- Membership Plans, Regular Payments, and Regular Renewals are separate auxiliary ledgers.
- The candidate pair remains on `mps-v4.8-workbench`. The production `main` branch, Apps Script deployment, spreadsheet, Drive folders, Script Properties, production Telegram bot/group, and production webhook were not modified.
- The isolated rebuild remains a separate package and must only be tested with a separate TEST spreadsheet, private TEST folders, dedicated TEST bot, and TEST VIP group.

## Verification evidence
- GitHub Actions run: [45482487417](https://github.com/marketpsychologysociety/mps-website/actions/runs/45482487417) — completed successfully for candidate commit `358208e9c13c46dd180fc7cce9af43d9ab733f2b`.
- The workflow completed static/schema checks, synthetic Apps Script regression tests (mocked services), Chromium browser checks, screenshot upload, website preview packaging, and Apps Script handoff artifact packaging.
- Latest visual QA from the preceding successful browser run was inspected for desktop and mobile layout; the mobile homepage email float no longer overlaps the hero/ticker.
- These checks do not constitute execution inside Google Apps Script, real Drive ACL verification, live QRIS payment verification, live Telegram delivery/group acceptance, or Exness partner verification.

## Remaining release gates
1. Execute the isolated Apps Script acceptance runbook in a genuinely separate TEST project and TEST storage; no such live GAS runtime acceptance has been performed by this workbench.
2. Verify Drive private-folder ancestry and direct-file access in TEST.
3. Test the full Regular and Active IB journeys with synthetic users, including Telegram identity mismatch, rejected proof/resubmission, PIN delivery ambiguity, renewal expiry boundaries, and VIP join/leave.
4. Implement and verify automatic Active IB status/rebate integration, or explicitly retain a documented manual operating procedure before any release decision.
5. Supply and editorially verify real premium Learning/News content; do not publish placeholders or fabricated news.
6. Complete Android physical-device acceptance, quotas/contention checks, and production-grade edge/abuse controls.
7. Reconcile the workbench against the current `main` history before proposing a merge. The branches have diverged substantially; do not merge, rebase onto production, or deploy without an explicit reviewed plan and owner approval.

This is a candidate engineering checkpoint only. It is not a statement that MPS is production-ready.
