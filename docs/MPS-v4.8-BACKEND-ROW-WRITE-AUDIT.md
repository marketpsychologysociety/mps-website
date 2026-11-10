# MPS v4.8 — Backend Row/Schema Audit

**Date:** 2026-11-11  
**Scope:** Static review of the saved candidate `Code(20261110-024213).gs` (Backend v4.8.0 reconstructed), plus comparison with the repository's historical `google-apps-script-v2/Code.gs`.  
**Environment:** Offline/source-only review. No Apps Script execution, spreadsheet connection, Drive access, Telegram request, or production mutation was performed.

## Executive result

- Candidate v4.8 source parses successfully with Node.js syntax checking after copying the `.gs` source to a temporary `.js` file. This is a JavaScript syntax check only, not an Apps Script runtime test.
- The candidate defines an exact 30-column `Database Member` schema: the 18 legacy columns plus 12 appended fields.
- `getMemberSheet_()` fails closed unless all 30 expected headers exist in their exact positions. An 18-column legacy sheet will therefore be rejected; it will not be silently upgraded by this accessor.
- Member applications and pending deposits are separated into auxiliary sheets. The member row is created only during admin approval after deposit and Telegram identity checks.
- No VIP trial/passkey implementation was found in the candidate source. The one-hour trial and optional member passkey remain requirements only.

## Evidence-backed findings

### 1. Member schema and positional mapping

The first 18 columns match the legacy member record layout. Candidate v4.8 appends:

19. Telegram Chat ID
20. Telegram Link Token
21. Telegram Linked At
22. PIN Hash
23. PIN Updated At
24. Telegram Link Expires At
25. Application Ref
26. VIP Invite Link
27. VIP Invite Expires At
28. VIP Joined At
29. VIP User ID
30. VIP Status

The source's `MPS_COL` map explicitly addresses legacy columns 1–18. New VIP and Telegram fields are addressed by zero-based array positions in some row logic (for example, positions 27–29 correspond to sheet columns 28–30). This is consistent in the inspected approval, activation, and VIP-gate paths, but should be replaced or supplemented by named constants for all 30 columns before final release to reduce off-by-one risk.

### 2. Strict header validation

`getMemberSheet_()` obtains the existing `Database Member` sheet and calls `validateHeaders_()`. Validation requires at least 30 columns and exact positional equality for all 30 expected headers. It does not create, rename, reorder, or migrate the member sheet.

**Consequence:** deploying this candidate against an 18-column database will fail closed for member operations. Do not weaken this check to accept 18 columns: the candidate reads/writes 30-cell rows, and doing so without a separately verified append-only migration would be unsafe.

### 3. Application/deposit lifecycle and row creation

- `registerMember_()` creates a separate `MPS Applications` row and does not create a member row.
- `saveDeposit_()` stores pending deposit data in `MPS Deposit Applications`, validates the Application Ref, amount, date, file signature and private proof folder, and creates a Telegram linking token.
- `adminVerifyApplication_()` checks Telegram identity consistency and proof-file identity before creating a 30-cell member row.
- Approval sets the new member row to `Menunggu Aktivasi` and deposit status `Disetujui`; activation follows successful PIN delivery and confirmation.
- `activateMemberAfterPin_()` reads and writes the full 30-cell member row and updates the related application/deposit status.

This lifecycle is source-reviewed only. It has not been run against Apps Script or a synthetic spreadsheet adapter.

### 4. Write safety and partial-failure handling

The submission and approval flows use ScriptLock and bounded row/range writes. Deposit submission attempts compensating rollback if sheet updates or Telegram-link creation fail. Admin approval snapshots the application, deposit, and Telegram-access rows and attempts to restore them if a later write fails; it also attempts to remove the newly created member row.

These are compensating operations, not a true multi-sheet transaction. A failure during rollback can leave partially updated auxiliary records. Before production use, inject failures after each write boundary in an isolated Apps Script test project and verify reconciliation/rollback outcomes. Do not simulate these failures on production data.

