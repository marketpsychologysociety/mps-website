# MPS P1.8 — GCS-First Isolated Evidence-Storage PoC Plan

**Status:** Execution plan only; no Google Cloud project, bucket, identity, policy, billing account, or resource provisioned.  
**Branch:** `mps-v4.8-workbench`  
**Production impact:** None.  
**Provider decision:** GCS is the conditional first PoC candidate, not yet an approved production provider.  
**Official draw:** BLOCKED / NO-GO. Frontend roulette: SIMULATION ONLY.

## 1. Objective and strict scope

P1.8 converts the P1.6 provider-neutral architecture and P1.7 desk evaluation into a testable, isolated Google Cloud Storage proof-of-concept plan.

The PoC must answer whether GCS can provide:
- create-only evidence writes with explicit generation preconditions;
- exact-generation readback and independent verification;
- meaningful separation between writer, verifier, storage administrator and recovery operator;
- sufficiently complete Cloud Audit Logs, including explicitly enabled Data Access logs;
- reviewed retention behavior without enabling irreversible Bucket Lock;
- reproducible backup/restore and failure reconciliation.

The PoC uses synthetic protocol records and fake participant references only. It is not a live MPS integration, does not validate participant eligibility or roster completeness, does not implement winner selection, and cannot authorize a draw or publication.

**No provisioning is authorized by this plan.** Do not create a project, enable billing, create a bucket/service account, grant IAM, configure audit sinks, set retention, generate credentials, connect Apps Script, or touch production. Any such action requires a separate explicit approval after ownership, region, budget, retention and identity boundaries are confirmed.

## 2. Required administrative boundary

Preferred layout:
1. A dedicated Google Cloud project created solely for the evidence PoC, not the MPS website/Apps Script project.
2. Project ownership held by a separately identified security/storage administrator group, not the draw operator or MPS website maintainer by default.
3. Billing ownership and budget alerts visible to the accountable project owner.
4. Audit evidence routed to a separate logging destination or security project whose administrators are not the bucket writer or draw operator.
5. No shared service account, credential, secret store, recovery identity or administrator between writer and verifier.

Do not assume that a different service-account name or IAM role creates independent control. Record immutable principal identifiers and the actual human/admin ownership of each identity.

### Principal matrix

| Principal | Intended minimum capability | Explicitly excluded |
|---|---|---|
| Evidence writer workload identity | Create new objects under one dedicated prefix | Get/list, delete, overwrite, metadata update, bucket/IAM/retention/logging administration |
| Independent verifier | Read/list exact evidence generations and inspect approved audit evidence | Create, update, delete, retention or IAM changes |
| Storage administrator | Provision bucket and maintain approved storage policy | Draw operation, reviewer approval, winner selection or publication |
| Audit/security administrator | Configure/read/export audit evidence and investigate policy drift | Draw operation and evidence object mutation |
| Backup/recovery operator | Execute documented backup/restore drill and report generation/checkpoint parity | Approve draws, alter source evidence, or silently replace source objects |

Where the chosen GCP organization cannot demonstrate a genuinely separate administrative boundary, record the limitation and stop: the PoC must not be described as independently administered.

## 3. GCS object contract

### 3.1 Create-only write

- Use the Cloud Storage JSON API object insert/upload path with `ifGenerationMatch=0` for every create.
- Treat HTTP 412 as an existing-live-object/precondition conflict, not as permission to choose a new key or overwrite.
- Use a deterministic, opaque key derived from event ID and monotonically increasing checkpoint sequence. Do not place member names, IDs, email, phone, Telegram, MT5, deposit, PIN, proof-document reference or tokens in object names.
- Bind the request to exact canonical bytes and a durable idempotency reference. A retry must use the identical key and identical bytes.
- The writer principal must not have delete, get/list, metadata-update, bucket, IAM, retention or logging permissions. Do not grant a broad Storage Admin/Editor role.
- A separate verifier performs readback and checks the exact generation. Avoid giving the writer read access merely for convenience.

Important semantic caveat: GCS documents that `ifGenerationMatch=0` succeeds when there is no live object with that name, including the case where only noncurrent versions remain. Therefore, the precondition is not a substitute for retention controls or protection against a privileged administrator deleting a live object. The PoC must test delete/recreate and version-history behavior explicitly.

### 3.2 Generation and metadata

