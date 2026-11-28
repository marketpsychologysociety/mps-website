# MPS v4.8.1 — Kata-Kata Menampar + Trading Journal

This is an additive Apps Script integration candidate. It does not replace the existing Code.gs or alter the legacy 30-column Database Member schema.

## Files
- `JournalApi.gs`: add this as a **new .gs file** in the existing Apps Script project. It uses the existing `openDatabase_`, `requireMember_`, `consumeRateLimit_`, `recordMpsAudit_`, and `sha256_` helpers.
- `Index.html`: complete portal HTML candidate based on the archived MPS v4.8.1 Index (9), with one combined member-only page and navigation item.
- The public `journal.html` page links to the existing Web App deployment using `?page=home#journal`; the hash selects the journal view without changing the current doGet page whitelist.

## Install order
1. In the existing Apps Script project, add a new script file named `JournalApi` and paste `JournalApi.gs`. **Do not replace the current Code.gs with an older reconstructed copy.**
2. Replace the Apps Script `Index.html` with this candidate if it matches the current v4.8.1 Index (9) baseline. Preserve any later owner-approved changes if the deployed Index has moved ahead.
3. Save, then update the existing Web App deployment to a new version. Keep the existing execution/access settings unchanged.
4. Open the MPS website's Jurnal Perdagangan menu. Login with an active Member ID + PIN, then open Jurnal & Disiplin.

## Storage and access
- On the first authenticated journal read, the backend creates an additive `MPS Trading Journal` sheet if it does not exist. It checks the existing private database file and validates the exact header before use.
- Each read, save, update, and soft-delete calls `requireMember_(session)`; save/delete re-check the session after acquiring the script lock.
- Each row is bound to the server-derived Member ID. A different member cannot read, update, or delete it.
- The sheet is inside the existing database spreadsheet, which must remain PRIVATE. No legacy member columns or existing rows are changed.
- Delete is a soft-delete: removed entries disappear from the member's list but remain in the journal sheet for audit/recovery.
- No localStorage or sessionStorage is used for journal data or member sessions.

## Static checks performed
- JavaScript syntax check: passed for JournalApi.gs and the Index.html inline script.
- Mocked backend tests: create, read isolation, idempotent retry, update, cross-member update denial, cross-member delete denial, invalid input rejection, expired-session rejection, and soft-delete, formula-injection escaping, and post-write audit-failure handling all passed.
- **Not tested:** Apps Script live runtime, real spreadsheet permissions, live member login, or Telegram delivery. No deployment was performed.
