# MPS v4.8 — Transaction Recovery Design

**Status:** Architecture proposal only. Not implemented in the backend and not runtime-validated.
**Scope:** Design response for static findings RW-01 through RW-07 in the saved candidate `Code(20261110-024213).gs`.
**Safety:** Workbench documentation only. No production source, database, Drive resource, Script Properties, deployment, trigger, or Telegram integration is changed.

## 1. Non-negotiable transaction model

Google Sheets, Drive, CacheService, and Telegram do not share an ACID transaction. MPS must therefore use a **write-ahead journal plus saga compensation and explicit reconciliation**, not claim atomic rollback.

A business operation is successful only after its required durable business writes and its durable COMMITTED journal event have both been verified. Cache invalidation and response-cache population are post-commit optimizations; they must never turn an already committed operation into a reported persistence failure.

If the journal cannot be validated or written before the first business mutation, abort before changing business rows or creating proof files.

## 2. Pre-provisioned journal contract

Create and validate a dedicated private sheet (proposed name: `MPS Transaction Journal`) only through a separately authorized setup/migration procedure. Public submit and admin endpoints must never create it automatically.

Proposed columns:

1. Transaction ID (UUID)
2. Operation type (REGISTER / DEPOSIT / APPROVE / REJECT / ACTIVATE / REPAIR)
3. Business reference (Application Ref or Member ID; never a raw token)
4. Actor class/reference (PUBLIC or internal admin reference; no secrets)
5. State
6. Event sequence
7. Step key
8. Target resource class
9. Stable target identity
10. Before-image reference or encrypted before-image
11. Intended after-image digest
12. Observed after-image digest
13. Attempt count
14. Started At
15. Updated At
16. Last error class/code
17. Compensation outcome
18. Reconciliation status

Exact headers, width, private access, and required protections must be validated before use. A missing, malformed, unexpectedly shared, or unwritable journal is a hard preflight failure.

Do not put PINs, raw Telegram link tokens, bot credentials, proof bytes, passwords, OTPs, or full proof URLs in journal metadata. Before-images can contain personal data (for example, Telegram identifiers or application fields); store only the minimum needed for compensation, encrypted with a separately managed key where feasible, and restrict sheet/script-editor access. Never write decrypted snapshots to execution logs. Key custody and recovery must be reviewed before implementation.

## 3. State machine and write ordering

Allowed states:

- PREPARED — all preflight checks and required before-images captured; no business mutation started.
- COMMITTING — one or more mutations are in progress; every mutation has a preceding durable INTENT event.
- COMMITTED — all required business writes verified and the terminal journal event durably recorded.
- COMPENSATING — compensation started after a pre-commit failure.
- COMPENSATED — all required compensation operations verified against their before-images.
- RECONCILIATION_REQUIRED — any compensation, journal, or state-verification step failed or produced an ambiguous result.

For each business mutation:

1. Capture and validate the exact before-image.
2. Append a durable INTENT event containing transaction ID, sequence, stable target identity, and protected before-image reference.
3. Verify the INTENT event was persisted.
4. Perform exactly one mutation.
5. Read back the target and verify the intended after-image.
6. Append a durable DONE event and verify it.
7. Continue to the next mutation.

If a mutation succeeds but its DONE event cannot be persisted, stop immediately. Do not continue or claim rollback succeeded. Mark/recover as RECONCILIATION_REQUIRED using an independently verified journal path; if even that path is unavailable, surface a high-severity operational alert and leave the operation blocked for manual reconciliation.

The terminal COMMITTED event is written only after every required business write has been read back and verified. Only after that boundary may cache invalidation, notification, or response-cache writes run as best-effort work.

## 4. Stable identity and compensation rules

Never compensate by searching a non-unique business key and deleting the first matching row. Capture a stable identity at creation time:

- Application: immutable Application Ref, with duplicate detection.
- Deposit: immutable operation/transaction reference added to the deposit schema in a separately reviewed migration; Application Ref alone is not sufficient if historical rows or retries can duplicate it.
- Telegram link: unique token hash plus captured row identity; retain the created row identity immediately after append, before any configuration lookup or URL construction.
- Telegram Access: capture exact target row identity and full before-image before changing status.
- Proof file: capture Drive file ID immediately after creation and before subsequent metadata operations.
- Member: capture immutable Member ID and exact inserted-row identity; verify uniqueness before any delete compensation.

Row numbers are not durable identities if rows can be sorted, inserted, or deleted outside the script lock. Where stable row IDs cannot be introduced safely, compare the full expected before/after row and fail closed on ambiguity rather than deleting or overwriting a possibly different record.

