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

## Additional direct-send audit — 13 November 2026

A second read-only pass over every `telegramSendToChat_()` and `sendTelegram_()` call site in `candidates/Code.gs` found the following remaining notification classes. These are deliberately not represented as outbox-complete:

| Notification path | Data classification | Current delivery path | Decision / remaining work |
|---|---|---|---|
| Member PIN issuance and PIN reset | **Secret authentication material** (member ID + PIN) | Direct private Telegram send | Keep out of the generic queue. Design a secret-delivery mechanism with short-lived encrypted payload or reference-based retrieval, strict access controls, expiry, one-time consumption, and audit that never records the PIN. Add failure/retry semantics before changing this path. |
| Admin approval/rejection member notice | Member decision and optional admin note; may contain personal context | Direct private Telegram send | Needs a stable decision/effect identity and a reviewed message-minimization policy. Do not blindly queue free-form admin notes. Separate member-safe templates from internal admin notification content. |
| Admin archive notification | Operational/admin context | Direct admin Telegram send | Review payload for PII and make the decision event idempotent before moving to the generic outbox. |
| VIP invite delivery | **Bearer access credential** (invite URL) | Direct private Telegram send after invite creation | Keep invite URL out of the generic text queue. Use a reference-only durable task and resolve the live invite at send time, or a separately protected encrypted secret store; revoke/expire on failed or ambiguous delivery. |
| Application and legacy Telegram-link confirmation | Generic success text, no token/PIN | Durable SEND_DM task in the existing VIP follow-up queue | Implemented in isolated candidate: stable task key derived from the persisted token hash; queue intent is appended under the verification transaction's already-held ScriptLock (no nested lock); same-identity replay reuses the same task key; Telegram delivery is drained only after lock release. Queue body contains only generic confirmation text and chat target, never the raw token/PIN/invite URL. Queue schema must already be provisioned. |
| Invalid/expired-link and private-chat guidance | Generic operational guidance | Direct private Telegram send | Lower sensitivity, but still needs update-scoped idempotency and a clear policy for webhook retries. May be migrated after the verification confirmation path is made lock-safe. |

### Security boundary

The existing generic follow-up queue stores `Alert Text` in a spreadsheet. That storage model is appropriate only for reviewed non-secret templates and messages. It must not receive raw PINs, one-time verification tokens, invite URLs, webhook secrets, proof documents, or unrestricted admin notes. Hashing a task key does not protect secret text stored in the queue body.

### Verification status

- **Implemented in the isolated candidate on 13 November 2026:** application and legacy one-time-link verification now append the non-secret success-notice intent to the existing durable VIP follow-up queue before releasing the verification ScriptLock. The enqueue helper supports an explicit already-held-lock mode; it does not acquire a nested lock.
- The notification task key is deterministic from the stored token hash (the raw one-time token is not queued). A same-identity replay validates the original Telegram identity plus persisted access/member/application bindings, then ensures the same notification task exists. A different identity or mismatched persisted binding remains rejected and does not enqueue a notice.
- The worker is invoked only after the verification lock is released. The existing worker performs Telegram HTTP outside ScriptLock; ambiguous SEND_DM delivery is quarantined as REVIEW, not blindly retried. Scheduled queue processing remains the recovery path if immediate draining is unavailable.
- The queue sheet must already exist with the exact expected schema. If it is missing or mismatched, enqueue fails and the verification transaction rolls back/fails closed; this dependency must be satisfied by the explicit Super Admin storage-provisioning step before activation.
- Added nine targeted regression tests for both application and legacy links: same-identity replay enqueues one stable notification task; cross-identity and binding-mismatch cases reject; the actual link-notice helper writes to the existing queue under the caller-held ScriptLock without nested acquisition; duplicate task keys remain idempotent; no invite URL is written into the notice row.
- GitHub Actions run **#1817** on candidate head `1f8e49447166e1bf196c5dd0f178ff77de1ce5f2` completed **SUCCESS, 68/68 steps, zero failures**. The targeted one-time-link replay suite passed **9/9**, and Chromium browser checks passed. Run #1813 also passed 68/68 on the immediately preceding code-only head `4a4320e9bb9b9ae63dd6d98d665b1a119bb21f57`.
- These results are CI with isolated/mocked Apps Script services. No live Telegram message, real Google Apps Script runtime, live spreadsheet, or production resource was exercised or changed.
- The other notification classes remain open: protected PIN delivery, member-safe admin approval/rejection notices, admin archive notifications, and protected invite-link delivery/rollback. Do not move secrets or unrestricted admin notes into the generic queue.

