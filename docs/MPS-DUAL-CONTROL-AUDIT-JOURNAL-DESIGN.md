# MPS v4.8 — Dual Control & Tamper-Evident Audit Design

**Status:** Source-reconciled design review — isolated workbench only  
**Date:** 2026-11-11  
**Reviewed artifact:** Reconstructed candidate `Code.gs`, SHA-256 `c9e84512fc2ac641f59f63b9b8b7fa10d113f0256f662c25ca70555a09aea8ba` (manifest-matched local source).  
**Production boundary:** Read-only source inspection and documentation only. No Apps Script, spreadsheet, Drive, Cloud project, identity provider, credentials, or deployment was changed.

## 1. Executive decision

**The current candidate cannot safely support independent two-person approval.** It has role separation (ADMIN vs SUPER_ADMIN), but not person-level identity separation. The existing login creates `actorId` from the role name (`ADMIN` or `SUPER_ADMIN`), so multiple people using the same role credential are indistinguishable. A second approval cannot be considered independent merely because two browser sessions or two role labels exist.

**The existing audit log is operational history, not tamper-evident evidence.** It catches and suppresses write failures, and it deletes older rows after a size threshold. Official draw operations must not depend on it as the authoritative journal.

No official roulette or Winner Board backend should be implemented until identity, durable journaling, independent review, and recovery gates are met.

## 2. Candidate source findings (verified by direct source inspection)

### 2.1 Authentication and actor identity

- `apiAdminLogin()` accepts one Script Property token per role: `MPS_ADMIN_TOKEN` or `MPS_SUPER_ADMIN_TOKEN`.
- The session stores `role`, `actorId: role`, and a hash of the role credential.
- `getAdminSession_()` returns the role and actor reference from the cached session after comparing the credential hash with the current role token.
- `requireSuperAdmin_()` enforces a Super Admin role, but it does not prove which natural person is operating the session.
- The current Admin and Super Admin credentials must be different, but two people sharing one role token still have the same actor identity.

**Conclusion:** role authorization is present; individual accountability and two-person independence are not.

### 2.2 Audit implementation

The candidate's `MPS Audit Logs` headers are:

`Timestamp, Actor Role, Actor Ref, Action, Target Ref, Result, Details`

The existing `recordMpsAudit_()`:
- appends a row to the spreadsheet;
- catches any write error and logs a console error instead of propagating failure;
- deletes older rows when the sheet exceeds 2,001 rows.

`apiAdminGetAuditLogs()` reads this sheet as a Super Admin view. This is useful for routine operations but insufficient for official prize evidence: a missing row does not block the operation, old evidence is intentionally deleted, and a spreadsheet editor can alter the same store.

### 2.3 Concurrency and persistence

- The candidate uses `LockService.getScriptLock()` in selected write paths and in rate limiting.
- `upsertMpsContentRow_()` serializes its own upsert, but the candidate has no draw-specific transaction journal or state recovery protocol.
- `getMpsContentSheet_()` can create a missing sheet when called with `createIfMissing=true`; official draw setup must not create or migrate resources implicitly during an ordinary API request.
- `CacheService` is used for sessions and rate limits. It is not a durable audit or idempotency store.
- Spreadsheet operations can partially succeed. A lock prevents cooperating script executions from entering a protected section concurrently; it does not make a sequence of spreadsheet/Drive/API operations atomic, nor prevent direct edits by a spreadsheet owner/editor.

### 2.4 Source verification boundaries

This review is based on the manifest-matched reconstructed candidate source. The manifest and source header explicitly describe a reconstruction. It has not been reconciled against the exact active Apps Script deployment. Findings therefore apply to this candidate, not a claim about the live deployment.

## 3. Person-level identity design

### 3.1 Required actor identity

Every privileged operation must record an immutable, server-verified actor subject:
- `actor_subject`: stable opaque identifier from a trusted identity provider;
- `actor_display`: optional minimal display label for the private audit UI;
- `auth_issuer`: trusted issuer;
- `auth_method`: authentication method / assurance level;
- `authenticated_at` and `session_id_hash`;
- `role_at_action`: role snapshot at the time of the operation.

Never accept `actor_subject`, role, approval identity, or authentication assurance from a browser payload as authoritative. Derive them only from a verified server-side session/token.

### 3.2 Preferred authentication direction

Preferred for a future privileged draw console: an individually authenticated identity provider with:
- unique account per human; no shared credentials;
- strong MFA / step-up authentication for freeze, approve, execute, verify, publish, cancel, and prize handover;
- short-lived signed identity assertions;
- server-side verification of signature, issuer, audience, expiry, nonce/state, and stable subject;
- an explicit server-managed allowlist mapping subjects to permitted roles;
- revocation and session invalidation;
- audit records for role grants/revocations.

A Google Workspace identity model may be evaluated if the project can restrict access to the correct domain and verify the caller identity reliably under the chosen Apps Script deployment mode. Do not assume `Session.getActiveUser().getEmail()` is always available: the current candidate is documented as a web app executing as its owner and accessible to Anyone, so identity behavior and deployment semantics must be tested before relying on it.