### 5. Auxiliary-sheet accessors can mutate

The accessors for `MPS Applications`, `MPS Deposit Applications`, and `MPS Member Telegram Links` create missing sheets and headers. They are appropriate only in workflows that intentionally initialize those resources. A read-only health check or audit routine must use direct `getSheetByName` inspection and must not call these accessors, or a supposedly read-only check could mutate the spreadsheet.

### 6. VIP authorization boundary

`requireVipMember_()` requires:
- a valid member session and approved member/deposit state;
- VIP status `Aktif`, a valid joined timestamp and Telegram user ID;
- a matching row in the existing `VIP Access` sheet; and
- a live Telegram membership check.

`apiGetVipCalculatorHtml()` and `apiCheckVipCalculatorAccess()` both use this strict paid-VIP gate. Do not relax or replace this global gate to implement a trial. The trial should be a separate, narrowly scoped entitlement check for explicitly allowlisted preview features, while paid-only APIs and calculator access remain behind `requireVipMember_()` unless the product owner separately authorizes otherwise.

### 7. Destructive test-data endpoint

`apiAdminClearTestMemberData()` requires Super Admin and then throws a fail-closed error; it does not clear member records. This behavior must remain disabled until a separately reviewed and explicitly approved maintenance workflow exists.

### 8. Current requested features absent from source

Search of the candidate function names and relevant API paths found no passkey/WebAuthn enrollment/assertion/revocation implementation and no VIP trial claim/start/expiry API or server-side timer state. The 60-minute VIP Trial and optional member passkey requirements are therefore **NOT IMPLEMENTED** in this candidate.

## Required next tests before any source release

| ID | Test | Current status |
|---|---|---|
| DB-01 | Exact 30-header validation and 18-column fail-closed behavior | Static source review; synthetic schema test exists separately |
| DB-02 | Append-only migration on a cloned spreadsheet, preserving all 18 legacy cells | NOT TESTED in Apps Script |
| DB-03 | Full 30-column approval row mapping and 8/10-hex ID preservation | Static source review; end-to-end NOT TESTED |
| DB-04 | Failure injection after each approval write; verify all compensating rollback paths | NOT TESTED |
| DB-05 | Failure injection during deposit upload/link/sheet update; verify file and row cleanup | NOT TESTED |
| DB-06 | Read-only health inspection does not create auxiliary sheets | NOT IMPLEMENTED as a dedicated test |
| DB-07 | Member/VIP direct API authorization with synthetic sessions | NOT TESTED against Apps Script |
| DB-08 | VIP trial one-time activation, 60-minute expiry, replay/concurrency, clock manipulation and direct-API denial | NOT IMPLEMENTED |
| AUTH-01 | Optional member WebAuthn/passkey flow with strict RP ID/origin verification | NOT IMPLEMENTED |

## Release blockers / cautions

1. Identify the actual deployed Apps Script source/version and execution/access model before claiming the candidate matches production.
2. Confirm the live spreadsheet schema using a read-only inspection path before any migration proposal. Do not run setup/initialization helpers against production.
3. Keep the 18-to-30-column migration additive, backed up, dry-run first, and separately approved.
4. Test the multi-sheet approval and deposit failure/rollback paths in an isolated project.
5. Resolve the WebAuthn origin/RP ID/server-verification architecture before passkey implementation; the static frontend and Apps Script endpoint are on different origins.
6. Implement VIP Trial as a separate server-side entitlement with a fixed server expiry and atomic one-time claim. The client countdown must never grant or extend access.

## Evidence limitations

This audit does not establish live database compatibility, actual Drive privacy, active deployment identity, real Telegram membership, runtime behavior, Apps Script quotas, or production security. No production system was accessed or changed.


## Read-only inspector and failure-injection preparation — 2026-11-11