All backend mutation flows must share the same ScriptLock discipline. Manual edits and other scripts are outside that lock; the design must detect unexpected after-image values and stop for reconciliation rather than overwrite them.

## 5. Mapping to the seven findings

| Finding | Required correction |
|---|---|
| RW-01 | Snapshot every pending application-link row before changing its status; journal each exact target and restore/verify every changed row if the deposit operation aborts. |
| RW-02 | Snapshot every link row and the exact Telegram Access row before rejection mutations; restore all of them with application/deposit snapshots. |
| RW-03 | Replace empty/swallowed rollback catches with a compensation result collector; record every attempted/succeeded/failed compensation and transition to RECONCILIATION_REQUIRED if any result is not verified. |
| RW-04 | Establish the durable commit boundary before cache work. Post-commit cache failures cannot reverse or falsify the committed result. |
| RW-05 | Move CacheService invalidation and request-cache writes outside the business transaction. Add durable idempotency based on a persisted unique request/operation ID and fingerprint in the authoritative store. |
| RW-06 | Apply the same complete rejection snapshots as RW-02, with a fault-injection point after each individual link/access mutation. |
| RW-07 | Read/validate bot configuration before appending a link; after append, retain the exact row identity immediately. Any later error must be compensatable without relying on a helper return value. |

## 6. Idempotency and retry policy

CacheService is not an authoritative idempotency store. A cache miss, eviction, or outage must not permit duplicate business operations.

Persist a unique operation/request ID and request fingerprint in the authoritative transaction journal and link it to the business record. Under ScriptLock:

- same ID + same fingerprint + COMMITTED: return the stored committed outcome;
- same ID + different fingerprint: reject as request-ID reuse;
- same ID + PREPARED/COMMITTING/COMPENSATING: block replay and require recovery;
- same ID + COMPENSATED: allow a new attempt only under a new operation ID and only if the business state still permits it;
- same ID + RECONCILIATION_REQUIRED: block automatic retry until an authorized repair action resolves it.

Retention and privacy rules for operation IDs must be defined; do not store raw proof payloads or tokens to achieve idempotency.

## 7. Recovery and repair workflow

Recovery must be a separate admin-only operation, never an automatic public endpoint side effect.

1. Acquire ScriptLock and validate journal schema/access.
2. Load the transaction and ordered INTENT/DONE events.
3. Read current target resources and compare them with recorded before/after digests.
4. If every target matches the intended committed state, finish the COMMITTED transition only if the journal evidence is complete and policy permits.
5. If every target matches a known before-image or after-image and compensation is unambiguous, execute the approved compensation steps and verify each one.
6. If any target matches neither image, has duplicate identity, is missing unexpectedly, or the journal is incomplete, do not mutate it. Keep RECONCILIATION_REQUIRED and require a human-reviewed repair decision.
7. Record actor, reason, selected resolution, before/after digests, and outcome without secrets.
8. Make repair idempotent: repeating a completed repair must not change business data again.

No bulk clear/reset operation is part of this recovery design.

## 8. Required isolated tests before implementation/release

- Journal missing, malformed, shared, read-only, and write failure: operation must stop before business mutation.
- Failure before and after every journal INTENT, business write, read-back, DONE event, and terminal event.
- Every compensation succeeds; each compensation fails individually; multiple compensation failures; journal failure during compensation.
- RW-01/RW-02/RW-06: multiple pending link rows and Telegram Access restoration.
- RW-07: config lookup failure before append; post-append failure; exact-row compensation; duplicate-key ambiguity.
- RW-04/RW-05: cache get/remove/put failures before and after commit; durable replay after cache eviction.
- Concurrent duplicate requests and concurrent approval for one Application Ref.
- Unexpected manual row edit, row reorder, row deletion, duplicate operation ID, and partial migration.
- Proof-file privacy and cleanup failure, with synthetic Drive resources only.
- Actual disposable Apps Script runtime plus synthetic Sheets/Drive adapters. Node VM tests alone are insufficient.

## 9. Repository/source provenance gate

The saved candidate reviewed in the audit is not the same as the historical `google-apps-script-v2/Code.gs` currently present in the workbench repository. The latter identifies itself as Backend v2 and uses the legacy 18-column schema. Do not mistake it for the reviewed v4.8 candidate, do not overwrite it with partial snippets, and do not release a backend file until the exact complete candidate has been intentionally versioned, reviewed, and tested as a whole.

## 10. Release gate

This document is a design proposal, not evidence of implementation. The seven findings remain OPEN until the complete v4.8 candidate implements the corrections, deterministic fault-injection tests pass in a disposable Apps Script runtime, all compensation outcomes are verified, and the final Code.gs/Index.html pair passes full cross-review. No production migration or deployment is authorized by this document.
