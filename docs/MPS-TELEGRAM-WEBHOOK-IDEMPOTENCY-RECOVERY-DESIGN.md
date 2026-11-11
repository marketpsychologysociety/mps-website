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
| Completed At | Completion timestamp, if DONE |
| Effect Keys | Bounded, non-sensitive operation references |
| Last Error Code | Sanitized allowlisted error category only |

Do not store Telegram bot tokens, webhook secret, raw message text, member names, phone numbers, or full Telegram payloads in this journal. Access to the tab must be restricted to the backend owner/admins. Journal rows must not be exposed through public or member APIs.

### Atomicity and concurrency

All lookup-and-transition operations must execute under the same Apps Script script lock:

1. Validate `update_id` as a safe integer/string representation and compute the payload digest.
2. Find the unique journal row for the update ID.
3. If state is DONE, return duplicate-success without re-running handlers.
4. If PROCESSING with an unexpired lease, return a retryable conflict.
5. If RECEIVED, RETRYABLE, or PROCESSING with an expired lease, acquire a new PROCESSING lease and increment attempt count.
6. Persist the transition before releasing the lock and before running business handlers.
7. After successful handler completion, persist DONE under the lock.
8. On a recoverable error, persist RETRYABLE and a sanitized error code.
9. On an ambiguous external outcome, persist REVIEW rather than blindly repeating a non-idempotent action.

If the journal is missing, malformed, duplicated, or inaccessible, do not fall back to CacheService-only processing. Fail closed and alert through an independently configured operational channel.

### Apps Script spreadsheet adapter boundary

A candidate adapter is maintained separately under `tests/telegram-webhook/gas-spreadsheet-journal-adapter.gs`. It requires an explicitly supplied spreadsheet ID and an already-provisioned tab with exact headers. It does not create or repair a tab, read Script Properties, or connect itself to the webhook.

The adapter serializes its own read/claim/transition operations with `LockService.getScriptLock()`, validates the row schema and unique update ID, stores only an allowlisted update type plus a SHA-256 digest, and applies fencing-token plus lease-expiry checks to every terminal transition. The corresponding mocked-service tests are contract tests only; they do not prove actual Apps Script quotas, spreadsheet persistence behavior, lock contention under deployed executions, or Telegram side effects.

Google Sheets and Apps Script locks are not a transactional database. A script lock serializes cooperating executions but does not provide a multi-operation database transaction, and writes may fail or execution may terminate around a write. The adapter therefore fails closed on malformed or duplicate rows and must undergo isolated Apps Script runtime, concurrent execution, interruption, backup/restore, quota, and latency drills before it can be considered for production. If those tests cannot establish the required durability and operational headroom, use a transactional external datastore instead of treating Sheets as a durable queue.

## 4. Handler-level idempotency and reconciliation

A journal is necessary but not sufficient. Every handler must define its side-effect contract:

- **Chat join request:** before retrying approval/decline, query Telegram membership/request state. Treat an already-achieved desired state as success. If the API result is ambiguous and reconciliation is unavailable, move to REVIEW.
- **Chat-member status:** update the member's current derived status idempotently. Avoid emitting duplicate transition events by using a stable effect key based on update ID and effect type.
- **Private /start link verification:** the persistent member-link row's consumed state is the authoritative one-time token control. Cache markers are only an optimization. Repeated delivery must not bind the token to a second Telegram identity.
- **Bot membership/permission changes:** write an idempotent audit effect keyed by update ID and effect type; notifications need an outbox key and retry policy to avoid duplicate alerts.
- **Group candidate discovery:** setting the same candidate chat ID/title is idempotent; notification delivery should be tracked separately.

For every external side effect, document whether it is naturally idempotent, can be reconciled by reading remote state, or requires REVIEW after an ambiguous timeout. Do not assume Telegram API methods provide idempotency keys unless Telegram documents them.

## 5. Recovery and retention

- Expired PROCESSING leases are candidates for recovery, not proof that the previous attempt had no side effects.
- Recovery must run the handler's reconciliation step before repeating any external mutation.
- REVIEW rows must never be automatically replayed.
- Keep DONE records longer than Telegram's retry/redelivery horizon; initial operational target: 7 days, subject to measured volume and spreadsheet capacity.
- Do not delete rows solely by age without an archive/retention design and evidence-preserving audit trail.
- Monitor journal row count, processing lease age, retry count, REVIEW count, and write/read failures.
- Define an operator runbook for stuck leases, REVIEW resolution, backup, restore, and journal integrity checks.

## 6. Migration and rollout gates

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

## 7. Acceptance criteria

- Cache eviction does not erase durable deduplication state.
- Two concurrent deliveries of one update ID cannot both acquire a processing lease.\n- A stale worker cannot transition a row after another worker has reclaimed its expired lease.\n- A worker cannot complete, retry, or quarantine a claim after its lease expires, even if no replacement worker has claimed it yet.\n- Reuse of an update ID with a different payload digest is quarantined for manual review.\n- Numeric update IDs outside JavaScript's safe integer range are rejected; string IDs are validated without numeric coercion.
- A completed update is not reprocessed within the retention window.
- A stale PROCESSING row is reconciled before any retryable external mutation.
- Ambiguous side effects become REVIEW, not blind replay.
- Journal outage/corruption fails closed.
- Retryable failures remain retryable without losing the original update ID.
- All handler effects have stable effect keys or documented reconciliation.
- No raw webhook body, token, secret, or unnecessary PII is stored.
- Tests prove recovery after simulated crashes on both sides of external API calls.
- Runtime behavior is verified in an isolated Apps Script project and test spreadsheet before any production proposal.

## 8. Current implementation gap

The local candidate currently uses CacheService for update-level PROCESSING/DONE state. The code comment correctly acknowledges that CacheService may evict entries early and is not an exactly-once guarantee. This design document does not silently upgrade that implementation: durable journal code, isolated spreadsheet provisioning, runtime tests, Telegram test-bot tests, and operational monitoring remain unimplemented.

**Release decision:** NO-GO for production webhook migration until all acceptance criteria and operational gates are evidenced.
