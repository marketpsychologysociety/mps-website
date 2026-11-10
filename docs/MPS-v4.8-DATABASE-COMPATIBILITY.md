# MPS v4.8 — Database Schema Compatibility Audit

**Date:** 2026-11-11  
**Scope:** Read-only comparison of the saved MPS v4.6.1 backend schema and reconstructed v4.8.0 candidate.  
**Environment:** Source/library inspection only. No spreadsheet, Apps Script deployment, Drive folder, Script Property, member record, or production service was accessed or modified.

## 1. Evidence and conclusion

The saved v4.6.1 source declares the authoritative `Database Member` schema as exactly 18 headers. The saved reconstructed v4.8.0 candidate declares 30 headers. The first 18 names and their order match exactly; v4.8.0 appends 12 fields at columns 19–30.

The v4.8.0 candidate's `validateHeaders_()` requires at least 30 columns and checks all 30 headers for exact positional equality. It does not contain an automatic schema migration or append-column migration routine. Therefore, an existing 18-column database will be rejected by the candidate's member-sheet access path until a separately designed and approved additive migration has been performed.

**Important:** this is a source compatibility finding. The actual live production sheet's current header row and width remain NOT VERIFIED. Do not assume it is still 18 columns until a read-only inspection of the actual deployed database is authorized and available.

## 2. Exact 18-column legacy schema

| Column | Header | Compatibility |
|---:|---|---|
| 1 | ID Member | Preserve exact position and values |
| 2 | Waktu Daftar | Preserve exact position and values |
| 3 | Nama Panggilan | Preserve exact position and values |
| 4 | Username Telegram | Preserve exact position and values |
| 5 | Negara | Preserve exact position and values |
| 6 | Tujuan Bergabung | Preserve exact position and values |
| 7 | Catatan Member | Preserve exact position and values |
| 8 | Status Pendaftaran | Preserve exact position and values |
| 9 | Nama Sesuai Akun | Preserve exact position and values |
| 10 | Login MT5 | Preserve exact position and values |
| 11 | Jenis Akun | Preserve exact position and values |
| 12 | Deposit Pertama (IDR) | Preserve exact position and values |
| 13 | Tanggal Deposit | Preserve exact position and values |
| 14 | Link Bukti Deposit | Preserve exact position and values |
| 15 | Status Verifikasi Deposit | Preserve exact position and values |
| 16 | Catatan Admin | Preserve exact position and values |
| 17 | Waktu Konfirmasi | Preserve exact position and values |
| 18 | Terakhir Diperbarui | Preserve exact position and values |

These exact headers are present in the saved v4.6.1 source. This is not a live spreadsheet read.

## 3. v4.8.0 additive fields

The candidate retains columns 1–18 without renaming or reordering and adds these fields:

| Column | Added header | Design notes |
|---:|---|---|
| 19 | Telegram Chat ID | Telegram account/chat linkage metadata; restrict access |
| 20 | Telegram Link Token | Sensitive linkage field; never expose in public UI/logs |
| 21 | Telegram Linked At | Link lifecycle timestamp |
| 22 | PIN Hash | Credential verifier only; never plaintext PIN |
| 23 | PIN Updated At | Credential lifecycle timestamp |
| 24 | Telegram Link Expires At | Link expiry timestamp |
| 25 | Application Ref | Links member record to application workflow |
| 26 | VIP Invite Link | Sensitive invitation URL; restrict access and expire/revoke |
| 27 | VIP Invite Expires At | Invitation expiry timestamp |
| 28 | VIP Joined At | VIP membership timestamp |
| 29 | VIP User ID | Telegram/VIP identity metadata; restrict access |
| 30 | VIP Status | VIP lifecycle/status |

## 4. Source compatibility checks

| Check | Result | Evidence / limitation |
|---|---|---|
| v4.6.1 declares 18 headers | PASS | Saved source header constant |
| v4.8.0 declares 30 headers | PASS | Saved candidate source header constant |
| First 18 headers match exactly and in order | PASS | Direct source comparison |
| v4.8.0 appends 12 fields | PASS | Candidate header constant |
| v4.8.0 accepts an 18-column sheet without migration | FAIL | `validateHeaders_()` rejects lastColumn < 30 |
| v4.8.0 contains an explicit additive member-schema migration | NOT FOUND | Targeted source search found no migration routine |
| v4.8.0 fails closed on a short/mismatched header | PASS (source-level) | Validation throws before member-sheet operations proceed |
| Live production header row is 18 or 30 | NOT VERIFIED | No live spreadsheet read performed |
| Live production data has been migrated | NOT VERIFIED | No live spreadsheet read performed |

