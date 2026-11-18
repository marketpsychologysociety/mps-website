# MPS P1.22 — Isolated Technical Acceptance Specification

**Status:** Implementation-ready specification; documentation only.  
**Branch:** `mps-v4.8-workbench`.  
**Predecessor:** P1.21 Security Architecture Implementation Blueprint.  
**Release posture:** Official winner draw **NO-GO**; public roulette **SIMULATION ONLY**.  
**Scope boundary:** Defines logical database entities, API request contracts, authorization matrix, transaction invariants, provider adapters, and acceptance tests for a future isolated implementation. It does not create infrastructure, code a live service, connect production data, or authorize deployment.

## 1. Purpose and interpretation

P1.22 turns P1.21 into a concrete acceptance baseline. A future isolated implementation is acceptable only when it conforms to this document and the prior API, identity, evidence, draw-protocol, backup, and threat-model documents.

This specification deliberately distinguishes:
- **Normative contract:** behavior an implementation must satisfy.
- **Illustrative logical schema:** vendor-neutral structure, not a migration script.
- **Synthetic acceptance test:** local/CI test using fake identities and data.
- **Isolated integration evidence:** observed behavior against separately approved test providers.
- **Operational evidence:** independently verifiable evidence from the actual controlled environment.

A passing synthetic test never upgrades itself into isolated integration or operational evidence. All operational G0–G11 gates remain unpassed until separately evidenced and reviewed.

## 2. System boundary and deployment topology

### 2.1 Logical components

| Component | Trust level / role | Must not do |
|---|---|---|
| MPS public GitHub Pages | Untrusted public client; renders approved public projection | Authenticate privileged operators, compute eligibility, choose winners, approve/publish results |
| Existing Apps Script CMS | Existing MPS content/member workflow | Hold draw secrets, grant draw roles, approve draw, verify beacon, manufacture winner projection |
| Draw web client | Untrusted UI for privileged service | Assert actor/role, send roster, select participant, set beacon round, set draw state |
| Identity provider | Authenticates individual human subjects | Decide MPS business permissions without server policy |
| Draw API | Authoritative policy and workflow boundary | Trust client actor claims or an upstream `verified:true` assertion |
| Transactional database | Durable state and atomic invariants | Act as sole tamper-evidence boundary |
| Evidence adapter | Create-only write/readback boundary | Treat successful upload response as independent verification |
| Beacon verifier | Cryptographic verification boundary | Accept unpinned chains or unsigned relay assertions |
| Audit export/verifier | Independent source-evidence boundary | Treat normalized fixture as authenticated raw provider evidence |
| Backup/recovery boundary | Separate recovery authority | Share unrestricted source administrator identity |

### 2.2 Data flow rules

1. Browser authenticates through OIDC; the backend validates callback and establishes a server-side session.
2. Each API request resolves actor identity and current roles from server-side session/registry.
3. Draw commands validate schema, authorization, current state/version, approval digests, idempotency, and policy.
4. A transaction records the operation intent and state transition/outbox atomically.
5. External evidence or beacon work is performed through a durable operation state and idempotent worker; result is read back independently.
6. Independent reviewer verifies the exact proof and snapshot digest.
7. Publisher approves a canonical public projection digest.
8. Public read endpoints serve only the projection for a PUBLISHED record.

Private roster data never flows to GitHub Pages, Apps Script public feeds, ticker, analytics, URL parameters, browser storage, beacon provider, or public logs.

## 3. Canonical types and serialization

### 3.1 General constraints

- Transport: HTTPS, UTF-8 JSON, `/api/v1`.
- Timestamps: UTC RFC 3339 with explicit `Z`; reject local-time or offset-free values.
- IDs: opaque server-generated identifiers; no embedded member identity or sequential database key.
- Digests: lowercase hex SHA-256 prefixed `sha256:` where represented as text.
- Provider generations: decimal strings, never JavaScript floating-point numbers.
- Enumerations: exact allowlist; unknown values rejected.
- Strings: Unicode NFC before canonical hashing; reject invalid Unicode, control characters where not allowed, and over-limit values.
- JSON canonicalization: one pinned canonicalization version, UTF-8 bytes, deterministic object-key ordering, no insignificant whitespace, and explicit number rules. Do not rely on ordinary runtime `JSON.stringify` as a cross-language protocol definition.
- Unknown privileged request fields: reject with `VALIDATION_ERROR`; never silently ignore.
- Null, omitted and empty values have distinct schema meanings and must be specified per field.
- Every schema has an explicit `schema_version`; incompatible changes require a new version and migration review.

