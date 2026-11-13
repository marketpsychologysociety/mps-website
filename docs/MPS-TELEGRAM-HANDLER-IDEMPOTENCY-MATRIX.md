# MPS Telegram handler idempotency audit

**Scope:** read-only source review of the isolated MPS v4.8 Code.gs candidate. No production deployment, spreadsheet, Script Properties, webhook, or Telegram API was changed or exercised.

## Findings

### Newly verified source-level gaps (isolated Code.gs candidate, read-only)

- **[x] Application and legacy one-time link replay:** the candidate now recognizes a consumed `Terverifikasi` link only after the original Telegram user ID and private chat ID match, then cross-checks the persisted `VIP Access` row and the corresponding Application Ref record. The legacy path also requires the linked member row to still exist and, when an Application Ref is present, verifies its stored Telegram binding. A different identity or inconsistent persisted binding is rejected; replay does not repeat the success DM or business writes. Candidate-level mocked regression tests cover same-identity replay after expiry and cross-identity/access/application mismatch rejection (`candidate-link-replay-reconciliation.test.mjs`). Real Apps Script runtime acceptance remains open.
- **VIP activation side effects:** `updateVipJoinStatus_` writes `Aktif` to the access row and member row before appending ticker and audit events. If execution terminates after the status writes but before either event write, a retry observes `wasActive=true` and skips both events. The ticker event uses a random event ID, not a stable update/effect key. The handler currently receives no `update_id`, so it cannot derive a deterministic effect identity from the Telegram update.
- **VIP reactivation:** a member who leaves is set to `Keluar`, so a later transition back to active can be a legitimate new activation. This must create a new event for that transition while duplicate delivery of the same update must not create a second event.


| Update / handler | Current source behavior | Crash-after-effect retry risk | Required reconciliation |
|---|---|---|---|
| Group /start candidate discovery | Writes candidate group ID/title to Script Properties, then sends a group notice | A crash after Telegram accepts the notice but before webhook completion can send the notice again | Store a stable effect key/outbox status; candidate property write is naturally idempotent, notification delivery must be separately deduplicated or accepted as at-least-once |
| Private /start without link | Sends a welcome message | A crash after send but before webhook completion can duplicate the welcome | Use an outbox effect key and delivery status; if Telegram offers no reliable read-back, document at-least-once notification semantics |
| Application Telegram link | Validates a pending one-time link, writes access/application/deposit/link rows, then sends a confirmation | Same-identity replay is now acknowledged after link, access row, and Application Ref Telegram binding all match; notification delivery remains a separate side effect and can still be ambiguous | Candidate replay reconciliation is implemented and mocked-tested. Track confirmation separately with a stable outbox key and exercise in isolated Apps Script/Telegram test infrastructure |
| Legacy member Telegram link | Consumes a one-time link and writes access/member/application rows under a script lock | Same-identity replay is now acknowledged only after the original link, access row, member row, and any associated Application Ref binding agree; different identities remain rejected | Candidate replay reconciliation is implemented and mocked-tested; real Apps Script runtime acceptance remains open |
| VIP join request | Checks current membership with getChatMember before approving; after failed API response it checks membership again | Membership mutation has useful reconciliation. Welcome DM can still be duplicated after a crash, and remote API ambiguity must not be blindly retried | Preserve membership read-back as the authoritative reconciliation. Track welcome DM in an outbox; ambiguous approve/decline outcomes become REVIEW when read-back cannot establish state |
| VIP chat-member status | Calls updateVipJoinStatus_ with the current Telegram membership status | Membership row assignment is repeatable. However, the helper marks the member Aktif before appending the VIP ticker event and audit row; a crash between those writes means replay sees wasActive=true and can permanently skip the ticker/audit event. In addition, the ticker writer rejects any prior row for the same member ID, so a legitimate later re-activation cannot generate a new welcome event. Invite revocation, unauthorized-member ban/unban, and admin alerts are separate effects with their own ambiguous retry windows | Use a durable pending effect/outbox record keyed by the specific activation transition before marking the transition complete; reconcile ticker and audit publication independently, and give invite revocation, ban/unban, and admin alerts stable effect keys. Do not deduplicate all future activations solely by member ID |
| Bot membership/permission change | Writes an audit event and may send a warning | Duplicate update can create duplicate audit entries and duplicate warning messages | Deduplicate audit by update/effect key and send warning through an outbox with explicit retry semantics |

## Isolated reconciliation contract (not wired into Code.gs)

