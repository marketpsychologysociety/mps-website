# Telegram webhook durable idempotency and recovery design

**Status:** design / acceptance contract only. No Apps Script runtime, live spreadsheet, Telegram API, or production deployment has been exercised by this document.

## 1. Problem statement

The current webhook wrapper uses `CacheService` entries named `mps_tg_update_<update_id>` with `PROCESSING` and `DONE` states. Cache entries can be evicted before their requested TTL. The cache is therefore a useful short-lived contention hint, but it is not a durable idempotency ledger.

A second failure window exists even with durable storage: Telegram may accept an external side effect (for example, approving a join request) and Apps Script may terminate before the local journal records completion. Retrying the update can repeat the side effect. Consequently, a durable `DONE` flag alone does not establish exactly-once execution.

## 2. Required delivery semantics

The system must not claim exactly-once delivery. The target is:

- durable deduplication of completed Telegram `update_id` values for a documented retention window;
- at-least-once retry for recoverable failures;
- idempotent or state-reconciled business effects;
- explicit quarantine/manual review for ambiguous outcomes that cannot safely be retried;
- fail-closed behavior when the durable journal cannot be read or updated.

The webhook may return success only after the update is durably marked completed or safely classified as a terminal no-op. A transient processing conflict must remain retryable.

## 3. Durable journal contract

Use a dedicated, access-restricted spreadsheet tab, provisioned by an explicit schema migration. Suggested tab name: `MPS Telegram Update Journal`.

Suggested columns:

| Column | Meaning |
|---|---|
| Update ID | Telegram numeric update identifier; unique key |
| Update Type | Allowlisted type, not raw payload |
| Payload SHA-256 | Integrity/correlation digest; never store raw webhook body |
| State | RECEIVED, PROCESSING, RETRYABLE, DONE, or REVIEW |
| First Seen At | Initial receipt timestamp |
| Last Attempt At | Most recent attempt |
| Attempt Count | Monotonic retry counter |
| Lease Expires At | PROCESSING lease expiry |
| Claim Token | Fencing token for the current worker claim; cleared on terminal transition |
| Completed At | Completion timestamp, if DONE |
| Effect Keys | Bounded, non-sensitive operation references |
| Last Error Code | Sanitized allowlisted error category only |

Do not store Telegram bot tokens, webhook secret, raw message text, member names, phone numbers, or full Telegram payloads in this journal. Access to the tab must be restricted to the backend owner/admins. Journal rows must not be exposed through public or member APIs.

### Atomicity and concurrency

All lookup-and-transition operations must execute under the same Apps Script script lock:

1. Validate `update_id` as a safe integer or a digit-only string and compute SHA-256 over canonical JSON (recursively sorted object keys; array order preserved).
2. Find the unique journal row for the update ID. If the ID exists with a different payload digest, quarantine it as REVIEW and stop.
3. If state is DONE, return duplicate-success without re-running handlers.
4. If PROCESSING with an unexpired lease, return a retryable conflict.
5. If RECEIVED, RETRYABLE, or PROCESSING with an expired lease, acquire a new PROCESSING lease, create a fresh unguessable claim/fencing token, and increment attempt count.
6. Persist the transition before releasing the lock and before running business handlers.
7. Every finish/retry/review transition must verify the same claim token and require the lease to remain unexpired. A stale worker must not overwrite a newer claim.
8. After successful handler completion, persist DONE under the lock.
9. On a recoverable error, persist RETRYABLE and a sanitized error code.
10. On an ambiguous external outcome, persist REVIEW rather than blindly repeating a non-idempotent action.

If the journal is missing, malformed, duplicated, or inaccessible, do not fall back to CacheService-only processing. Fail closed and alert through an independently configured operational channel.

### Apps Script spreadsheet adapter boundary

A candidate adapter is maintained separately under `tests/telegram-webhook/gas-spreadsheet-journal-adapter.gs`. It requires an explicitly supplied spreadsheet ID and an already-provisioned tab with exact headers. It does not create or repair a tab, read Script Properties, or connect itself to the webhook.