### 3.2 Common request envelope

| Field | Type | Required | Rule |
|---|---|---:|---|
| `request_id` | string | Server-generated | Opaque trace ID |
| `idempotency_key` | header | State-changing request | 128-bit or stronger random value; scoped and hashed server-side |
| `expected_version` | integer | State transition | Must equal current resource version |
| `payload` | object | Yes | Endpoint-specific strict schema |

The request body must not contain `actor`, `role`, `issuer`, `subject`, `mfa`, `approved_by`, `winner`, `winner_index`, `randomness`, `beacon_round`, `chain_hash`, `snapshot_ref`, or any state override unless the endpoint schema explicitly defines a non-authoritative field with that name. In the initial API these privileged values are server-derived and therefore rejected if supplied by the client.

### 3.3 Common response envelope

Success:
```json
{
  "ok": true,
  "request_id": "req_opaque",
  "data": {},
  "operation": {
    "operation_id": "op_opaque",
    "state": "COMPLETED",
    "replayed": false
  }
}
```

Error:
```json
{
  "ok": false,
  "request_id": "req_opaque",
  "error": {
    "code": "PRECONDITION_FAILED",
    "message": "The resource changed. Refresh and review before retrying.",
    "retryable": false
  }
}
```

Messages must be generic and must not disclose whether a member, email, account, or private record exists. Never return stack traces, tokens, secrets, SQL details, internal paths, private storage references, or raw roster values.

## 4. Logical relational data model

This is a logical model to be translated into a selected transactional database only after provider/owner/cost approval. Primary keys are opaque IDs. All mutable entities carry `created_at`, `updated_at`, and integer `version` where applicable. All timestamps are server-generated.

### 4.1 Core tables

| Entity | Primary key | Required fields / constraints |
|---|---|---|
| `operator_subject` | `operator_ref` | `issuer`, immutable `subject`, status, created_at; UNIQUE(issuer, subject); no email as identity key |
| `operator_role_grant` | `grant_id` | operator_ref, role enum, scope, granted_by_subject, approved_by_subject, status, effective_at, revoked_at; grant/revoke requires distinct approver |
| `draw_event` | `event_id` | event_version, title_public, prize_public_description, rules_json, rules_digest, cutoff_utc, eligibility_policy_version, protocol_version, status, created_by_subject; immutable approved version |
| `draw_snapshot` | `snapshot_id` | event_id, event_version, canonicalization_version, eligibility_policy_version, participant_count, encrypted_snapshot_ref, commitment_algorithm, secret_salt_ref, snapshot_digest, prepared_by_subject, status; unique approved snapshot version |
| `approval_record` | `approval_id` | target_type, target_id, target_version, target_digest, approver_issuer, approver_subject, role_at_action, auth_assurance, authenticated_at, decision, reason_code; immutable append-only |
| `draw_operation` | `operation_id` | event_id, snapshot_id, operation_type, idempotency_scope_hash, request_digest, state, initiated_by_subject, expected_version, result_digest, created_at, completed_at; UNIQUE(idempotency_scope_hash) |
| `draw_proof` | `proof_id` | operation_id UNIQUE, chain_id, chain_hash, beacon_round, beacon_signature_ref, beacon_randomness_ref, verifier_build_digest, selected_index, private_winner_ref, proof_digest, verification_state |
| `publication` | `publication_id` | event_id, operation_id, projection_version, projection_digest, approval_id, public_result_id UNIQUE, status, published_at, withdrawn_at |
| `audit_outbox` | `outbox_id` | aggregate_type, aggregate_id, sequence, event_type, canonical_payload_digest, delivery_state, attempts, next_attempt_at; UNIQUE(aggregate_type, aggregate_id, sequence) |
| `idempotency_record` | `idempotency_id` | scope_hash UNIQUE, request_digest, operation_id, response_digest, state, created_at, expires_at; retention policy must exceed maximum reconciliation window |
| `reconciliation_case` | `case_id` | operation_id, reason_code, opened_at, opened_by, status, evidence_refs, resolved_at, resolver_subject; unresolved cases block further draw/publication |
| `security_audit_event` | `audit_event_id` | sequence, actor issuer/subject, action, target, target_version, request_id, session_hash, auth_assurance, event_digest, previous_digest, timestamp; append-only permissions |