Alternative: a maintained external OIDC provider with verified ID tokens and individually assigned accounts. Do not invent a custom password scheme or store plaintext per-person passwords in Script Properties.

**Not acceptable:** two role passwords shared by multiple operators, client-supplied names/emails, two sessions under one identity, or two clicks from the same authenticated person.

### 3.3 Separation-of-duties policy

For each official draw:
- Operator A creates the event, publishes rules, prepares the eligibility criteria, and requests freeze.
- Reviewer B independently reviews the rules/cutoff and approves freeze. B must be a different stable identity subject.
- The backend freezes the roster and records the commitment.
- Operator A may request execution only after the required freeze approval and the committed future beacon round are recorded.
- A separate reviewer (preferably B or another authorized reviewer) verifies the proof and approves publication.
- The person who prepared or modified the roster cannot approve that same roster.
- The person who executed the draw cannot be the sole verifier of the result.
- For a one-person organization, the official draw remains disabled; do not simulate dual control with two accounts controlled by the same person.

Each approval is bound to the exact event ID, expected version, rules hash, snapshot hash, participant count, protocol version, beacon chain hash, and precommitted round. Any change invalidates the approval.

## 4. Durable draw journal

### 4.1 Do not extend the ordinary audit sheet into the sole source of truth

Keep the existing MPS audit sheet for ordinary administrative activity. It may receive a summary reference to a draw operation, but it must not be the sole authoritative journal.

A separate draw journal must be pre-provisioned in an isolated test environment and contain append-only operation records:
- operation ID and idempotency-key hash;
- event ID, draw ID, expected version;
- operation type and previous/current state;
- actor subject, role, authentication assurance;
- request timestamp and server timestamp;
- rules hash, snapshot hash, participant count;
- committed beacon chain/round;
- proof artifact digest and verifier build/version;
- outcome, failure code, retry/reconciliation reference;
- previous journal record hash and current record hash.

Never place participant names, contact details, full Member IDs, PINs, credentials, secret entropy, or private proof files in the journal.

### 4.2 Write protocol

For each sensitive operation:
1. Authenticate and authorize the actor; check role, MFA age, and separation-of-duties policy.
2. Acquire the script-wide lock with a bounded timeout.
3. Re-read the event and journal state from durable storage; validate expected version and legal transition.
4. Search for the idempotency key in durable storage. If already completed, return the stored outcome; if pending, return the existing operation state. Never start a second operation.
5. Append a write-intent record with a unique operation ID and a canonical request digest.
6. Read back the intent and verify all critical fields.
7. Perform the single logical state change or external action.
8. Read back the result/state and verify it against the expected operation.
9. Append a completion record linked to the intent, including the result digest.
10. Read back and verify the completion record before releasing the lock and returning success.

If any write, read-back, audit acknowledgement, or external result is ambiguous, mark the operation `RECONCILIATION_REQUIRED` if that write can be confirmed. If even that state cannot be durably recorded, block all subsequent draw actions and require manual reconciliation against the independent journal. Do not claim success to the UI.

A lock timeout must fail closed. A retry must resume/reconcile the same operation ID, not generate a new draw.

### 4.3 Hash chain limitations

A record hash can be defined as:

`record_hash = SHA256(canonical_record_without_hash || previous_record_hash)`

The canonical encoding, field order, character normalization, timestamp format, and hash algorithm must be versioned. The chain detects accidental or unsophisticated modification only when a trusted checkpoint exists elsewhere. An administrator who can rewrite the entire spreadsheet and recompute every hash can forge a spreadsheet-only chain.

Therefore:
- periodically anchor the latest journal hash in a separately permissioned external store;
- keep the external store in a separate project/account boundary from the MPS spreadsheet editor group;
- use create-only writer permissions for the app identity and read/verification permissions for reviewers;
- monitor failed writes, object deletion attempts, policy changes, and access-policy changes;
- periodically export and independently verify the full journal chain.

### 4.4 External retention option — Cloud Storage

A dedicated Google Cloud Storage bucket with retention policy and, after careful review, Bucket Lock is a possible immutable evidence destination. Google's documentation states that locking the retention policy is irreversible: it cannot be removed or shortened, and the bucket cannot be deleted until retained objects expire. This is a serious governance and cost decision, not a default toggle.

Do not create a bucket, enable retention, or lock a policy as part of this work. First define retention duration, privacy/data minimization, legal obligations, cost, ownership, recovery, and who controls the Cloud project. A separate append-only evidence provider may also be evaluated.

## 5. State machine and approval matrix

| Transition | Initiator | Required independent approval | Evidence |
|---|---|---|---|
| Create event / edit draft | Operator | Not required | Actor, event version |
| Publish rules / eligibility cutoff | Operator | Reviewer | Rules hash, cutoff, reviewer |
| Freeze participant snapshot | Operator | Reviewer distinct from preparer | Snapshot hash, count, policy version |
| Commit future beacon round | Backend after freeze | Reviewer confirms round binding | Chain hash, round, timestamp |
| Execute draw | Authorized operator | Freeze approval already valid | Idempotency, beacon proof, result digest |
| Verify result | Independent reviewer | Must not be executor | Verifier build, signature status, recomputed index |
| Publish Winner Board | Publisher | Independent publication approval | Public projection hash, approval |
| Cancel / void | Operator | Independent reviewer | Prepublished policy, reason, immutable history |
| Confirm prize handover | Verifier | Separate review where practical | Minimal claim reference, timestamp |

