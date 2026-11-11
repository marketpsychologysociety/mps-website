# MPS P1.6 — Independent External Evidence Storage Architecture

**Status:** Design and acceptance criteria only; no provider selected or provisioned.  
**Branch:** `mps-v4.8-workbench`  
**Production impact:** None.  
**Official draw decision:** NO-GO until every release blocker in this document and the existing draw security reviews is closed.

## 1. Purpose and boundary

P1.5 established a deterministic synthetic anchor contract. Its in-memory map is useful for testing ordering, create-only behavior, receipt integrity, and fail-closed verification. It is not an external trust boundary, durable storage, immutable retention, or independent evidence.

P1.6 defines what a real evidence provider must demonstrate before it can be integrated. It deliberately does not choose a vendor, create a cloud project, create a bucket, request credentials, set retention, or connect production systems.

The evidence store is separate from the Draw API's operational database and journal. Its job is to preserve independently verifiable checkpoints and provider-generated receipts, not to become the source of participant eligibility or winner selection.

## 2. Required trust separation

A future deployment must use distinct security principals and preferably distinct cloud accounts/projects or equivalent administrative boundaries:

| Plane | Principal | Allowed actions | Must not be able to |
|---|---|---|---|
| Draw service writer | Dedicated workload identity | Create a new evidence object under a narrow prefix; read back its own receipt if required | Delete, overwrite, shorten retention, change bucket policy, administer identities |
| Independent verifier | Separately managed identity/operator | List and read evidence objects, generations, metadata and provider audit evidence | Create, overwrite, delete or change retention |
| Storage administrator | Separate security administrator | Provision storage and maintain policy through controlled change | Prepare/approve/execute a draw or silently alter evidence |
| Backup/recovery operator | Separate recovery role | Perform documented restore drills and verify restored generations | Modify source evidence or approve a draw |

The writer and verifier must not share credentials, workload identity, service account, secret store permissions, or administrative control. A second role name on the same underlying identity is not independent dual control.

Where technically and commercially feasible, use a separate account/project owned by a different administrative group. If a provider cannot enforce a meaningful administrative boundary, record that limitation and do not describe the store as independently controlled.

## 3. Provider-neutral object contract

A production adapter must expose semantics equivalent to:

- `putIfAbsent(objectKey, canonicalBytes, metadata)`: conditional create only. It must fail if the key already exists. No unconditional overwrite or upsert method may be exposed to the Draw service.
- `get(objectKey, generation)`: retrieve the exact immutable object generation, not merely the latest mutable key.
- `head(objectKey, generation)`: return provider-authenticated generation, size, checksum, creation time, retention state and object version metadata.
- `list(prefix, continuationToken)`: enumerate all generations and detect missing, duplicate, unexpected or out-of-order objects. Pagination must be exhausted.
- `getAuditEvidence(timeRange, objectKeys)`: retrieve provider-side audit events for create, read, delete attempts, retention changes, IAM/policy changes and administrative actions.
- `verifyReceipt(receipt, objectBytes, metadata)`: independently recompute the canonical digest and compare it with provider-reported checksum/generation. This is a client-side verification step, not trust in a provider boolean.

The adapter must return an immutable receipt containing at least:
- opaque object key;
- provider and account/project identity;
- object generation/version identifier;
- canonical payload SHA-256;
- provider checksum where available;
- server-reported creation timestamp;
- retention mode, retain-until timestamp and legal-hold state where supported;
- request/idempotency reference;
- provider audit-event reference or retrieval cursor.

All timestamps must be parsed and checked for plausible ordering. Provider time is evidence metadata, not a replacement for a trusted beacon timestamp or journal sequence.

### Canonical object envelope

The stored object should contain only:
- protocol and schema version;
- MPS event/draw opaque identifier;
- monotonically increasing checkpoint sequence;
- previous journal checkpoint hash;
- current journal checkpoint hash;
- previous external receipt hash;
- creation intent identifier;
- non-sensitive rules/protocol version references.

Never store participant names, raw/member IDs, contact details, MT5 identifiers, deposits, payment records, PINs, identity documents, private roster rows, access tokens, credentials, or unredacted operational logs in the external anchor object. The private participant snapshot remains in its separately controlled data plane; the public proof remains a strict allowlist projection.

## 4. Required storage controls

A provider is not acceptable merely because it returns a SHA-256 checksum or exposes object versioning.

Before production consideration, independently prove:

1. **Conditional create:** concurrent writers cannot replace an existing key; a duplicate key with changed bytes is rejected.
2. **Version/generation pinning:** the verifier can retrieve and validate the exact generation originally acknowledged.
3. **Retention enforcement:** a documented retention policy prevents deletion/shortening for the required period. A governance-approved retention lock may be considered only after legal, operational, cost, recovery and account-ownership review. Do not enable an irreversible lock during P1.6.
4. **Separation of duties:** writer cannot administer storage/IAM/retention; verifier is read-only; storage administrator cannot operate the draw.
5. **Audit coverage:** provider audit records cover object writes, failed deletes, policy/retention changes, IAM changes, key changes and administrative access. Audit records are exported to a separately controlled destination.
6. **Independent read path:** verifier uses its own principal and session, not the writer's credential or proxy response.
7. **Backup and recovery:** documented recovery point/object generation, backup isolation, restore procedure and periodic restore evidence. A replica controlled by the same administrator is not an independent backup.
8. **Monitoring:** alert on unexpected object deletion, generation change, retention reduction, policy/IAM drift, missing scheduled anchors, delayed replication, audit-log gaps and failed verification.
9. **Key management:** encryption keys and key administrators are separated from the draw operator. Key rotation and revocation are tested; loss of a key must not silently make the evidence unverifiable.
10. **Supply-chain controls:** pin SDK/library versions, review adapter source, lock dependencies, record build provenance, and independently reproduce the adapter package.