### 4.2 Private snapshot storage

The participant snapshot must be stored separately from public/event metadata. It contains only:
- stable opaque internal participant reference;
- eligibility result and bounded reason code;
- frozen ordering index;
- policy/source version needed to reproduce the decision.

It must not contain member name, phone, email, Telegram ID, MT5 login, deposit/payment amount, PIN, document contents or document URLs unless a separately approved eligibility rule absolutely requires a private source reference. Such source reference must remain in a separate restricted mapping, never in the draw proof or public projection.

The snapshot is encrypted with a separately managed key. The key reference is not the key. Decryption access is logged and restricted. A commitment digest is not proof of roster completeness or eligibility correctness.

### 4.3 Required database constraints and transaction invariants

- UNIQUE(issuer, subject) for operator identity.
- UNIQUE(idempotency scope hash) for command deduplication.
- UNIQUE(operation_id) in draw proof.
- UNIQUE(public_result_id) and at most one active PUBLISHED projection per event unless published rules explicitly define multiple winners.
- UNIQUE(aggregate, sequence) for ordered outbox/audit events.
- Foreign keys prevent orphan approvals, proof, publication and reconciliation records.
- State and version update must use row lock or serializable/optimistic compare-and-swap within one transaction.
- Approval digest/version must match the exact currently frozen object.
- Same issuer+subject cannot satisfy preparer/reviewer, operator/reviewer, or reviewer/publisher separation pairs as defined by policy.
- An unresolved `RECONCILIATION_REQUIRED` case blocks execution and publication.
- No database cascade may delete evidence, approval, proof or audit history.
- Application DB role cannot drop/alter audit tables or disable constraints in normal operation.
- Database admin access is separate and audited; DB superuser is not an application runtime identity.

### 4.4 Transaction boundaries

**T1 — state-changing command acceptance**
1. Authenticate and derive actor.
2. Validate strict schema and request size.
3. Begin transaction.
4. Lock/read aggregate and expected version.
5. Verify role, scope, state, approvals, digest and idempotency.
6. Insert operation/idempotency record and append audit/outbox intent.
7. Apply one legal state transition and increment version.
8. Commit.
9. Read back committed operation and state.
10. Return original operation state; if acknowledgement is ambiguous, query by idempotency scope and reconcile.

**T2 — external side effect**
1. Worker claims outbox row using durable lease/claim semantics.
2. Write exact canonical evidence bytes using provider create-only precondition.
3. Persist provider receipt and generation in a new transaction.
4. Independent verifier reads exact generation and recomputes digest.
5. Append completion evidence and mark outbox delivered only after acknowledgement and readback.
6. Timeout or mismatch becomes `RECONCILIATION_REQUIRED`; do not create an alternate key or duplicate operation.

A database transaction cannot atomically include an external object store or beacon. Use durable outbox, idempotent provider operations, exact readback and reconciliation; do not claim distributed atomicity.

## 5. API endpoint request/authorization specification

All state-changing endpoints require authentication, current server-side authorization, CSRF protection for cookie sessions, `Idempotency-Key`, expected version/If-Match, strict body schema, durable audit and state-machine validation.

