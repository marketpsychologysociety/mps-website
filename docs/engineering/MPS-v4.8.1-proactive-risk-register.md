# MPS v4.8.1 — Proactive Risk Register

**Status:** engineering audit notes; not a production change.
**Scope:** isolated Apps Script rebuild, Google Sheets persistence, member authentication/entitlements, Telegram delivery.
**Rule:** do not deploy or run state-changing drills against production. Every remediation must have a regression test and a failure-injection test where practical.

## Priority 0 — must resolve before the first shared Apps Script TEST acceptance run

| ID | Observed condition | Forward failure scenario | Required mitigation | Evidence required |
|---|---|---|---|---|
| AUTH-01 | Member login rate-limits by Member ID using Script Cache. | An attacker repeatedly submits a known victim ID and consumes that ID's allowance, causing a targeted temporary lockout. Cache eviction can also reset counters earlier than intended. | Redesign abuse controls so a third party cannot trivially exhaust a victim's login allowance. Preserve PIN brute-force resistance. Apps Script google.script.run does not expose a trustworthy client IP; do not pretend a client-supplied identifier is a trusted network identity. Evaluate layered controls (short-lived challenge, per-ID failed-attempt telemetry, risk-based friction, and a bounded global safety ceiling) with explicit denial-of-service analysis before choosing implementation. | Tests: wrong PIN, concurrent attempts, attacker targeting another member, successful login does not create an unlimited bypass, cache-miss/eviction behavior, and no plaintext PIN/token persistence. |
| AUTH-02 | Session rows are appended to MPS Sessions; no retention/compaction policy is evident in the inspected path. | Repeated logins accumulate rows indefinitely; row lookup scans the growing sheet, slowing authentication and eventually stressing Sheets quotas. | Define a retention policy for ephemeral session records. Under a script lock, safely prune only revoked/expired sessions older than a conservative retention period; never delete active sessions. Keep security audit events separately. | Tests: active session retained, expired/revoked old session removed, recent revoked session retained, concurrent create/prune serialization, row deletion from bottom upward. |
| ENT-01 | Regular entitlement expiry is checked on access and changes ledger status to Kedaluwarsa; no member-facing renewal flow is evident in the inspected path. | A paid member expires, is denied, but cannot submit/track a renewal cleanly; Admin may manually edit ledger inconsistently. | Design a first-class renewal application/payment path. Preserve existing Member ID, require new QRIS evidence and Admin approval, extend from the later of current expiry or verified payment approval, and write a ledger/audit event atomically. Do not silently reactivate from a client request. | Tests: renew before expiry, after expiry, duplicate payment, rejected payment, concurrent Admin approval, ledger write failure/rollback, no second Member ID. |
| TG-01 | Telegram journal uses processing leases and VIP queue uses retries/stale-processing recovery. | A send succeeds remotely but Apps Script times out before recording success; retry may create a second invite or duplicate notification. Telegram API errors and ambiguous responses need distinct handling. | Reconcile remote state before retrying invite creation; store Telegram invite identifiers/expiry and make delivery state transitions explicit. Never treat a timeout as proof Telegram did not perform the action. Keep retries bounded with backoff and an Admin-visible dead-letter/reconciliation state. | Tests: timeout before send, timeout after remote success, duplicate update, expired invite, stale lease, max retries, dead-letter recovery, and no duplicate active invite. |

## Priority 1 — resolve during the same pre-TEST hardening batch

| ID | Observed condition | Forward failure scenario | Required mitigation | Evidence required |
|---|---|---|---|---|
| OPS-01 | Rate limiting uses a Script Lock around Script Cache read/increment. | High login traffic serializes on one global lock; lock timeout may reject legitimate users. Cache is best-effort storage, not a durable security counter. | Minimize critical section, handle lock contention as a controlled retry response, and document cache best-effort semantics. Do not move to a non-atomic counter. | Concurrency/load tests and injected lock timeout. |
| DATA-01 | Several business flows span multiple Sheets/Drive/Properties services. | Partial writes, ambiguous success, quota errors, or execution timeout can leave cross-sheet state inconsistent. | For every multi-service mutation, define a pre-write snapshot, idempotency key, compensation path, and reconciliation report. Use explicit UNKNOWN/NEEDS_RECONCILIATION when remote outcome cannot be proven. | Failure injection after each external write and after remote success/before local acknowledgement. |
| PRIV-01 | Public/member/Admin projections coexist in one Apps Script backend. | A future endpoint or UI shortcut may expose member-only fields to public callers. | Maintain a deny-by-default endpoint inventory and field allowlists; test unauthenticated, MEMBER, ADMIN, and SUPER_ADMIN access for every API. | Automated endpoint-role matrix and response-field leak assertions. |

## Safe execution boundaries

- Synthetic CI and mocked Apps Script tests are not evidence of Google Apps Script runtime behavior.
- First shared runtime exercise must use a separately provisioned TEST spreadsheet, proof folder, backup folder, Telegram TEST bot, and Telegram TEST group.
- Before any destructive or state-changing TEST case: verify project marker, spreadsheet ID/name, folder IDs/names/privacy, bot username, and group identity. Stop if any check is ambiguous.
- Do not request or log plaintext passwords, PINs, TOTP seeds, bot tokens, webhook secrets, or member proof contents.
- No production deployment, production storage edits, production Telegram calls, or live member-data changes without explicit user authorization.

## Work sequencing

1. Resolve AUTH-01 and AUTH-02 with threat-model review and regression tests.
2. Resolve ENT-01 renewal design and atomic tests.
3. Resolve TG-01 remote-ambiguity/idempotency and bounded retry tests.
4. Re-run the full synthetic suite and browser checks.
5. Only then prepare one controlled Apps Script TEST acceptance session with the user.

## Confidence labels

- **Observed:** directly found in current main source during review.
- **Projected:** plausible failure scenario that must be tested; not claimed to have happened.
- **Unverified:** requires real Apps Script/Drive/Telegram TEST runtime; CI cannot prove it.