The adapter serializes its own read/claim/transition operations with `LockService.getScriptLock()`, validates the row schema and unique update ID, stores only an allowlisted update type plus a SHA-256 digest, and applies fencing-token plus lease-expiry checks to every terminal transition. This lock only coordinates executions of the same Apps Script project; the journal must have a single writer project and no other project or external process may write to the tab. The corresponding mocked-service tests are contract tests only; they do not prove actual Apps Script quotas, spreadsheet persistence behavior, lock contention under deployed executions, or Telegram side effects.

Google Sheets and Apps Script locks are not a transactional database. A script lock serializes cooperating executions but does not provide a multi-operation database transaction, and writes may fail or execution may terminate around a write. The adapter therefore fails closed on malformed or duplicate rows and must undergo isolated Apps Script runtime, concurrent execution, interruption, backup/restore, quota, and latency drills before it can be considered for production. If those tests cannot establish the required durability and operational headroom, use a transactional external datastore instead of treating Sheets as a durable queue.

## 4. Handler-level idempotency and reconciliation

A journal is necessary but not sufficient. Every handler must define its side-effect contract:

- **Chat join request:** before retrying approval/decline, query Telegram membership/request state. Treat an already-achieved desired state as success. If the API result is ambiguous and reconciliation is unavailable, move to REVIEW.
- **Chat-member status:** update the member's current derived status idempotently. Avoid emitting duplicate transition events by using a stable effect key based on update ID and effect type.
- **Private /start link verification:** the persistent member-link row's consumed state is the authoritative one-time token control. Cache markers are only an optimization. Repeated delivery must not bind the token to a second Telegram identity.
- **Bot membership/permission changes:** write an idempotent audit effect keyed by update ID and effect type; notifications need an outbox key and retry policy to avoid duplicate alerts.
- **Group candidate discovery:** setting the same candidate chat ID/title is idempotent; notification delivery should be tracked separately.

For every external side effect, document whether it is naturally idempotent, can be reconciled by reading remote state, or requires REVIEW after an ambiguous timeout. Do not assume Telegram API methods provide idempotency keys unless Telegram documents them.

## 5. Notification and side-effect outbox

The update journal and an effect outbox solve different problems. The update journal deduplicates Telegram update delivery; an outbox tracks each business effect (audit row, VIP ticker event, welcome DM, group notice, invite revocation, or admin alert) independently.

Suggested outbox columns: Effect Key (unique), Update ID, Effect Type (allowlisted), Payload SHA-256, State (PENDING, PROCESSING, SENT, RETRYABLE, REVIEW), Attempt Count, Lease Expires At, Claim Token, Created At, Last Attempt At, Completed At, Provider Reference (for example Telegram message ID), and Sanitized Error Code. Do not store rendered message text, member PII, credentials, or raw webhook payloads.

