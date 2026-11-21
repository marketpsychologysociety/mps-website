# MPS v4.8.1 — Proactive Risk Register

**Status:** engineering audit and remediation record; not a production change.
**Scope:** isolated Apps Script rebuild, Google Sheets persistence, member authentication/entitlements, Telegram delivery.
**Rule:** do not deploy or run state-changing drills against production. Every remediation must have regression tests and failure injection where practical.

## Priority 0 — resolve before shared Apps Script TEST acceptance

| ID | Observed condition | Forward failure scenario | Mitigation / current state | Evidence still required |
|---|---|---|---|---|
| AUTH-01 | The original member-login throttle ran before PIN verification and keyed the counter by Member ID. | Anyone who knows a Member ID could spend the member's 8 attempts per 15 minutes and temporarily lock out the legitimate member. Cache eviction could also reset the counter. | **Implemented in source:** count only failed PIN comparisons. A correct PIN bypasses the failure throttle, so an attacker cannot block a legitimate login merely by exhausting the wrong-PIN allowance. Keep the atomic ScriptLock around the cache increment. The limit remains 8 failed checks per Member ID per 15 minutes. CacheService is best-effort, so eviction can reset the counter; do not describe this as durable. | Synthetic tests cover 8 wrong PINs, 9th wrong PIN throttling, correct PIN success after the bucket is exhausted, successful login not consuming attempts, malformed input, and lock acquire/release. Shared TEST still needs concurrent wrong-PIN load, cache behavior under pressure, and valid-login checks while failures are saturated. |
| AUTH-02 | Session rows are appended to MPS Sessions; no retention/compaction policy existed. | Repeated logins accumulate rows indefinitely, slowing lookup and stressing Sheets quotas. Deleting rows could shift row indexes while concurrent session checks are in flight. | **Implemented in source:** once per 24 hours, during session creation while ScriptLock is held, clear only sessions expired or revoked for at least 30 days. Clear cell contents instead of deleting sheet rows, preserving row indexes. Active, recent, and malformed records are retained. Cleanup failure is logged and deferred without blocking login. | Synthetic tests cover active/recent/malformed retention, 30-day boundary, stable row indexes, daily cadence, cleanup failure, and lock placement. Shared TEST must confirm Apps Script Range.clearContent behavior and execution time with realistic session-row volume. |
| ENT-01 | Regular entitlement expiry changes ledger status to Kedaluwarsa; no member-facing renewal flow is evident in the inspected path. | A paid member expires, is denied, but cannot submit/track renewal cleanly; Admin may manually edit ledger inconsistently. | Design a first-class renewal application/payment path. Preserve Member ID, require new QRIS evidence and Admin approval, extend from the later of current expiry or verified approval, and write ledger/audit atomically. Do not silently reactivate from a client request. | Tests: renew before/after expiry, duplicate/rejected payment, concurrent Admin approval, ledger failure/rollback, no second Member ID. |
| TG-01 | Telegram journal uses processing leases and VIP queue uses retries/stale-processing recovery. | A Telegram send may succeed remotely but Apps Script time out before local acknowledgement; retry may duplicate an invite or notification. | Reconcile remote state before retrying invite creation; persist Telegram invite identifiers/expiry and explicit state transitions. Treat timeout as ambiguous, not proof of failure. Keep retries bounded with backoff and Admin-visible dead-letter/reconciliation state. | Tests: timeout before/after remote success, duplicate update, expired invite, stale lease, max retries, dead-letter recovery, no duplicate active invite. |

## Priority 1 — resolve during pre-TEST hardening

| ID | Observed condition | Forward failure scenario | Mitigation / evidence |
|---|---|---|---|
| OPS-01 | Rate limiting uses ScriptLock around Script Cache read/increment. | High traffic serializes on one global lock; lock timeout may reject legitimate users. Cache is best-effort, not durable. | Keep the critical section small; test lock timeout and concurrent wrong-PIN attempts. Document CacheService eviction semantics. Never trust client-supplied IP/device identifiers as network identity. |
| DATA-01 | Several business flows span Sheets, Drive, and Script Properties. | Partial writes, ambiguous success, quotas, or timeouts can leave cross-service state inconsistent. | For every multi-service mutation, define snapshots, idempotency, compensation, and explicit UNKNOWN/NEEDS_RECONCILIATION. Inject failure after each external write and after remote success/before local acknowledgement. |
| PRIV-01 | Public/member/Admin projections coexist in one Apps Script backend. | A future endpoint or UI shortcut may expose member-only fields to public callers. | Maintain deny-by-default endpoint inventory and field allowlists; test unauthenticated, MEMBER, ADMIN, and SUPER_ADMIN access and response-field leaks. |

## Safe execution boundaries

- Synthetic CI and mocked Apps Script tests are not evidence of Google Apps Script runtime behavior.
- First shared runtime exercise must use a separately provisioned TEST spreadsheet, proof folder, backup folder, Telegram TEST bot, and Telegram TEST group.
- Before any destructive or state-changing TEST case, verify project marker, spreadsheet ID/name, folder IDs/names/privacy, bot username, and group identity. Stop if any check is ambiguous.
- Do not request or log plaintext passwords, PINs, TOTP seeds, bot tokens, webhook secrets, or member proof contents.
- No production deployment, production storage edits, production Telegram calls, or live member-data changes without explicit user authorization.

## Work sequencing

1. Complete AUTH-01/AUTH-02 synthetic remediation and inspect the full workflow.
2. Resolve ENT-01 renewal lifecycle and atomic tests.
3. Resolve TG-01 remote ambiguity, idempotency, and bounded retries.
4. Complete full synthetic suite and browser checks.
5. Only then prepare one controlled Apps Script TEST acceptance session.

## Confidence labels

- **Observed:** directly found in source during review.
- **Implemented in source:** code change exists and synthetic tests pass; Apps Script runtime acceptance is still pending.
- **Projected:** plausible failure scenario that must be tested; not claimed to have happened.
- **Unverified:** requires real Apps Script/Drive/Telegram TEST runtime; CI cannot prove it.
