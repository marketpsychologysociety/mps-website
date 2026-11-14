# MPS Telegram effect-ledger integration plan

**Status:** historical source-review plan with current candidate integration reconciliation in Section 9. Sections 1–7 preserve the original risks and acceptance design; they are not a statement that the current VIP `chat_member` integration is absent. The current Code.gs candidate wires that path to the scoped effect ledger and follow-up queue. No live spreadsheet, Apps Script deployment, Telegram bot, Script Properties, or production resource was accessed.

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


## 8. Ingress epoch allocation contract

The per-member ordering model requires an epoch that is assigned once at ingress, not inferred again during retries. The pure contract in `tests/telegram-webhook/update-epoch.mjs` uses the last durably recorded ingress receipt time: a new receipt less than seven days later stays in the current local epoch; a receipt at or beyond seven idle days increments the local epoch once. This local epoch boundary is an ordering namespace, not a claim that Telegram's internal reset happened at that exact moment.

The caller must execute epoch allocation, update-journal append, and global stream-state write under the same ScriptLock critical section. Store both `epoch` and `receivedAt` on the update journal row. A retry/reconciliation must read and reuse that stored epoch; it must never allocate a new epoch from its retry time. If the ingress clock moves backward, state is malformed, or epoch assignment cannot be persisted, fail closed and do not run the VIP handler.

The local idle boundary is intentionally conservative. Telegram retains incoming updates for no longer than 24 hours, and documents a random next update ID after at least one week without new updates. A webhook/Apps Script outage may cause a local epoch increment even if Telegram's IDs continued sequentially during the outage; this remains safe for ordering if all newly delivered backlog updates are assigned to the same local epoch and compared by update ID. The adapter integration must test backlog delivery, retries, and process restart before use.

## 9. Candidate integration status reconciliation — 2026-11-13

**Important:** Sections 1–7 above record the earlier source-review state and must not be read as a description of the current workbench head. The isolated candidate has since been changed and the integration is now present in `candidates/Code.gs`.

Verified by reading the current workbench candidate source and matching integration/runtime test files:

- `processTelegramUpdateCore_` passes the complete original Telegram update and `chat_member` event to `processMpsVipChatMemberEvent_(update, memberUpdate)`. The handler requires the original `update_id`, source event date, old/new membership state, and hashes the original event.
- `createMpsGasVipChatMemberHandler_` derives the membership transition from `old_chat_member` and `new_chat_member`; unchanged membership and unknown states are ignored. It sends the update into the transition orchestrator with a deterministic ordering epoch and source timestamp.
- `createMpsGasVipTransitionOrchestrator_` requires `ledger.runExclusive()`. It uses the ledger's scoped transaction object for intent/cursor writes, status-writer calls, and keyed ticker/audit appends. The adapter's `runExclusive` acquires one ScriptLock and exposes a scoped API that does not acquire a nested lock; direct nested lock acquisition is explicitly rejected.
- Each immutable transition intent has a key `telegram:<epoch>:<update_id>:vip_transition`, a payload hash, source timestamp, member/Telegram identity binding, target state, and separate ticker/audit effect keys. Replays validate the immutable event binding; completed intents return duplicate, stale events are superseded, and same-key/different-payload collisions fail closed.
- Ticker/audit payload timestamps are derived from the Telegram source event time and the ticker event ID is deterministic from the transition key. A keyed append with a different payload returns a collision outcome that the orchestrator turns into an error rather than silently accepting it.
- The status writer updates the VIP Access and Database Member records inside the same scoped lock ownership boundary. Follow-up cache invalidation and Telegram queue processing occur after the transition orchestrator returns; the durable follow-up queue worker performs Telegram HTTP calls outside ScriptLock.
- The effect-ledger adapter remains append-only and requires an explicit spreadsheet ID and pre-existing exact schemas. The Super Admin provisioning path performs explicit schema preflight/migration; no migration or provisioning is run automatically.

Candidate test evidence currently recorded in PR #12 includes:
- Candidate chat-member integration and failure/replay contract coverage.
- Candidate end-to-end isolated Apps Script-like V8 runtime tests extracted from the actual Code.gs source, with mocked SpreadsheetApp, LockService, PropertiesService, and CacheService.
- Effect-ledger adapter tests for schema migration, idempotent append, key collision, lock contention/ownership, interrupted writes, and replay.
- Latest relevant CI run on the documentation head is tracked separately in the PR/checklist; CI is not evidence of execution in Google's hosted Apps Script runtime.

### Remaining limitations — still open

- No real isolated Google Apps Script project or separate Google spreadsheet has been provisioned/executed from this chat. Actual ScriptLock semantics, Spreadsheet flush/persistence, Apps Script execution interruption, quotas, latency, permissions, and Drive/Sheets ACLs remain unverified.
- The Sheets status writes, intent/cursor writes, and keyed effect appends share one lock but are not a native multi-row database transaction. Recovery relies on durable intent states and replay; the real-runtime interruption matrix must still be exercised.
- The generic webhook update-level cache key in `processTelegramUpdateCore_` remains unset (`updateKey = ''`). VIP `chat_member` idempotency is handled by the durable transition intent/cursor/effect ledger, but this does not establish general exactly-once processing for every Telegram update type.
- Join-request approval/welcome messaging, private bot commands, and bot permission alerts are not all protected by the VIP transition effect ledger. Their delivery/reconciliation semantics must not be described as exactly-once.
- Public/Admin ticker projection is Member-ID-only, but the restricted internal legacy ticker schema may still contain a historical Member Name field. The public projection does not expose that field.
- No production webhook, production spreadsheet, member rows, Script Properties, Telegram bot, or trigger has been changed or provisioned. Draft PR #12 remains NO-GO for merge/deploy.

This section supersedes the earlier statements in Sections 1–7 that the Code.gs integration had not yet been implemented. The earlier hazard analysis remains useful as the rationale for the scoped-lock design, not as a claim that the current candidate still has the old nested-lock call structure.