| Method / path | Role | Request fields | Success postcondition |
|---|---|---|---|
| GET `/api/v1/session` | Authenticated | none | Minimal server-derived session/assurance |
| POST `/api/v1/session/logout` | Authenticated | none | Current session revoked |
| GET `/api/v1/operator/me` | Privileged | none | Own operator ref and current roles only |
| POST `/api/v1/operator/grant` | Security admin + independent approver | issuer, subject, role, scope, reason_code | Grant pending/approved per dual-control policy |
| POST `/api/v1/operator/revoke` | Security admin + independent approver | grant_id, reason_code | Grant revoked; sessions invalidated |
| POST `/api/v1/events` | Operator | title_public, prize_public_description, rules_json, cutoff_utc, policy_version, protocol_version | DRAFT event created |
| PATCH `/api/v1/events/{id}` | Event owner, DRAFT only | editable draft fields | Version increment; previous draft digest retained |
| POST `/api/v1/events/{id}/publish-rules` | Operator | rules_digest, expected_version | RULES_REVIEW_PENDING |
| POST `/api/v1/events/{id}/approve-rules` | Distinct reviewer | target_version, target_digest, decision, reason_code | Exact rules approved/rejected |
| POST `/api/v1/events/{id}/freeze-request` | Operator | expected_version | Snapshot preparation operation queued |
| GET `/api/v1/draws/{id}/snapshot-summary` | Reviewer/auditor | none | Count, policy version and commitment only |
| POST `/api/v1/draws/{id}/approve-snapshot` | Reviewer distinct from preparer | target_version, target_digest, decision | Exact snapshot approved/rejected |
| POST `/api/v1/draws/{id}/commit-beacon` | Restricted service policy | approved snapshot, pinned chain config, future round derived server-side | Immutable precommit record |
| POST `/api/v1/draws/{id}/execute` | Operator after gates | expected_version, command reason_code | One operation ID; no client-selected winner/randomness |
| GET `/api/v1/draws/{id}/status` | Authorized draw role | none | State/version and sanitized operation state |
| GET `/api/v1/draws/{id}/proof` | Auditor/authorized reviewer | none | Restricted proof fields, no roster mapping |
| POST `/api/v1/draws/{id}/verify` | Reviewer distinct from executor | proof_digest, expected_version | VERIFIED or VERIFICATION_FAILED |
| POST `/api/v1/draws/{id}/reconcile` | Auditor + security policy | case_id, evidence_refs, resolution_code | Case resolved with immutable evidence |
| POST `/api/v1/draws/{id}/publication-request` | Operator/publisher | projection schema/version, expected_version | PUBLICATION_REVIEW_PENDING |
| POST `/api/v1/draws/{id}/approve-publication` | Distinct publisher | projection_digest, decision | Exact projection approved/rejected |
| POST `/api/v1/draws/{id}/publish` | Service after approval | approved publication ref only | PUBLISHED after durable readback |
| POST `/api/v1/draws/{id}/withdraw` | Operator + independent reviewer | reason_code, expected_version | WITHDRAWN; prior publication preserved |
| GET `/api/v1/public/winners` | Public | bounded page cursor/limit | Published public projections only |
| GET `/api/v1/public/winners/{public_result_id}` | Public | opaque public ID | One published projection |
| GET `/api/v1/public/events/{public_event_id}/proof-summary` | Public | opaque public event ID | Public-safe proof summary only |

### 5.1 Endpoint-wide rejection rules

Reject:
- client-supplied actor, subject, role, approval identity, MFA status or state;
- client-supplied participant list, winner, index, randomness, beacon signature, chain/round override;
- stale If-Match/expected_version;
- duplicate key with different canonical request digest;
- same-human dual-control attempts;
- unknown privileged fields, unknown enum values and over-limit payloads;
- access to private resource by opaque ID without object-level authorization;
- public access to any state other than PUBLISHED;
- external evidence writes without create-only precondition or exact-generation receipt;
- any operation while a related reconciliation case remains unresolved.

## 6. Authorization matrix

Legend: **R** read, **C** create/command, **A** approve, **—** denied. Scope and state-machine rules apply in addition to this matrix.

| Resource/action | Operator | Reviewer | Publisher | Auditor | Security admin | Service identity | Public |
|---|---:|---:|---:|---:|---:|---:|---:|
| Own session | R | R | R | R | R | — | — |
| Draft event create/edit | C | R | R | R | — | — | — |
| Rules approval | — | A | — | R | — | — | — |
| Private snapshot preparation | C request | R summary | — | R restricted | — | C worker | — |
| Snapshot approval | — | A | — | R | — | — | — |
| Beacon precommit/verification | — | R | — | R | — | C | — |
| Execute draw | C after approvals | — | — | R | — | C bounded worker | — |
| Independent proof verification | — | A | — | R | — | C verifier only | — |
| Publication approval | — | R | A | R | — | — | — |
| Publish approved projection | — | — | C request | R | — | C after gate | — |
| Audit evidence | — | R scoped | R publication evidence | R | R security scope | C own events | — |
| Role grant/revoke | — | A | — | R | C request | — | — |
| Public published projection | R public | R public | R public | R public | R public | C publish | R |

No row grants authority solely because a person holds a role. For every approval pair, the backend checks distinct immutable human subjects and policy-specific separation. Service identities are non-interactive and cannot count as human approvers.


### 6.1 Canonical role identifiers

The API and audit layer must use exactly these role identifiers (case-sensitive):

- `DRAW_OPERATOR`
- `DRAW_REVIEWER`
- `DRAW_PUBLISHER`
- `DRAW_AUDITOR`
- `DRAW_SECURITY_ADMIN`
- `SERVICE_IDENTITY` (non-human, non-interactive; never counts as an independent approver)

