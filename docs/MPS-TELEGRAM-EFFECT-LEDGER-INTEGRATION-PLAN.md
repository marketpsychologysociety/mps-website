# MPS Telegram effect-ledger integration plan

**Status:** source-review plan only. The isolated Code.gs candidate was read without modification. The effect-ledger adapter is a mocked Apps Script candidate and is not connected to any webhook handler. No live spreadsheet, Apps Script deployment, Telegram bot, Script Properties, or production resource was accessed.

## 1. Source integration points

The current isolated Code.gs candidate has these relevant call sites:

- processTelegramUpdateCore_(update) reads update.update_id, but does not propagate it to the business-effect helpers. It currently initializes updateKey as an empty string.
- processTelegramUpdateCore_ calls processVipJoinRequest_(update.chat_join_request) without the update ID.
- The chat_member branch calls updateVipJoinStatus_(userId, status, isMember) without the update ID or the old membership state.
- processVipJoinRequest_ calls updateVipJoinStatus_ in its getChatMember reconciliation path and after a successful approval. Those calls also omit the update ID.
- updateVipJoinStatus_ changes the access/member rows while holding LockService.getScriptLock(). Before releasing that lock, it calls recordMpsVipTickerEvent_ and recordMpsAudit_ for a first activation.
- recordMpsVipTickerEvent_ currently appends a random UUID event ID and six legacy fields using appendRow.
- recordMpsAudit_ appends seven legacy fields, catches and logs every write error, and trims old rows after 2,001 rows.
- getMpsContentSheet_ validates the original leading headers; readMpsContentRows_ reads only the declared legacy width. Public ticker projection likewise reads the original six columns. Those readers can remain compatible with an appended final key column if the migration preserves the leading columns.

## 2. Critical lock-boundary constraint

The candidate adapter's public migrate() and appendOnce() methods each acquire LockService.getScriptLock() themselves.

Calling appendOnce() from the current updateVipJoinStatus_ critical section would try to acquire the same script lock recursively. Apps Script script locks are not re-entrant; this can time out or fail. Do not wire the adapter into the current nested call structure.

Before integration, choose and test one lock ownership model:

1. Refactor the member/access transition so one outer withLock-style operation owns the lock and invokes an explicitly lock-scoped ledger transaction API that does not acquire a second lock; or
2. Commit the member/access state under the lock, release it, then append the deterministic keyed effects outside it. This second option is safe only if replay derives the required effects from the Telegram update itself (not solely from the now-updated wasActive database flag), and the effect append is idempotent by update/effect key.

Do not add an undocumented appendOnceUnlocked call or expose an unsafe lock-bypass method without a clear ownership contract and tests.

## 3. Update-ID and activation-transition propagation

A future integration should pass the exact update_id through every path:

- processTelegramUpdateCore_(update) → processVipJoinRequest_(request, updateId);
- processTelegramUpdateCore_(update) → updateVipJoinStatus_(..., updateId, transitionContext);
- every updateVipJoinStatus_ call inside processVipJoinRequest_ must carry the same update ID and effect context.

For chat_member, use Telegram's old_chat_member and new_chat_member states to derive whether the update is an actual non-member → member transition. Do not infer that transition only from the current database wasActive flag: after a crash between the status write and effect append, a replay sees the new active status and would otherwise skip the missing effect.

Use stable update-scoped keys that include the durable ingress epoch and update ID, with separate types for ticker and audit, e.g. telegram:<epoch>:<update_id>:vip_ticker_event and telegram:<epoch>:<update_id>:vip_join_audit. Telegram documents sequential update IDs for restoring out-of-order delivery, but a new ID is chosen randomly after at least one week without updates. Persist the epoch on first receipt; retries reuse it. A later genuine leave/rejoin has a distinct update ID (or epoch+ID) and therefore a new key. Repeated delivery of the same update reuses the same key.

## 4. Deterministic row payload requirement

The adapter schema stores one Effect Key column rather than a separate payload digest. It therefore detects a key collision by comparing the full legacy row payload exactly. For the same key, all legacy fields must be stable across replay.

- Do not generate a fresh random ticker Event ID on retry. Derive a deterministic event ID from the effect key.
- Do not use new Date() at retry time for Created At or audit Timestamp. Derive the event timestamp from the Telegram update's event timestamp, or persist the first-attempt timestamp durably before any retry can occur.
- Keep member ID, display name, action, result, and details deterministic and privacy-filtered.
- A same-key/different-row result must become a visible REVIEW condition. It must not be silently treated as success or appended as a second event.

## 5. Required changes to error and retention semantics

recordMpsAudit_ currently catches all failures and returns no structured result. A required idempotency effect cannot rely on a helper that silently converts an append failure into a console log. The integration must return an explicit outcome and ensure a failed required effect is retried or quarantined according to the update journal contract.

The audit writer also deletes rows beyond a 2,001-row cap. Because the effect key is stored in the same row, deletion removes the deduplication evidence too. Before retaining this cap, define an archive/retention policy that preserves effect-key uniqueness for the full replay/redelivery horizon; otherwise, do not prune keyed rows in a way that permits an old update to append again.

The ticker/audit key ledger does not make the member status write and two effect writes a database transaction. Recovery must be able to discover and complete missing keyed effects after the member row has already changed.

## 6. Effects not covered by the audit/ticker ledger

This adapter only deduplicates local audit/ticker row appends. It does not provide exactly-once delivery for:

- Telegram welcome DMs and group notices;
- invite-link revocation;
- ban/unban moderation actions;
- admin alerts.

Those require their own effect keys, outbox/reconciliation rules, and explicit handling of ambiguous Telegram API outcomes. Do not imply that the audit/ticker key column protects these external effects.

## 7. Integration acceptance tests before Code.gs changes

The isolated integration suite should include, at minimum:

1. Update ID propagation through chat-member and join-request paths.
2. One successful activation writes one ticker row and one audit row.
3. Replay of the same update repairs a missing effect without duplicating an already-appended effect.
4. A real leave/rejoin with a new update ID creates a new ticker event.
5. A same-key/different-payload collision enters REVIEW.
6. Crash after access/member status mutation but before ticker append.
7. Crash after ticker append but before audit append.
8. Crash after audit append but before update completion.
9. Lock ownership tests proving there is no nested ScriptLock acquisition.
10. Legacy readers still parse the first six/seven columns after migration.
11. Audit retention does not silently discard keys inside the required replay horizon.
12. Required audit failures are surfaced to the caller rather than swallowed.

Only after these tests pass should the isolated Code.gs candidate be changed. The real Apps Script project and spreadsheet acceptance drill remains a separate gate. Production migration, webhook changes, merge, and deployment each require their own explicit approval.