All approvals expire when the bound event version, rules, roster, snapshot hash, beacon round, chain, or protocol changes.

## 6. Failure and recovery policy

| Failure | Required behavior |
|---|---|
| Same person tries to approve own work | Reject; record security event |
| Second identity missing/unavailable | Pause; no bypass |
| Shared role token or actor subject equals operator | Reject |
| Duplicate request / browser retry | Return same durable operation outcome |
| ScriptLock timeout | Fail closed; retry same operation ID only |
| Journal write/read-back failure | Block state transition and publication |
| Partial spreadsheet write | Reconcile from journal; do not rerun |
| External evidence store unavailable | Do not execute/publish official draw |
| Hash-chain mismatch | Freeze event; preserve evidence; security review |
| Actor disabled / role revoked | Reject new action; invalidate active sessions |
| Stale approval/version | Invalidate and require fresh review |
| Audit store retention/permission changed | Alert; pause official draw workflow |
| Winner identity masking unsafe | Publish generic message without identifier |

No rollback may erase an already recorded draw outcome. A correction, cancellation, or void must be a new append-only event referencing the original record.

## 7. Proposed logical schemas

### DrawOperation
`operation_id, event_id, draw_id, action, idempotency_key_hash, expected_version, state_before, state_after, request_digest, result_digest, actor_subject, actor_role, auth_issuer, auth_method, authenticated_at, created_at, completed_at, failure_code, previous_record_hash, record_hash`

### DrawApproval
`approval_id, event_id, event_version, approval_type, rules_hash, snapshot_hash, participant_count, protocol_version, beacon_chain_hash, beacon_round, approver_subject, approver_role, auth_assurance, approved_at, expires_at, status, approval_digest`

### DrawJournalAnchor
`anchor_id, journal_sequence, latest_record_hash, external_object_ref, anchored_at, anchor_status, verifier_ref`

### SecurityEvent
`security_event_id, event_type, actor_subject, target_ref, timestamp, severity, request_digest, outcome`

These are logical schemas only. Do not create physical sheets, folders, buckets, or properties before the isolated test design is approved.

## 8. Required isolated tests

### Identity and dual control
- Same identity with two browser sessions cannot satisfy two-person approval.
- Shared role credential cannot produce distinct actor subjects.
- Client-supplied actor subject/role/email is ignored.
- Expired, revoked, wrong-issuer, wrong-audience, bad-signature, replayed, or stale identity assertion is rejected.
- Operator cannot approve own rules/snapshot/result.
- Reviewer cannot approve a different snapshot/version from the one being acted upon.
- Role revocation invalidates the next privileged action.

### Journal and recovery
- Audit append failure blocks the operation.
- Write intent succeeds but state write fails: retry reconciles the same operation.
- State write succeeds but response times out: retry returns the same result and does not repeat the action.
- Completion write fails: operation remains pending/reconciliation-required and cannot publish.
- Duplicate idempotency key, concurrent calls, lock timeout, cache eviction, stale version, and partial write.
- Modify/delete/reorder a journal row; verify hash-chain and external-anchor mismatch is detected.
- Attempt to edit or delete external evidence with app writer identity; access must be denied.
- Restore from backup and independently verify all journal sequence numbers and hashes.

### Privacy and public output
- Public endpoints never expose actor subjects, reviewer identities, participant snapshots, raw winner IDs, or private evidence references.
- Winner public record contains only the strict allowlist and generic identity copy / safe masked ID.
- Logs and error messages contain no credentials, tokens, PINs, or participant personal data.

### Operations
- Test with synthetic participants and test-only identity accounts.
- Verify retention duration, cost, data minimization, export, recovery, and reviewer access.
- Test Android and browser behavior only after backend gates pass.

## 9. Implementation sequence and gates

1. Obtain exact active Apps Script source/deployment provenance without changing it.
2. Decide the individual identity provider and confirm whether two genuinely independent reviewers are available.
3. Design the isolated external evidence store, retention period, ownership, IAM, and recovery; do not lock retention until explicitly approved after its irreversible consequences are understood.
4. Build a test-only identity adapter and journal interface with synthetic actors and data.
5. Implement and test failure recovery before adding any draw execution.
6. Integrate the already separately reviewed beacon verifier and deterministic selection protocol.
7. Perform independent security review and Android/browser tests.
8. Only then request explicit approval for any production-facing work.

## 10. Current conclusion

- The candidate's role checks do not provide independent human identities.
- The candidate audit function is not fail-closed or immutable and intentionally deletes old rows.
- The existing ScriptLock is useful for concurrency control but does not provide database transactions or protect against direct spreadsheet edits.
- The official draw remains blocked. Keep roulette in simulation mode.
- No physical schema, sheet, Drive folder, Cloud bucket, retention policy, identity provider, Script Property, trigger, or deployment was created or changed.