Role grants are bound to immutable `issuer + subject`, scope, effective time and revocation state. Human roles cannot be inferred from email, display name or client input. Service identities must be separately registered and narrowly scoped.

## 7. Identity and session acceptance

### 7.1 OIDC validation

The implementation must validate:
- exact configured issuer and discovery/JWKS trust;
- allowed signature algorithms and key rotation;
- signature and key ID;
- audience and authorized party where applicable;
- exp, iat, nonce, state and PKCE verifier;
- authorization response bound to initiating browser session;
- required authentication time and MFA/step-up assurance;
- immutable issuer+subject against active operator registry;
- revoked/disabled operator and session state.

Never use decoded-but-unverified claims, email address, display name, client role, caller-supplied subject, or relay boolean as proof of identity.

### 7.2 Session controls

- Secure, HttpOnly, SameSite cookie; no bearer token in localStorage/sessionStorage.
- CSRF token and Origin validation on cookie-authenticated mutations.
- Session rotation after login and step-up; bounded idle and absolute expiry.
- Server-side logout/revocation and operator disable invalidates active sessions.
- Sensitive approval/execution requires fresh step-up within a policy-defined maximum age.
- Session audit stores a keyed/hash reference only, not cookie or token.
- Rate-limit login, step-up and recovery endpoints; generic responses prevent account enumeration.

### 7.3 Identity negative tests

Wrong issuer, wrong audience, invalid signature, unknown key, expired token, future iat outside clock tolerance, nonce mismatch/replay, state mismatch, PKCE mismatch, missing MFA, stale step-up, disabled subject, revoked role, forged client role, session fixation, CSRF and replay must all fail closed.

## 8. External evidence adapter contract

### 8.1 Provider-neutral interface

```ts
interface EvidenceStore {
  putIfAbsent(input: {
    objectKey: string;
    canonicalBytes: Uint8Array;
    expectedSha256: string;
    idempotencyRef: string;
  }): Promise<{
    provider: string;
    accountOrProjectRef: string;
    bucketOrContainerRef: string;
    objectGeneration: string;
    metageneration?: string;
    providerChecksum?: string;
    serverCreatedAt: string;
    receiptDigest: string;
  }>;

  getExact(input: {
    objectKey: string;
    generation: string;
  }): Promise<{ canonicalBytes: Uint8Array; generation: string }>;

  verifyReceipt(input: {
    receipt: unknown;
    expectedSha256: string;
    expectedGeneration: string;
  }): Promise<{ verified: boolean; reasonCode: string }>;
}
```

The interface is a design contract, not implemented code. Provider adapters must not return verified=true solely because upload returned success. Independent verifier performs exact-generation readback and recomputes the digest.

### 8.2 GCS candidate mapping

If and only if GCS is separately approved for an isolated PoC:
- create-only upload uses `ifGenerationMatch=0`;
- returned generation and metageneration are stored as decimal strings;
- verifier reads the exact generation;
- provider checksum supplements local SHA-256;
- writer cannot get/list/delete/update metadata or administer bucket/IAM/retention/logging;
- verifier is read-only;
- audit admin and recovery identity are separate administrative subjects;
- Data Access logs are explicitly enabled and independently exported;
- raw audit source authenticity and pagination are independently established;
- no Bucket Lock or irreversible retention is enabled in initial PoC.

### 8.3 Evidence object allowlist

Canonical evidence object may contain schema/protocol version, synthetic or opaque event reference, sequence, previous/current journal digest, idempotency reference, rules/protocol digest and server intent time. It must exclude participant names/IDs, contact information, private winner reference, roster, PIN, document URLs, tokens, credentials, secret salts and raw member records.

## 9. Beacon and deterministic selection boundary

The draw implementation is not accepted until a separately reviewed protocol document defines exact canonical byte encoding, pinned beacon chain configuration, future-round commitment, signature scheme, verifier build, rejection-sampling algorithm and cross-language test vectors.

Required invariant:
1. Freeze and independently approve exact rules and snapshot digest.
2. Commit the pinned chain identity and a future round before randomness is known.
3. Fetch the specified round only; never substitute a later/earlier round on failure.
4. Verify cryptographic signature/proof against pinned chain configuration locally or in a reviewed verifier.
5. Derive selection from canonical protocol input only.
6. Use deterministic rejection sampling with published vectors; no direct modulo reduction.
7. Independently reproduce selected index and proof digest.
8. Verify winner reference maps to the frozen snapshot entry privately.
9. Preserve all proof evidence; publish only after independent verification and publication approval.

