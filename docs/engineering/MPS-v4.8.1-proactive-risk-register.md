# MPS v4.8.1 — Proactive Risk Register

**Status:** engineering audit and remediation record; not a production change.
**Scope:** isolated Apps Script rebuild, Google Sheets persistence, member authentication/entitlements, Telegram delivery.
**Rule:** do not deploy or run state-changing drills against production. Every remediation must have regression tests and failure injection where practical.

## Priority 0 — resolve before shared Apps Script TEST acceptance

| ID | Observed condition | Forward failure scenario | Mitigation / current state | Evidence still required |
|---|---|---|---|---|
| AUTH-01 | The original member-login throttle ran before PIN verification and keyed the counter by Member ID. | Anyone who knows a Member ID could spend the member's 8 attempts per 15 minutes and temporarily lock out the legitimate member. Cache eviction could also reset the counter. | **Implemented in source:** count only failed PIN comparisons. A correct PIN bypasses the failure throttle, so an attacker cannot block a legitimate login merely by exhausting the wrong-PIN allowance. Keep the atomic ScriptLock around the cache increment. The limit remains 8 failed checks per Member ID per 15 minutes. CacheService is best-effort, so eviction can reset the counter; do not describe this as durable. | Synthetic tests cover 8 wrong PINs, 9th wrong PIN throttling, correct PIN success after the bucket is exhausted, successful login not consuming attempts, malformed input, and lock acquire/release. Shared TEST still needs concurrent wrong-PIN load, cache behavior under pressure, and valid-login checks while failures are saturated. |
| AUTH-02 | Session rows are appended to MPS Sessions; no retention/compaction policy existed. | Repeated logins accumulate rows indefinitely, slowing lookup and stressing Sheets quotas. Deleting rows could shift row indexes while concurrent session checks are in flight. | **Implemented in source:** once per 24 hours, during session creation while ScriptLock is held, clear only sessions expired or revoked for at least 30 days. Clear cell contents instead of deleting sheet rows, preserving row indexes. Active, recent, and malformed records are retained. Cleanup failure is logged and deferred without blocking login. | Synthetic tests cover active/recent/malformed retention, 30-day boundary, stable row indexes, daily cadence, cleanup failure, and lock placement. Shared TEST must confirm Apps Script Range.clearContent behavior and execution time with realistic session-row volume. |
| ENT-01 | Expired Regular members were denied login before they could submit a renewal. | Member loses access and has no self-service path; Admin could be forced into manual ledger edits or accidentally issue another Member ID. | **Implemented in source:** expired Regular members with valid PIN receive a renewal-only session. Member content APIs continue enforcing active entitlement. Member renewal uses fixed Rp100,000 QRIS, private proof storage, rate limit, duplicate-pending guard, and server-bound member identity. Admin approval/rejection is atomic; approval preserves Member ID and extends 30 days from the later of current expiry or approval time. Active IB is excluded. | Synthetic CI covers early/late period arithmetic, session/role gates, amount/file checks, duplicate prevention, proof privacy, ambiguous append reconciliation, Admin rollback contract and UI wiring. Apps Script TEST must verify actual Drive/Sheets behavior, concurrent Admin review, and end-to-end reactivation. |
| TG-01 | VIP invite creation, Telegram message delivery, and join approval are remote side effects spanning Bot API and Sheets; journal stale-processing could replay uncertain work. | Telegram may accept an invite/message/approval but the Apps Script execution times out before storing its acknowledgement. Blind retry can create orphan/duplicate invites, resend messages, or repeat join approvals. | **Implemented in source:** persist invite link and delivery phase before sending; classify network/parse/5xx as ambiguous; move to NEEDS_RECONCILIATION or DELIVERY_UNKNOWN without automatic revoke/resend. Stale in-flight work is quarantined; reissue only after the 48-hour invite lifetime. Definite retries use exponential backoff and a five-attempt DEAD_LETTER ceiling. Confirmed deliveries are not revoked due to audit failure. Join approval checks getChatMember before/after ambiguous responses. Stale/legacy journal outcomes are quarantined rather than blindly replayed. Admin has a safe queue status view. | Synthetic CI covers invite/send/revoke timeout classes, 4xx vs 5xx, stale phases, 48-hour recovery, backoff/dead-letter, join approval reconciliation, journal redelivery guard, and Admin status projection. Dedicated TEST bot/group acceptance must still exercise real timeout/retry behavior and inspect queue state; no live Telegram test has been performed. |

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

1. AUTH-01/AUTH-02: source remediation and synthetic CI complete; runtime acceptance pending.
2. ENT-01: renewal lifecycle source remediation and synthetic CI complete; runtime acceptance pending.
3. TG-01: remote ambiguity, idempotency, bounded retries and synthetic CI complete; runtime acceptance pending.
4. Complete full synthetic suite and browser checks for the latest combined HEAD.
5. Only then prepare one controlled Apps Script TEST acceptance session.

## Confidence labels

- **Observed:** directly found in source during review.
- **Implemented in source:** code change exists and synthetic tests pass; Apps Script runtime acceptance is still pending.
- **Projected:** plausible failure scenario that must be tested; not claimed to have happened.
- **Unverified:** requires real Apps Script/Drive/Telegram TEST runtime; CI cannot prove it.