- Local deterministic writes (such as setting a member's current status) should be idempotent upserts keyed by the effect key.
- Effects with authoritative read-back (such as Telegram group membership) must reconcile remote state before retrying.
- Telegram sendMessage does not provide a caller-supplied idempotency key or a reliable lookup by our effect key. If Telegram accepted a message and Apps Script terminated before persisting the response/message ID, the outcome is ambiguous. Move the effect to REVIEW; do not blindly resend unless the business explicitly chooses at-least-once delivery and accepts duplicate messages.
- Marking an outbox item SENT only after the remote API returns success still leaves a crash window between remote success and local SENT persistence. This cannot be solved by a local outbox alone; document the chosen duplicate-versus-loss tradeoff for each notification type.
- A business state mutation and its outbox write may span multiple spreadsheet writes. ScriptLock serializes cooperating executions but does not make those writes a database transaction. Recovery must inspect authoritative business rows and reconcile missing/pending effects.
- The update may be marked DONE only when required business state and its effect intents are durably recorded. A notification that remains REVIEW must not cause a previously committed member-access mutation to be rolled back.

### Effect outbox contract candidate

A separate synthetic contract candidate is maintained in `tests/telegram-webhook/durable-effect-outbox.mjs` with tests in `durable-effect-outbox.test.mjs`. It is intentionally independent of the update journal:

- deterministic effect keys identify one business transition, not merely one member; a later VIP reactivation must receive a new transition key;
- enqueue stores an allowlisted effect type, update reference, and payload digest, not rendered message text or recipient PII;
- duplicate enqueue with the same key and same digest is idempotent; key reuse with different content moves the row to REVIEW;
- claims use leases and fencing tokens; SENT and REVIEW are terminal to automatic claiming;
- expired PROCESSING effects require reconciliation: APPLIED becomes SENT, NOT_APPLIED may proceed, UNKNOWN becomes REVIEW;
- a thrown send error is retryable only when the adapter explicitly marks `retryableNoEffect === true`; otherwise it becomes REVIEW.

This is a state-machine contract backed only by a shared in-memory test store. It is not a spreadsheet adapter, not integrated with the webhook, and does not make Telegram sendMessage exactly-once. The external side-effect crash window remains unresolved without provider idempotency or authoritative read-back.

### Handler replay and transition contract candidate

A separate pure helper and synthetic test suite are maintained in `tests/telegram-webhook/handler-reconciliation.mjs` and `handler-reconciliation.test.mjs`. The tests define (but do not integrate) the following safeguards:

- a consumed application/legacy link is acknowledged as already verified only when the persisted link, access row, Telegram user ID, private chat ID, and Application Ref/member ID all match;
- a different Telegram identity or chat remains rejected; inconsistent application state is quarantined for review;
- VIP activation is modeled as a transition from non-member to member, not as a one-time flag on the member record;
- ticker and audit effect keys include the Telegram update ID, so the same update replay has stable keys while a later reactivation can create a new event.

Read-only review of the isolated Code.gs candidate found that these safeguards are not yet integrated: consumed links are rejected before same-identity reconciliation, and `updateVipJoinStatus_` writes active status before ticker/audit writes while receiving no update ID. The helper tests are not Apps Script runtime tests and do not prove the production handler behavior.

## 6. Recovery and retention

- Expired PROCESSING leases are candidates for recovery, not proof that the previous attempt had no side effects.
- Recovery must run the handler's reconciliation step before repeating any external mutation.
- REVIEW rows must never be automatically replayed.
- Keep DONE records longer than Telegram's retry/redelivery horizon; initial operational target: 7 days, subject to measured volume and spreadsheet capacity.
- Do not delete rows solely by age without an archive/retention design and evidence-preserving audit trail.
- Monitor journal row count, processing lease age, retry count, REVIEW count, and write/read failures.
- Define an operator runbook for stuck leases, REVIEW resolution, backup, restore, and journal integrity checks.

## 7. Migration and rollout gates

The migration must be additive and reversible before activation:

1. Create the journal tab only in an isolated test spreadsheet.
2. Validate exact headers, uniqueness constraints implemented under lock, permissions, and capacity.
3. Run synthetic tests for duplicate delivery, concurrent delivery, lock timeout, cache eviction, process crash before/after external side effect, expired lease, malformed journal, sheet unavailable, and recovery.
4. Test every handler's reconciliation independently with a fake Telegram adapter and then in a separately controlled Telegram test group/bot.
5. Verify no raw payload, secrets, or member PII are persisted.
6. Run backup/restore and verify journal integrity.
7. Review quota/latency under expected update volume.
8. Only after isolated runtime acceptance, prepare a production migration plan. Production schema changes and webhook activation require separate explicit approval.

Do not switch the production webhook to this design as part of this work item.

## 8. Acceptance criteria

- Cache eviction does not erase durable deduplication state.
- Two concurrent deliveries of one update ID cannot both acquire a processing lease.
- A stale worker cannot transition a row after another worker has reclaimed its expired lease.
- A worker cannot complete, retry, or quarantine a claim after its lease expires, even if no replacement worker has claimed it yet.
- Reuse of an update ID with a different payload digest is quarantined for manual review.
- Semantically identical JSON payloads with different object-key ordering produce the same digest.
- Numeric update IDs outside JavaScript's safe integer range are rejected; string IDs are validated without numeric coercion.
- A completed update is not reprocessed within the retention window.
- A stale PROCESSING row is reconciled before any retryable external mutation.
- Ambiguous side effects become REVIEW, not blind replay.
- Journal outage/corruption fails closed.
- Retryable failures remain retryable without losing the original update ID.
- All handler effects have stable effect keys or documented reconciliation.
- No raw webhook body, token, secret, or unnecessary PII is stored.
- Tests prove recovery after simulated crashes on both sides of external API calls.
- Runtime behavior is verified in an isolated Apps Script project and test spreadsheet before any production proposal.

## 9. Current implementation gap

The local candidate currently uses CacheService for update-level PROCESSING/DONE state. The code comment correctly acknowledges that CacheService may evict entries early and is not an exactly-once guarantee. This design document does not silently upgrade that implementation: durable journal code, isolated spreadsheet provisioning, runtime tests, Telegram test-bot tests, and operational monitoring remain unimplemented.

**Release decision:** NO-GO for production webhook migration until all acceptance criteria and operational gates are evidenced.


## 5A. Append-only effect-key compatibility migration (design contract)

The reconstructed Code.gs candidate currently defines the legacy audit schema as seven columns and the ticker schema as six columns. Existing readers request those original column counts. The compatibility proposal is therefore an **append-only extension**, not a rename, reorder, or replacement:

- \`MPS Audit Logs\`: preserve the seven existing columns exactly and append \`Effect Key\` as column 8.
- \`MPS VIP Ticker Events\`: preserve the six existing columns exactly and append \`Effect Key\` as column 7.
- Historical rows remain unchanged; their new key cells remain blank. Do not infer keys for old events.
- New keyed audit/ticker rows write the stable effect key in the same row as the event. A retry can scan the key column and recognize an append that completed before the previous execution was interrupted.
- The check-and-append sequence must execute under the same Apps Script script lock. A real adapter must validate uniqueness across the full key column before appending and fail closed on duplicates, malformed keys, unknown extra columns, or a mismatched legacy header.
- Existing seven-/six-column readers remain compatible because they read only their original leading columns. The migration must not rewrite or truncate existing rows.

The isolated contract is in \`tests/telegram-webhook/effect-ledger-migration.mjs\` and \`effect-ledger-migration.test.mjs\`. It covers schema planning, legacy-row preservation, duplicate/collision detection, concurrent append attempts, deterministic update-scoped keys, and a simulated crash after append but before caller acknowledgement.

**Important limitation:** this synthetic in-memory contract does not implement a Google Sheets adapter. Sheets writes plus ScriptLock are not a transactional database; this design only narrows the crash window for a single append by storing its idempotency key in that same appended row. It does not make the member-status write plus ticker/audit writes atomic. The real migration must be an explicit, separately reviewed admin operation in an isolated spreadsheet, with backup, before/after header snapshots, row-count checks, and rollback evidence. It must never auto-run from a normal webhook or silently modify production sheets.


### Isolated Google Sheets effect-ledger adapter candidate

A separate Apps Script adapter candidate is maintained in \`tests/telegram-webhook/gas-effect-ledger-adapter.gs\`, with mocked-service tests in \`gas-effect-ledger-adapter.test.mjs\`. It is not called by the webhook and requires an explicitly supplied isolated spreadsheet ID.

The explicit \`migrate(kind)\` operation acquires the Apps Script script lock, validates the exact legacy header prefix, appends only the \`Effect Key\` header (audit column 8; ticker column 7), flushes, and re-reads the schema. It never creates a spreadsheet/tab or repairs unknown columns. A retry after interruption immediately following the header write recognizes the completed header. Existing legacy rows are not rewritten; their new key cells remain blank.

The \`appendOnce(kind, effectKey, rowValues)\` operation requires the migrated schema, validates the full existing key column for malformed/duplicate keys, and performs key lookup plus append under the same script lock. Since this schema has only one appended key column (no payload-hash column), same-key replay compares the complete legacy row payload: an exact match returns \`ALREADY_APPENDED\`; different row content returns \`REVIEW_KEY_COLLISION\`. Callers must therefore construct deterministic row values for a given effect key (including stable timestamps/event IDs). The adapter does not make member-status and ticker/audit writes atomic.

The mocked suite covers 22 cases: both sheet migrations, legacy row preservation, schema mismatch/unknown columns, missing sheet, migration/append interruption and replay, duplicate/malformed keys, same-key payload collision, lock release/failure, and concurrent invocation attempts. These tests validate adapter logic against a fake Apps Script surface only. They do not prove actual Google Sheets persistence, true deployed ScriptLock contention, quotas, latency, or runtime crash semantics. A separate Apps Script project and isolated spreadsheet drill remains mandatory before integration. No production spreadsheet has been touched.