The v4.8.0 source also reads/writes complete 30-cell member rows in selected lifecycle operations. This is consistent with its declared 30-column contract, but it reinforces that the candidate must not be deployed against an 18-column sheet before an approved migration.

## 5. Required safe migration design (not executed)

If a live read-only inspection confirms exactly the legacy 18 headers, the proposed migration is **append-only**:

1. Obtain explicit approval for a read-only production schema inspection; do not read member values unless separately necessary and authorized.
2. Record spreadsheet ID internally without disclosing it; inspect sheet name, last column, exact first 18 header strings, and whether columns 19 onward contain any data or formulas.
3. If any of the first 18 headers differ, or any unexpected data/formulas exist beyond column 18, STOP. Do not guess, overwrite, or reorder.
4. Create and verify a restricted backup using an approved method. A backup is not valid until its existence, access restrictions, and row/header integrity are checked.
5. Produce a dry-run report with sheet dimensions, row count, header diff, duplicate/member-ID checks, and non-empty cells in columns 19 onward. Do not change the sheet during dry run.
6. In an isolated test spreadsheet, test appending only the exact 12 headers to columns 19–30, leaving columns 1–18 byte/value-identical. Confirm existing rows remain unchanged and new cells are blank.
7. Test candidate v4.8.0 against the isolated 30-column copy with synthetic identities/data; verify all required auxiliary sheets and their exact headers separately.
8. Prepare rollback by restoring the verified backup to a separate isolated copy first. Production rollback steps must be explicit and reviewed.
9. Only after Super Admin approval for the exact operation, perform a controlled append-only production migration. Never clear/rebuild the sheet or rewrite existing member rows as a migration shortcut.
10. Re-read and compare the first 18 headers and all pre-existing member values/IDs after migration; verify columns 19–30 contain only intended new fields and expected values.
11. Verify the candidate backend against the migrated production schema only after a separately approved deployment plan. Schema migration approval does not authorize deployment.

No migration is authorized by this document.

## 6. Additional-sheet compatibility

The v4.8.0 candidate defines separate sheets for applications, deposit applications, Telegram member links, and VIP access. These are not extra columns in `Database Member`. Their presence, exact headers, ownership, permissions, and historical data must be checked separately.

Do not auto-rewrite mismatched auxiliary headers. Do not create or rename production sheets as part of this source-only audit. The isolated test runbook's 30-header test fixture is appropriate only for a fresh synthetic test spreadsheet; it is not evidence that production has 30 columns or has been migrated.

## 7. Mandatory implementation guardrails

- Preserve all 18 legacy headers in their exact order and preserve all existing row values and member IDs.
- Treat the 12 added columns as append-only and versioned.
- No delete, clear, rename, reorder, bulk rewrite, or reset of the member sheet.
- Fail closed on unknown headers, unexpected columns/data, duplicate identities, or incomplete backup.
- Make migration idempotent: a second dry run detects the completed state and performs no additional change.
- Keep member values, PINs, tokens, Telegram IDs, proof URLs, and other personal data out of reports and logs.
- Keep Dashboard MPS reporting read-only with respect to the authoritative member sheet.
- Run schema migration only on a synthetic test copy before production approval.

## 8. Next work

1. Verify the actual active Apps Script deployment/source/version and its database contract without changing production.
2. If and only if authorized, perform a read-only inspection of the actual production header row and schema width.
3. Build a synthetic 18-column fixture and test the append-only 12-column migration independently.
4. Review every v4.8.0 member-row read/write for assumptions about the 30-column layout and legacy ID formats.
5. Reconcile auxiliary sheet contracts and dashboard compatibility.
6. Add automated schema tests for exact 18-header legacy input, exact 30-header migrated input, mismatched/reordered headers, unexpected data beyond column 18, and repeat migration idempotency.

**Current state:** source-level compatibility is established; live production schema and migration behavior remain unverified. No production changes have been made.