A standalone helper was added at `scripts/mps-readonly-schema-inspector.gs`. It receives an explicitly selected Spreadsheet object and checks only the existence, header row, and last-row metadata of Database Member, MPS Applications, MPS Deposit Applications, and MPS Member Telegram Links. It does not open the database, initialize missing sheets, write values, format sheets, or inspect member rows. The VIP Access schema is intentionally excluded until its canonical header contract is established from a verified source.

A synthetic VM test was added at `scripts/test-readonly-schema-inspector.mjs`, and the repository workflow now invokes it. Test scenarios cover exact headers, 18-column legacy rejection at column 19, missing auxiliary sheet, altered header, invalid input, and absence of write calls. **The synthetic VM tests passed** in GitHub Actions run `42876672500` on commit `9e0346a3ee06460b59b5eed8dea2a9aa47192db6`. The same run also passed the PWA validator, synthetic schema compatibility tests, and Chromium browser checks. This is repository CI evidence only, not a Google Sheets or Apps Script runtime test.

The isolated Apps Script failure-injection runbook is in `docs/MPS-v4.8-ISOLATED-FAILURE-INJECTION-PLAN.md`. It requires a disposable Apps Script project, synthetic spreadsheet/Drive resources, deterministic adapter-level fault injection, rollback-failure cases, and concurrent duplicate-approval tests. It explicitly forbids production failpoint switches and production resources.

**Current status:** read-only helper and mock test added; execution pending. Actual Apps Script failure injection remains NOT TESTED. No rollback guarantee is established by this preparation.


## Additional static review — compensation gaps found (2026-11-11)

A second line-by-line review of the saved candidate source identified the following rollback gaps. These are **source-level findings**, not runtime reproductions:

### Finding RW-01 — prior Telegram links are not restored on failed deposit submission

In `saveDeposit_()`, the candidate creates a new Telegram link and calls `expireOtherApplicationLinks_()`, which changes other pending links for the same Application Ref to `Diganti`. If a later application-sheet update fails, the catch block restores the deposit/application snapshots and marks the newly created link `Dibatalkan`, but it does not snapshot or restore the prior link rows. A previously valid link can therefore remain expired even though the new deposit operation is rolled back.

**Required correction:** snapshot every affected prior link row/status before mutation; restore those rows if the transaction fails; if restoration fails, persist/emit a reconciliation-required state. Test failure immediately after each prior-link status mutation and during restoration.

### Finding RW-02 — rejection path omits rollback snapshots for Telegram links and access row

In `adminVerifyApplication_()`, the rejection branch changes pending application Telegram-link rows to `Ditolak` and changes the Telegram Access row to `Akses Ditolak`. The catch block snapshots/restores the application and deposit rows, but the rejection branch does not assign snapshots for the changed link rows or rejected Telegram Access row. A later failure can therefore restore the application/deposit state while leaving link/access state rejected.

**Required correction:** capture all changed link rows and the exact Telegram Access row before mutation; restore them on failure. Inject a failure after each write and during each rollback write. Verify that no state mismatch remains.

### Finding RW-03 — rollback errors are swallowed or only logged

The deposit compensation path uses empty catch handlers for restoration/deletion/link cancellation. The approval path logs rollback errors but rethrows only the original error. Neither path creates a durable reconciliation record or reports that compensation was incomplete.

**Required correction:** collect rollback outcomes, write a non-sensitive reconciliation record through a separately verified path, and return a distinct maintenance-required failure state. Never report a clean rollback when any compensation step failed. The reconciliation path itself must not mask the original failure.

### Finding RW-04 — cache failures can misreport an already-persisted submission as failed

In the outer submission flow, after `registerMember_()` or `saveDeposit_()` returns successfully, dashboard cache invalidation and request-result cache writes occur inside the same outer try block. If a cache operation throws after the sheet/file writes have committed, the handler can return an error even though the application/deposit is already persisted. The proof cleanup guard is intentionally disabled after `onProofLinked()`, so a caller retry may encounter an existing deposit rather than a clean retry.