- Persist the returned object `generation` as an opaque decimal string; never parse it into a JavaScript floating-point number.
- Capture `metageneration`, size, CRC32C/MD5 where applicable, server creation time, retention fields and bucket identity.
- Retrieve the exact generation, not just the current live object.
- Compare the canonical bytes and locally recomputed SHA-256; provider checksum is an additional integrity signal, not the sole proof.
- Metadata is not uniformly immutable. Treat mutable metadata as untrusted, pin metageneration when reading/checking it, and keep the authoritative protocol digest inside the canonical object bytes.
- Do not rely on Object Versioning as WORM protection. It can aid recovery, but versions can still be explicitly deleted by sufficiently privileged principals and bucket deletion is a separate risk.

### 3.3 Retention in PoC

- Begin with a disposable bucket and a short, unlocked retention policy only after the project owner approves the test.
- Verify object retention behavior and permission boundaries using synthetic data.
- Do not enable Bucket Lock, locked object retention, legal hold, or any irreversible retention setting during this PoC.
- Record the consequences of retention changes, deletion, versioning, soft delete, lifecycle policies and bucket deletion. Do not assume Object Versioning or soft delete is an immutable evidence guarantee.
- A production retention duration and any lock require separate legal, financial, recovery and governance approval.

## 4. Audit evidence requirements

Cloud Audit Logs are part of the acceptance test, not an assumed default:
- Admin Activity logs are enabled by default for relevant administrative actions.
- Cloud Storage Data Access logs are disabled by default and must be explicitly enabled for the required service and permission types.
- Test `ADMIN_READ`, `DATA_READ` and `DATA_WRITE` coverage as applicable to object metadata, object reads/writes, delete attempts and relevant operations.
- Test bucket/IAM/retention configuration changes and identify which audit log category records each.
- Verify whether denied attempts are recorded for each operation; do not assume every denied call produces the desired evidence.
- Export the required logs to a separately administered destination with independent retention and access control. A sink in the same project under the same administrators is not sufficient by itself.
- Confirm audit query permissions for the independent reviewer. Data Access logs may require the Private Logs Viewer role or a narrower reviewed custom role.
- Measure log volume and estimate Cloud Logging charges before enabling broad logging. Enable only the scope approved for the PoC, and do not exempt the writer or administrator principals from required logging.

Acceptance requires evidence of both expected successful events and relevant denied/administrative events, including principal identity, resource, method, timestamp and outcome where the platform records them. Missing or ambiguous audit evidence is a fail, not a pass.

## 5. Canonical synthetic object envelope

The test object contains only:
- protocol/schema version;
- synthetic event reference such as `evt-test-0001`;
- checkpoint sequence;
- previous journal hash;
- current journal hash;
- previous receipt hash;
- opaque operation/idempotency reference;
- rules/protocol version identifier;
- creation intent timestamp supplied by the test harness.

Use unmistakably synthetic values. Do not copy or hash real member rows into the PoC. A hash of private member data can still create privacy and correlation risks; it is prohibited in this phase.

## 6. PoC test matrix

Each test must record: test ID, exact principal, request, expected result, actual result, object generation/metageneration, audit reference, timestamp, and independent reviewer sign-off. Run only in a disposable test bucket.

| ID | Test | Expected result / evidence |
|---|---|---|
| GCS-01 | Create object with `ifGenerationMatch=0` | One object created; generation and server timestamp captured |
| GCS-02 | Two concurrent writes to same key with same bytes | Exactly one create succeeds; loser receives precondition conflict and reconciles to the same exact generation |
| GCS-03 | Retry after simulated lost acknowledgement | No duplicate generation or second logical checkpoint; verifier reconciles original object |
| GCS-04 | Same key, different bytes | Conflict; no overwrite and no alternate key/reroll |
| GCS-05 | Read exact generation | Returned bytes match canonical digest; generation pinned |
| GCS-06 | Metadata mutation attempt | Writer denied; verifier detects unexpected metageneration/metadata drift |
| GCS-07 | Writer attempts get/list/delete | Denied according to IAM design; capture actual audit evidence and confirm writer cannot enumerate or remove evidence |
| GCS-08 | Writer attempts bucket/IAM/retention/logging change | Denied; administrator-only boundary demonstrated |
| GCS-09 | Verifier attempts create/update/delete | Denied; verifier remains read-only |
| GCS-10 | Same human/service identity presented as writer and verifier | Independence check rejects the configuration |
| GCS-11 | Delete live object then recreate same key with generation-match 0 | Demonstrate the documented caveat; confirm only approved retention/admin controls prevent unauthorized delete/recreate |
| GCS-12 | Enumerate all objects and pages | Pagination exhausted; exact sequence set has no gaps, duplicates or unexpected keys |
| GCS-13 | Alter local expected digest or supply mismatched bytes | Independent verifier fails closed |
| GCS-14 | Disable/miss Data Access audit coverage in a disposable configuration | Readiness gate detects missing logs and fails |
| GCS-15 | Inspect audit evidence for create/read/delete-denial/policy changes | Required events and principal identities are present or gaps explicitly fail |
| GCS-16 | Attempt lifecycle/versioning/soft-delete changes | Only administrator can change settings; consequences and audit trail recorded |
| GCS-17 | Backup/restore to separately controlled destination | Restored exact generations and canonical digests match; restore actor and evidence recorded |
| GCS-18 | Simulate provider timeout after write | State becomes reconciliation-required until independent read resolves it |
| GCS-19 | Missing object, wrong generation or forked receipt | Verification fails closed; no replacement or reroll |
| GCS-20 | Cost, region and retention review | Written approval and observed estimates recorded before any longer test |