`tests/telegram-webhook/handler-reconciliation.mjs` and its 15 synthetic tests define the target behavior for exact same-identity link replay and transition-scoped VIP activation keys. In addition, `candidate-link-replay-reconciliation.test.mjs` extracts and executes the current candidate link handlers with mocked sheet/lock services, checking link, access, member, and Application Ref bindings. The VIP ticker/audit effect-key contract remains a pure helper and is not yet wired into all Code.gs handlers. These tests do not establish real Google Apps Script persistence or Telegram API behavior.

## Integration rules

1. Do not mark an update DONE until all required durable business mutations and outbox records have been committed.
2. A replay of a committed one-time Telegram link may return success only when the persisted user ID and chat ID exactly match the original binding. A different identity must remain rejected and audited.
3. Treat user notifications as separate side effects. A successful business mutation does not prove that a Telegram message was delivered exactly once.
4. For join requests, use Telegram's current membership state to reconcile approval/decline before retrying. If state cannot be determined, quarantine for manual review.
5. Every audit/outbox effect must have a stable key derived from the Telegram update ID and effect type. Do not store raw Telegram message bodies in the journal.
6. Keep PII, tokens, webhook secrets, and member documents out of the journal and public logs.

## Release gate

This matrix is a source-review finding list, not proof of runtime behavior. Before integration, wire the tested replay classifier and transition effect keys into the isolated Code.gs candidate; then test each reconciliation branch using mocked spreadsheet and Telegram adapters, and finally test the candidate in a separate Apps Script project, isolated spreadsheet, and Telegram test bot/group. No production handler should be switched to the journal adapter until those tests pass and a separate production migration is explicitly approved.


## Append-only audit/ticker compatibility proposal (not implemented)

The candidate's legacy readers consume the first seven audit columns and first six ticker columns. To avoid breaking those consumers, the proposed migration preserves every existing header and appends one \`Effect Key\` column: audit column 8, ticker column 7. Old rows remain unchanged with blank keys; no historical keys are guessed. New effect rows must persist the deterministic update/effect key in the same row as the event, and check-and-append must be serialized by the same Apps Script script lock.

The contract suite \`tests/telegram-webhook/effect-ledger-migration.test.mjs\` currently passes 20 synthetic tests, including schema mismatch/unknown-column fail-closed cases, duplicate key detection, payload collision quarantine, concurrent append attempts, reactivation-specific keys, and a crash after append before acknowledgement. This is not a real Sheets adapter and does not prove Sheets durability or lock behavior. It has not changed \`Code.gs\`, a spreadsheet, or any live resource. A separate explicit migration function and isolated Apps Script/Spreadsheet runtime test are still required.


## Isolated Apps Script effect-ledger adapter candidate (not integrated)

`tests/telegram-webhook/gas-effect-ledger-adapter.gs` now provides an explicit, isolated \`migrate(kind)\` and keyed \`appendOnce(kind, effectKey, rowValues)\` boundary for the audit and VIP ticker sheets. It requires an explicit spreadsheet ID, never creates a tab, and is not called by webhook handlers. Migration appends only the \`Effect Key\` header (audit col 8; ticker col 7) under ScriptLock. Key lookup and append share that lock. The single-key-column schema detects same-key/different-row payload collisions by comparing the full legacy row payload; the caller must supply deterministic row values for a given key.

The 24-test mocked Apps Script suite covers migration, preservation, schema failures, missing sheets, lock handling, duplicate/malformed keys, concurrent invocation attempts, and interruption/replay after both header and event-row writes. These are mocked-service tests only, not a deployed Google Apps Script runtime or proof of true concurrent execution. No handler wiring, Code.gs change, live spreadsheet migration, Telegram API call, or production change has occurred.



## Per-member update-order guard — revised

Order membership transitions by a durable ingress-assigned `epoch` and canonical decimal Telegram `update_id`, not by event timestamp first. Telegram documents sequential update IDs for restoring out-of-order delivery and a random next ID after at least one week without new updates; updates are retained for no longer than 24 hours. Effect keys include epoch and update ID. Retries reuse the epoch persisted on first receipt.

Keep source dates type-tagged for evidence only: `ChatMemberUpdated.date` is when membership changed; `ChatJoinRequest.date` is when the request was sent. They are not interchangeable activation timestamps. The synthetic model tests stale ordering in both directions, differing source dates, and a lower ID in a later epoch. Durable epoch assignment remains an integration gate.