Failure, timeout, wrong chain/round, invalid signature, unavailable verifier, snapshot drift or inconsistent proof sets a blocked/exceptional state. No reroll, manual winner choice, client-supplied index or unapproved alternate beacon is permitted.

## 10. Error and state contract

| Code | HTTP | Required behavior |
|---|---:|---|
| UNAUTHENTICATED | 401 | Re-authenticate; no state mutation |
| FORBIDDEN | 403 | Stop; no blind retry |
| STEP_UP_REQUIRED | 403 | Complete verified step-up |
| SUBJECT_DISABLED | 403 | Revoke session; security review |
| SEPARATION_OF_DUTIES | 409 | Require distinct eligible human |
| PRECONDITION_FAILED | 409 | Refresh exact resource version |
| IDEMPOTENCY_CONFLICT | 409 | Stop; investigate request mismatch |
| OPERATION_IN_PROGRESS | 202 | Poll same operation ID only |
| RATE_LIMITED | 429 | Follow server retry guidance |
| BEACON_NOT_READY | 409 | Wait for committed round; never change it |
| BEACON_INVALID | 422 | Fail closed; preserve evidence |
| JOURNAL_UNAVAILABLE | 503 | Block sensitive operation |
| RECONCILIATION_REQUIRED | 503 | Freeze related actions; reconcile |
| VERIFICATION_FAILED | 422 | Never publish |
| PUBLICATION_FAILED | 503 | Reconcile same publication operation |
| VALIDATION_ERROR | 400 | Return field-safe validation details |

State transitions must follow the lifecycle in the API contract. Client cannot assign state. Any mutation to approved rules, snapshot, protocol, beacon commitment or public projection invalidates dependent approvals. Exceptional states retain evidence and block downstream transitions.

## 11. Test and evidence acceptance matrix

Every test report includes: test ID, commit/build digest, environment class, fixture version, actor subject class (synthetic or real), request/response digest, expected/actual result, timestamps, logs/evidence references, reviewer and disposition.

| ID | Layer | Required case | Pass condition |
|---|---|---|---|
| TA-001 | Schema | Unknown privileged fields | Rejected before state mutation |
| TA-002 | Schema | Oversized/invalid Unicode/unknown enum | Bounded generic validation failure |
| TA-003 | Canonicalization | Key order/Unicode/number equivalence | Cross-runtime identical canonical bytes/digest |
| TA-004 | Identity | Wrong issuer/audience/signature | 401; no session or mutation |
| TA-005 | Identity | Nonce/state/PKCE replay | Rejected and security event recorded |
| TA-006 | Identity | Missing/stale MFA or revoked subject | 403; privileged action blocked |
| TA-007 | Session | CSRF, fixation, replay, expired session | Mutation rejected |
| TA-008 | Authorization | Forged role/actor in body | Rejected; actor remains server-derived |
| TA-009 | Authorization | IDOR/BOLA across event/draw IDs | 403/404 generic; no private data leakage |
| TA-010 | Dual control | Same issuer+subject in approval pair | SEPARATION_OF_DUTIES |
| TA-011 | Dual control | Role grant self-approval | Rejected |
| TA-012 | State | Skip/reverse illegal transition | Rejected; audit retained |
| TA-013 | Approval | Digest/version changes after approval | Old approval invalidated |
| TA-014 | Database | Concurrent same command | One logical operation only |
| TA-015 | Database | Same idempotency key, same digest | Original operation replayed |
| TA-016 | Database | Same idempotency key, different digest | IDEMPOTENCY_CONFLICT |
| TA-017 | Database | Crash before commit / after commit before ack | Durable state reconciled; no duplicate |
| TA-018 | Database | DB constraint/foreign key violation | Transaction rolled back; no partial state |
| TA-019 | Outbox | Worker crash/lease expiry/retry | Idempotent delivery; no duplicate evidence |
| TA-020 | Reconciliation | Ambiguous provider timeout | RECONCILIATION_REQUIRED; no second operation |
| TA-021 | Privacy | Public projection with private fields | Schema rejects or strips only by strict construction; never leaks |
| TA-022 | Privacy | Mask collision/invalid identifier | Identifier omitted; generic copy |
| TA-023 | Evidence | Create-only conflict/different bytes | Conflict; no overwrite or alternate key |
| TA-024 | Evidence | Exact-generation readback mismatch | Fail closed; case opened |
| TA-025 | Evidence | Writer get/list/delete/admin attempts | Denied and audit evidence independently observed |
| TA-026 | Audit | Missing Data Access/page/query coverage | Evidence gate fails |
| TA-027 | Audit | Raw log provenance/independent retrieval | Source and pagination independently verified |
| TA-028 | Backup | Restore to new target | Exact digest/checkpoint; source unchanged |
| TA-029 | Key recovery | Missing/revoked/unavailable key | Restore blocked; no plaintext fallback |
| TA-030 | Beacon | Wrong chain/round/key/signature | BEACON_INVALID; no selection/publication |
| TA-031 | Algorithm | Boundary and rejection-sampling vectors | Independent implementation produces identical index |
| TA-032 | Algorithm | Modulo-bias regression | No modulo-only reduction; statistical and proof review |
| TA-033 | Draw | Client-supplied winner/index/randomness | Rejected; no influence on output |
| TA-034 | Draw | Retry after lost acknowledgement | Same operation/proof only; no reroll |
| TA-035 | Publication | Publish before VERIFIED/approval | Rejected; public API remains empty |
| TA-036 | Publication | Projection digest mutation | Approval invalidated; no publish |
| TA-037 | Public API | Direct endpoint/private ID probing | Only PUBLISHED allowlisted fields returned |
| TA-038 | Monitoring | Critical alert without provider ack | Not marked DELIVERED; retry/dead-letter |
| TA-039 | Operations | Unresolved reconciliation at release | Release NO-GO |
| TA-040 | Release | Missing independent gate evidence | Release NO-GO |