**Required correction:** treat cache invalidation as post-commit best-effort work that cannot reverse the reported database outcome; keep durable idempotency independent of volatile cache where required. Add fault injection immediately after each successful persistence step and at each cache operation.

### Updated risk assessment

- RW-01: **High** — a failed submission can invalidate a previously valid Telegram verification link.
- RW-02: **High** — rejection failure can leave application/deposit and Telegram access/link states inconsistent.
- RW-03: **High** — incomplete compensation may be hidden from the caller and lacks a durable repair queue.
- RW-04: **Medium** — caller-visible failure after persistence can cause confusing retries or duplicate/blocked workflows.

These findings strengthen the release block: the candidate must not be considered rollback-safe until the isolated runtime fault-injection matrix passes and the compensation logic is corrected. No production data or service was changed.


## Third-pass static review — post-commit reporting and rejection completeness (2026-11-11)

### Finding RW-05 — post-commit cache invalidation is inside the persistence try/catch

In `submitCore_()`, after `registerMember_()` or `saveDeposit_()` returns successfully, cache invalidation at line 275 and the initial request-result cache write at line 278 still execute inside the same try/catch as the persistent writes. If either cache operation throws, the caller receives `ok:false` although the application/deposit rows have already been committed. For deposit, `proofLinkedToSheet` is already true, so the proof file remains; the API response nevertheless implies failure. This is a confirmed static control-flow issue, not a runtime reproduction.

**Required correction:** define a clear commit boundary immediately after the persistent operation returns. Cache invalidation and idempotency-cache population must be best-effort post-commit operations and must never convert a committed write into a failure response. Durable idempotency must not rely exclusively on CacheService; use a persisted request/operation reference with a unique constraint/lookup in the authoritative sheet.

### Finding RW-06 — rejection path mutates Telegram link/access state without snapshots

The rejection branch mutates every pending application link to `Ditolak` and changes the matching Telegram Access row to `Akses Ditolak`, but the transaction's snapshot variables only cover the application and deposit rows. The catch block therefore cannot restore link/access state if any later operation fails, including dashboard cache invalidation.

**Required correction:** snapshot the exact affected link rows and the Telegram Access row before the first mutation. Restore all affected rows on abort, collect rollback errors, and mark reconciliation-required if any restoration fails. Test both one-link and multiple-link cases.

### Finding RW-07 — new Telegram link can be orphaned before the caller receives its row/token

In `createMemberTelegramLink_()`, the link row is appended before the function reads Script Properties and constructs the return object. If a subsequent operation throws, the caller never receives the returned `link` object, so the surrounding deposit rollback cannot identify and cancel the newly appended row. This is a narrow failure window, but it is a real ordering hazard in the source.

**Required correction:** read and validate all configuration before appending; retain the created row/hash in a transaction-owned variable immediately after append; ensure any later exception compensates that exact row. Avoid looking up and deleting by a non-unique business key.

### Transaction design direction

Google Sheets/Drive do not provide a multi-resource ACID transaction. The correction must therefore be explicit about a saga/compensation model rather than claiming atomic rollback. Before any mutation, validate all schemas, permissions, proof metadata, and required configuration. Capture exact before-images for every row/file/relationship that can change. Persist a transaction journal in a pre-provisioned, header-validated sheet (never auto-create it in a public request), with a unique transaction ID and non-sensitive operation metadata. Record PREPARED, COMMITTING, COMMITTED, COMPENSATING, COMPENSATED, or RECONCILIATION_REQUIRED states. Do not store PINs, raw Telegram tokens, proof bytes, or credentials in the journal. If the journal itself is unavailable, fail before mutation. The repair process must be admin-only, audited, idempotent, and separate from public submission endpoints.

**Risk update:** RW-05 Medium; RW-06 High; RW-07 Medium. All remain static-source findings pending isolated Apps Script failure injection.