A test is not passed because an SDK mock returns the expected status. The key acceptance tests must run against the actual disposable GCS project after separate provisioning approval. Local synthetic tests may validate canonicalization, retry logic and failure-state handling, but must be labelled as simulations.

## 7. Operational sequence and stop conditions

### Stage A — prerequisites (no cloud changes)
- Identify the legal owner and accountable administrator of the proposed Google Cloud organization/project.
- Confirm whether a genuinely separate project and administrator group are available.
- Choose region only after data-residency/privacy review.
- Approve a hard PoC spending ceiling, billing alerts and log-volume estimate.
- Define short test retention and deletion/cleanup method for disposable synthetic objects.
- Confirm named writer, verifier, storage admin, audit admin and recovery operator are distinct people/administrative principals.
- Review GCS API/SDK version, dependency pinning and build provenance.

**Stop** if ownership, billing, region, retention, identity separation or authorization is unclear.

### Stage B — separately authorized provisioning
Only after a separate explicit approval:
- create the dedicated PoC project under the approved administrative boundary;
- set budget alerts and least-privilege project controls;
- create a disposable private bucket in the approved region;
- configure only the approved short unlocked retention and required audit logs;
- create distinct test principals and narrowly scoped custom roles;
- configure an independently administered audit destination;
- record configuration snapshots and project/bucket identifiers in the PoC evidence log.

Do not create or use production identities, Apps Script identities, or member-data access.

### Stage C — actual-provider conformance tests
- Run GCS-01 through GCS-20 in the disposable project.
- Have the independent verifier reproduce all object digests and sequence checks.
- Review IAM policy snapshots, audit logs, retention behavior and backup/restore evidence.
- Record failures and remediation; rerun affected tests from a clean disposable fixture.
- No production endpoint or draw API is connected.

### Stage D — decision
The PoC outcome is one of:
- **PASS WITH LIMITATIONS:** all critical controls pass; residual caveats are explicit and reviewed.
- **FAIL:** any critical create-only, generation, identity, audit, retention or recovery control fails.
- **INCONCLUSIVE:** required evidence is missing or ambiguous.

Even a PASS does not select GCS for production automatically. A separate provider-selection and integration approval is required.

## 8. Cost, privacy and lifecycle controls

Before provisioning, produce a simple estimate covering:
- bucket storage class and expected object volume;
- write/read/list operations;
- Cloud Logging Data Access volume and retention;
- cross-project log routing and storage;
- backup/replication and restore tests;
- network egress and support costs;
- cleanup and retained test data.

No free-tier assumption is permitted. The project owner must approve a hard spending cap and billing alerts. Do not create billing resources or enable billing as part of this design phase.

## 9. Release blockers and explicit non-actions

The following remain outside P1.8:
- real MPS participant roster, member IDs or private data;
- production Apps Script, Sheets, Drive, Script Properties, Telegram or website;
- production Draw API or winner selection;
- real beacon rounds or signature verification;
- official winner publication;
- Bucket Lock or irreversible retention;
- production identity provider, workload identity or credentials;
- production backup, logging or monitoring resources.

The official draw remains **BLOCKED / NO-GO** until the independent identity, durable state, journal, external evidence, cryptographic beacon verification, unbiased selection, privacy, dual-control, audit and recovery gates are all implemented and independently tested. Roulette remains **SIMULATION ONLY**.

## 10. Current P1.8 decision

**Plan status:** ready for prerequisite/ownership review.  
**GCS provisioning:** NOT STARTED; explicit approval required.  
**Actual-provider tests:** NOT STARTED.  
**Production integration:** NOT AUTHORIZED.  
**Production impact:** none.

No cloud project, bucket, service account, IAM binding, audit sink, retention policy, credential, billing configuration, production data access or live integration was created or changed.