### 11.1 Evidence class labels

- `STATIC`: source inspection, schema validation, lint, threat review.
- `SYNTHETIC`: fake identities/data and local harness.
- `ISOLATED_INTEGRATION`: actual separately approved test provider and isolated identity configuration.
- `INDEPENDENT_OPERATIONAL`: evidence independently retrieved/reproduced by a reviewer outside the implementer's control.
- `PRODUCTION`: actual live environment; requires explicit release authorization.

Every test must declare one class. CI may report STATIC/SYNTHETIC only unless actual isolated integrations are deliberately configured and evidence is independently reviewed.

## 12. Security, privacy and observability requirements

- Default deny; least privilege; separate human/service identities.
- Strict object-level authorization on every private resource.
- No secret or PII in logs, telemetry, exception text, URLs or client storage.
- Structured audit events with bounded reason codes; never log raw request bodies for sensitive endpoints.
- Correlation via opaque request/operation IDs and digest references.
- Rate limits on login, operator search, event creation, freeze, execute, verify, public listing and proof lookup.
- Public responses use allowlisted projection construction, not serialization of internal database objects.
- CORS allowlist is exact; no wildcard credentialed origins.
- Security headers, CSP, HSTS, frame restrictions and content-type enforcement.
- Dependency lockfile, pinned runtime, reproducible build and artifact digest.
- Alert on privileged grant/revoke, failed MFA, unusual access, evidence mismatch, journal gap, beacon failure, unresolved reconciliation and public publication/withdrawal.
- Monitoring delivery state changes to DELIVERED only after provider acknowledgement.
- Logs have explicit retention, access and independent export policies.

## 13. Implementation sequence and exit gates

| Sequence | Work package | Depends on | Exit condition |
|---|---|---|---|
| S0 | Governance, owners, cost/privacy/retention approval | None | Signed prerequisite register; no ambiguity |
| S1 | Identity provider isolated PoC | S0 | Real OIDC/MFA positive/negative evidence |
| S2 | DB schema and transactional core in local synthetic harness | S0 | Migrations reviewed; constraints and crash/race tests pass |
| S3 | API middleware, authorization, sessions | S1,S2 | Endpoint tests TA-001–013 pass in declared evidence class |
| S4 | State machine, idempotency, outbox, reconciliation | S2,S3 | TA-014–020 pass |
| S5 | Evidence adapter in local contract harness | S2 | Adapter contract and synthetic failure tests pass |
| S6 | Actual provider PoC and independent audit retrieval | S0,S1,S5 plus explicit provisioning approval | TA-023–027 isolated/independent evidence |
| S7 | Backup/key recovery integration | S6 and durable service | TA-028–029 independent restore evidence |
| S8 | Beacon verifier and selection protocol | S0,S2,S4,S6 | TA-030–034 independent reproduction |
| S9 | Publication, privacy, monitoring, incident integration | S3–S8 | TA-021–022, TA-035–039 and human operations evidence |
| S10 | Independent release review | S0–S9 | TA-040 cleared; all G0–G11 operational PASS |