## 5. Write and verification protocol

For each journal checkpoint:

1. Draw service obtains the durable journal checkpoint and its sequence under the journal's single-writer lock.
2. It constructs canonical bytes and a deterministic object key. It calculates the payload digest locally.
3. It invokes conditional create exactly once with a durable idempotency reference.
4. It records the provider's object generation and receipt in the local durable journal.
5. It reads back the exact generation and independently checks bytes, digest, metadata, sequence and predecessor receipt.
6. A separately authenticated verifier lists the expected prefix, exhausts pagination, fetches exact generations and validates the full chain against independently retained journal checkpoints.
7. The verifier retrieves provider audit evidence and confirms the write principal, time window, object key and absence of unauthorized mutation/deletion.
8. Any missing object, unexpected generation, mismatch, audit gap, policy drift or uncertain write becomes `RECONCILIATION_REQUIRED`. No reroll, replacement object, overwrite, or publication is permitted until resolved by an independently reviewed recovery procedure.

A lost acknowledgement is not permission to create a second object. Retry the same idempotency reference and exact bytes; if provider state is ambiguous, read and reconcile first. A conflicting payload for an existing sequence is a hard failure.

## 6. Threats and required negative tests

| Threat | Required test/evidence | Expected result |
|---|---|---|
| Writer overwrites existing key | Concurrent conditional-create race | Exactly one create succeeds; all others read/reconcile or fail |
| Writer deletes evidence | Attempt delete with writer identity | Denied and provider audit event recorded |
| Writer changes retention/IAM | Attempt policy and IAM mutation | Denied and monitored |
| Same principal masquerades as verifier | Compare immutable principal IDs and account boundaries | Verification rejected as non-independent |
| Latest object hides earlier generation | List all versions and fetch pinned generation | Unexpected versions detected; pinned generation remains verifiable |
| Provider reports false checksum | Recompute digest from retrieved bytes | Verification fails |
| Missing page/object | Exhaust pagination and compare expected sequence set | Fail closed |
| Receipt replay or fork | Verify predecessor hash and sequence | Fail closed |
| Retention policy silently shortened | Query policy and inspect audit events over time | Alert and NO-GO |
| Audit log unavailable or incomplete | Simulate missing audit range | `RECONCILIATION_REQUIRED` |
| Backup restores stale data | Restore drill and compare generations/checkpoints | Recovery fails acceptance |
| Compromised writer credential | Scope test against storage admin and verifier operations | Writer remains create-only; revoke and reconcile |
| Cross-account control not independent | Inspect IAM ownership and admin principals | Reject provider configuration |

Tests must use synthetic objects and isolated test accounts. Do not run destructive delete/retention tests against any production evidence.

## 7. Provider selection scorecard

A provider evaluation must produce evidence, not marketing claims. Score each control as PASS, FAIL or NOT TESTED and attach a reproducible test/evidence reference.

- Separate account/project and independently managed administrative boundary.
- Conditional create with documented concurrency semantics.
- Immutable generation/version identifiers and exact-generation reads.
- Retention controls and administrative change audit.
- Read-only independent verifier principal.
- Comprehensive audit logs with separate export/retention.
- Backup/restore and documented recovery objectives.
- Monitoring and alert integration.
- Regional/data-residency, privacy, legal and cost review.
- SDK/API maturity, dependency posture and operational support.
- Evidence export and migration path if the provider is unavailable or discontinued.

Any NOT TESTED item in identity separation, conditional create, generation pinning, retention enforcement, audit completeness, independent read, or recovery is a release blocker. Do not select a provider based solely on convenience or an available free tier.

## 8. Operational runbooks required before integration

The future implementation must have reviewed runbooks for:
- normal checkpoint creation and independent verification;
- duplicate request and lost acknowledgement;
- delayed or unavailable storage;
- object mismatch, missing generation or chain fork;
- suspected credential compromise;
- policy/IAM/retention drift;
- audit log gap;
- backup restore and post-restore reconciliation;
- provider outage and controlled migration;
- evidence export for independent audit.

Every runbook must name responsible roles, escalation path, stop conditions, evidence to preserve and explicit prohibition on rerolling or silently repairing a published proof.

## 9. Acceptance gates

P1.6 is complete as a design artifact only. Production integration remains blocked until all gates pass:

- [ ] Provider selected after documented legal/privacy/cost/security review.
- [ ] Isolated provider test account created under explicit authorization.
- [ ] Writer/verifier/admin principals are distinct and independently administered.
- [ ] Conditional-create and exact-generation behavior independently tested.
- [ ] Retention policy reviewed; any irreversible lock separately approved.
- [ ] Provider audit coverage and separate export verified.
- [ ] Independent verifier implementation reviewed and reproducibly tested.
- [ ] Backup/restore drill completed with evidence.
- [ ] Monitoring and policy-drift alerts tested.
- [ ] Synthetic abuse-case suite passes against the actual provider test account.
- [ ] Failure/reconciliation runbooks reviewed.
- [ ] Threat model, API contract, identity architecture and release checklist updated.
- [ ] Separate human operator/reviewer/publisher identities demonstrated end-to-end.
- [ ] No unresolved `RECONCILIATION_REQUIRED` states.

A successful provider test does not establish participant roster completeness, eligibility correctness, fair winner selection, beacon authenticity, or dual-control independence. Those remain separate release gates.

## 10. Current decision

**P1.6 design: ready for review. Real provider integration: NOT STARTED. Official winner draw: NO-GO. Roulette: SIMULATION ONLY.**

No cloud project, storage bucket, service account, IAM policy, retention policy/lock, credential, backup, monitoring resource, production data, Apps Script deployment or live system was created or changed in this phase.
