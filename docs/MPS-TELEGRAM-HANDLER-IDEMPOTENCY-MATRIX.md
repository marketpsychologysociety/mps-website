# MPS Telegram handler idempotency audit

**Scope:** read-only source review of the isolated MPS v4.8 Code.gs candidate. No production deployment, spreadsheet, Script Properties, webhook, or Telegram API was changed or exercised.

## Findings

| Update / handler | Current source behavior | Crash-after-effect retry risk | Required reconciliation |
|---|---|---|---|
| Group /start candidate discovery | Writes candidate group ID/title to Script Properties, then sends a group notice | A crash after Telegram accepts the notice but before webhook completion can send the notice again | Store a stable effect key/outbox status; candidate property write is naturally idempotent, notification delivery must be separately deduplicated or accepted as at-least-once |
| Private /start without link | Sends a welcome message | A crash after send but before webhook completion can duplicate the welcome | Use an outbox effect key and delivery status; if Telegram offers no reliable read-back, document at-least-once notification semantics |
| Application Telegram link | Validates a pending one-time link, writes access/application/deposit/link rows, then sends a confirmation | Data mutation is guarded by a pending-link state and script lock, but a crash after commit causes a replay to encounter a non-pending link and report failure instead of recognizing the already-committed same-user result; confirmation can be duplicated | Before rejecting a non-pending link, reconcile the existing link/access rows against the same Telegram user and chat. Return terminal success only for the exact same binding. Track confirmation separately with a stable outbox key |
| Legacy member Telegram link | Consumes a one-time link and writes access/member/application rows under a script lock | Replay after commit sees the link no longer pending and can fail instead of recognizing the already-completed binding | Reconcile consumed link plus matching access row and member identity; never bind a consumed token to a different Telegram user |
| VIP join request | Checks current membership with getChatMember before approving; after failed API response it checks membership again | Membership mutation has useful reconciliation. Welcome DM can still be duplicated after a crash, and remote API ambiguity must not be blindly retried | Preserve membership read-back as the authoritative reconciliation. Track welcome DM in an outbox; ambiguous approve/decline outcomes become REVIEW when read-back cannot establish state |
| VIP chat-member status | Calls updateVipJoinStatus_ with the current Telegram membership status | Membership row assignment is repeatable. However, the helper marks the member Aktif before appending the VIP ticker event and audit row; a crash between those writes means replay sees wasActive=true and can permanently skip the ticker/audit event. Invite revocation and admin alerts are also separate effects | Use a durable pending effect/outbox record before marking the transition complete; reconcile ticker and audit publication independently, and give invite revocation/admin alerts stable effect keys |
| Bot membership/permission change | Writes an audit event and may send a warning | Duplicate update can create duplicate audit entries and duplicate warning messages | Deduplicate audit by update/effect key and send warning through an outbox with explicit retry semantics |

## Integration rules

1. Do not mark an update DONE until all required durable business mutations and outbox records have been committed.
2. A replay of a committed one-time Telegram link may return success only when the persisted user ID and chat ID exactly match the original binding. A different identity must remain rejected and audited.
3. Treat user notifications as separate side effects. A successful business mutation does not prove that a Telegram message was delivered exactly once.
4. For join requests, use Telegram's current membership state to reconcile approval/decline before retrying. If state cannot be determined, quarantine for manual review.
5. Every audit/outbox effect must have a stable key derived from the Telegram update ID and effect type. Do not store raw Telegram message bodies in the journal.
6. Keep PII, tokens, webhook secrets, and member documents out of the journal and public logs.

## Release gate

This matrix is a source-review finding list, not proof of runtime behavior. Before integration, implement and test each reconciliation branch using mocked spreadsheet and Telegram adapters, then test the candidate in a separate Apps Script project, isolated spreadsheet, and Telegram test bot/group. No production handler should be switched to the journal adapter until those tests pass and a separate production migration is explicitly approved.