The first implementation iteration may build S2/S3 using synthetic fixtures and local-only infrastructure. It must not connect the production member database or create paid/cloud resources. S6 and later provider operations require separate explicit approval.

## 14. Stop, rollback and recovery requirements

Stop immediately on identity mismatch, role ambiguity, same-person approval, roster/rules digest drift, unexpected PII, state/version conflict, journal fork, provider readback mismatch, missing audit evidence, retention drift, beacon mismatch, key compromise, backup mismatch, alert delivery uncertainty or unresolved operation.

- Preserve evidence; do not delete/rewrite to make tests pass.
- Disable new commands at the service boundary while retaining read-only evidence access.
- Reconcile by original idempotency key/operation ID and exact provider generation; never create a replacement key to bypass conflict.
- Rollback application code/config only to a previously reviewed build; do not roll back or erase audit/evidence history.
- Restore requires separate approval, two-person authorization, new target and independent checkpoint verification.
- Public correction/withdrawal appends a new audited record; it does not erase the prior proof.

## 15. Approval and non-action boundary

This specification does **not** authorize:
- creating a cloud project/account, database, bucket, KMS key, audit sink, identity tenant or paid service;
- enabling billing, purchasing plans or exceeding a cost ceiling;
- creating privileged accounts/service identities or changing IAM;
- enabling Bucket Lock, WORM or irreversible retention;
- importing member data or connecting production Sheets, Drive, Apps Script or Telegram;
- changing DNS, hosting, GitHub Pages production branch, webhook, triggers or live deployment;
- executing a real winner draw or publishing an official winner.

Before any such action, present the exact resource/provider, owner, region, permissions, data class, cost estimate/cap, retention and irreversibility, rollback limitations and evidence plan for separate explicit approval. “Next” or “Lanjut” authorizes only safe isolated work, not these operations.



### 15.1 Explicit non-actions in P1.22

No cloud project/account, database, bucket, KMS key, audit sink, identity-provider tenant, billing configuration, IAM binding, privileged account, service identity, credential, provider notification, Apps Script deployment, Sheet/Drive/Telegram connection, DNS/hosting change, production data access or live draw was created, configured or changed. No member data was copied, hashed or used. The logical schema is not a migration and has not been applied to any database.

## 16. P1.22 completion checklist

- [x] Reconcile against P1.21, API contract, identity architecture, evidence architecture and GCS PoC boundaries.
- [x] Define canonical types, serialization and request/response envelopes.
- [x] Define logical relational entities, constraints and transaction boundaries.
- [x] Define endpoint contracts and role/authorization matrix.
- [x] Define identity/session acceptance and external evidence adapter.
- [x] Define beacon/selection invariants without claiming implementation.
- [x] Define 40 traceable technical acceptance tests and evidence classes.
- [x] Preserve explicit cost, irreversible-action and production boundaries.
- [x] Run clean-checkout CI after documentation integration (run #362 succeeded, including Chromium).
- [x] Re-fetch and cross-check the specification, workbench plan, README and workflow result.
- [x] Re-compare workbench with production main (335 commits ahead, 0 behind at verification).


## 17. Verification record

- GitHub Actions run #362 (`42961283938`), commit `e1f8d91627e6306aac60eef2e91a30afdf28ccdb`: **SUCCESS**, including all synthetic security/contract suites and Chromium browser checks. This validates the repository workflow, not real OIDC, cloud provider, database, audit provenance, key recovery or production behavior.
- Specification readback SHA-256 blob `c584b0f1545c3de8fa793645169e482bbb4188ea` after role/non-action clarification.
- At verification, workbench compared with `main`: 335 commits ahead, 0 behind; production baseline remained `9f5d9128f7226b1a53cbcaa1615068e7a7fbc6ff`.
- Verification scope: repository document readback, structural checks for 40 TA cases, six canonical roles, twelve logical entities, endpoint contract presence, explicit non-action boundary and release NO-GO statement.
- No actual provider, identity, database, member data, or production environment was exercised.
