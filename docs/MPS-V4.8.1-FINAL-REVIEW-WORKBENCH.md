# MPS v4.8.1 Final Review Workbench

This branch is isolated from production. It is the review candidate for the one-time Code.gs + Index.html handoff.

## Added to candidate UI
- Dedicated VIP membership page with Regular and Active IB terms.
- Dedicated Trading Risk Warning & SOP page with pre-entry, in-trade, post-exit, and daily checklist.
- Navigation coverage test for all candidate pages.

## Important acceptance boundary
- UI presence is not proof of end-to-end membership billing or Exness IB verification.
- Candidate Code.gs currently has registration and deposit flows with Rp500,000 minimum deposit, but the registration payload does not yet select a membership plan. Monthly Regular Member QRIS billing and authoritative Active IB status verification remain integration gates.
- Do not merge or install into Apps Script until those gates are implemented and independently tested.
- Existing production spreadsheet, Drive folders, Script Properties, Telegram bot, and Apps Script deployment must remain untouched.

- Menu coverage test regex corrected after its first CI run exposed an escaping defect in the test itself.
