# MPS P1.7 — External Evidence Provider Candidate Evaluation

**Status:** Desk evaluation from current official product documentation; no provider selected, tested, or provisioned.  
**Branch:** `mps-v4.8-workbench` only.  
**Production impact:** None.  
**Official draw:** NO-GO. **Roulette:** SIMULATION ONLY.

## 1. Decision summary

Three viable object-storage families were compared against the P1.6 requirements:

1. Google Cloud Storage (GCS): strongest initial proof-of-concept candidate for testing the required create-only semantics because its JSON API supports `ifGenerationMatch=0`, and it provides generation identifiers and Bucket Lock. This is a **conditional PoC recommendation**, not a provider selection or a claim that it is inherently more secure.
2. Amazon S3: strong alternative with S3 Object Lock Compliance mode, version IDs, and conditional `If-None-Match: *` writes. Its delete-marker behavior needs explicit design and deny policies; a protected object version can remain intact while a simple DELETE creates a new current delete marker.
3. Azure Blob Storage: viable alternative with conditional `If-None-Match: *`, blob version IDs, and version-level WORM. Its audit evidence needs particular care: Microsoft documents that changes to version-level retention/legal-hold policies are not audited by the container policy audit log.

**No final selection is justified yet.** Pricing, regional availability/data residency, account ownership, organization policy, independent administrator availability, operational skills, legal retention period, recovery requirements and actual tenant entitlements have not been assessed. Those facts can change the result.

## 2. Capability comparison

| Requirement | Google Cloud Storage | Amazon S3 | Azure Blob Storage |
|---|---|---|---|
| Conditional create | JSON API `ifGenerationMatch=0` succeeds only when no live object exists | `If-None-Match: *` conditional writes | `If-None-Match: *` supported for write operations |
| Stable object identity | Generation and metageneration | Version ID | Blob version ID |
| Retention / WORM | Bucket Lock; Object Retention Lock | S3 Object Lock Governance / Compliance; legal hold | Container/account/version-level time-based WORM; legal hold |
| Irreversible retention control | Locked bucket policy cannot be reduced/removed | Compliance-mode object retention cannot be shortened/bypassed; Object Lock cannot be disabled after enablement | Locked time-based immutability policy cannot be shortened/removed |
| Audit evidence | Cloud Audit Logs; Data Access logs must be explicitly enabled for object data operations | CloudTrail data events must be configured for object-level evidence; management and data events are distinct | Azure Activity Log for management plane; resource logs for data operations; persist/export required |
| Important caveat | Object metadata remains editable under bucket retention; verify bytes and metadata/generation separately | Delete markers are not WORM-protected and can hide a retained version; conditional write checks current version | Version-level retention changes are not covered by the container policy audit log; audit gap must be compensated |
| Initial status | Candidate A for isolated PoC only | Candidate B | Candidate C |

## 3. Google Cloud Storage — candidate A

**Relevant official documentation**
- Request preconditions: https://cloud.google.com/storage/docs/request-preconditions
- Bucket Lock: https://cloud.google.com/storage/docs/bucket-lock
- Detailed audit logging / Cloud Audit Logs: https://cloud.google.com/storage/docs/audit-logging

**Strengths**
- `ifGenerationMatch=0` is a native create-only precondition: the write proceeds only if no live object with that name exists; otherwise it fails with 412.
- Generation and metageneration identifiers support exact object-state pinning and conditional metadata operations.
- Bucket retention policy can prevent object deletion/replacement during the retention period; locking prevents later reduction/removal.
- Audit logs distinguish Admin Activity and Data Access. Data Access logs for object data reads/writes must be explicitly enabled.

**Risks and required mitigations**
- Bucket Lock is irreversible. It must not be enabled until retention duration, ownership, legal/privacy, cost, incident response, deletion exceptions and recovery have been reviewed and approved.
- Bucket retention does not freeze editable object metadata. The verifier must validate the retrieved object bytes, generation, metageneration, checksum and critical metadata; metadata changes must be audited and cause a reconciliation state if unexpected.
- Enable and test Data Access logging, export logs to a separately administered destination, and prove retention of the logs themselves.
- Use a separate project or equivalent administrative boundary for evidence storage. A second service account inside the same administrator's control is not sufficient by itself.
- Verify exact-generation reads and object listing with pagination in an independently authenticated verifier identity.

**Assessment:** Best first PoC target for validating the create-only API mapping and GCS generation semantics, conditional on separate project ownership and audit export being achievable. This is not approval to create a project or bucket.

## 4. Amazon S3 — candidate B

**Relevant official documentation**
- Conditional writes: https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html
- Object Lock: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html
- Object Lock considerations and delete markers: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-managing.html
- Versioning: https://docs.aws.amazon.com/AmazonS3/latest/userguide/versioning-workflows.html

**Strengths**
- `If-None-Match: *` prevents overwriting an existing current object; concurrent conditional writers result in one success and a precondition failure for the others.
- Version IDs support retrieval and inspection of a specific object version.
- Compliance mode protects a retained object version from deletion or shortening, including by the account root user, during the retention period.
- Governance mode is useful for reversible isolated tests but must not be mistaken for Compliance mode.

**Risks and required mitigations**
- Object Lock requires bucket versioning and cannot be disabled after enabled.
- A simple DELETE can create a delete marker even when the underlying object version is protected; delete markers themselves are not WORM-protected. A writer role must have no delete permissions, and policy must prevent unapproved marker creation.
- Conditional `If-None-Match` evaluates the current version. The key design and policy must prevent a delete marker or versioning change from making a previously used key writable again.
- Use exact version IDs for verification; do not rely on an unqualified “latest” object read.
- Configure CloudTrail S3 data events and independently retain/export them; management events alone do not provide complete object-operation evidence.

**Assessment:** Strong alternative where an independently administered AWS account and mature S3 operations already exist. Requires careful delete-marker and versioning controls.

## 5. Azure Blob Storage — candidate C

**Relevant official documentation**
- Immutable storage overview: https://learn.microsoft.com/en-us/azure/storage/blobs/immutable-storage-overview
- Version-level WORM: https://learn.microsoft.com/en-us/azure/storage/blobs/immutable-version-level-worm-policies
- Conditional headers: https://learn.microsoft.com/en-us/rest/api/storageservices/specifying-conditional-headers-for-blob-service-operations
- Blob versioning: https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-overview

**Strengths**
- `If-None-Match: *` can make a write conditional on the blob not already existing.
- Blob version IDs allow a verifier to retrieve a specific prior version.
- Version-level WORM policies can protect individual versions, with account/container-level defaults available.
- Time-based retention and legal hold are supported.

**Risks and required mitigations**
- Versioning is required for version-level WORM and can increase storage costs because each write creates a new version.
- A locked policy cannot be shortened or removed. Any lock requires separate governance approval.
- Microsoft documents that changes to version-level retention policies are not audited by the container policy audit log. Do not treat that log as complete evidence; require additional control-plane monitoring and independently exported resource logs.
- Azure Activity Log covers management activity; data-operation resource logs need configuration and persistent export.
- Test exact-version reads, conditional creation, retention enforcement, restore behavior and the complete audit trail in a separate account/subscription.

**Assessment:** Viable where an independently controlled Azure subscription and operational expertise already exist. The version-level policy audit gap is a material acceptance item.

## 6. Preliminary recommendation

Proceed to a **GCS-first isolated PoC design**, with S3 as the fallback comparator, only if all of the following can be demonstrated before provisioning:
- A separate project/account can be owned and administered by a security group independent of MPS draw operators.
- A writer identity can be limited to create-only object writes and narrowly scoped read-back, with no delete, retention, IAM, logging, key or project administration permissions.
- A verifier identity is separately managed, read-only, and able to list every expected object and read exact generations.
- Data Access logs can be enabled and exported to a separately controlled destination.
- An unlocked test retention policy can be exercised without enabling an irreversible lock.
- Legal/privacy review approves the object fields and retention period.
- Budget, regional location, residency, recovery objectives and support ownership are documented.

If any prerequisite fails, do not force GCS as the answer. Re-score S3 and Azure against the same controls. Provider familiarity alone is not a security control.

## 7. Mandatory PoC test matrix

Use synthetic payloads only, in an isolated test account/project. No live MPS data, credentials or production endpoints.

| Test | Method | Required result |
|---|---|---|
| Create-only | Two concurrent writers use same key with different payloads | Exactly one object creation; loser cannot overwrite |
| Retry | Repeat same request after simulated lost acknowledgement | Read/reconcile exact existing generation; no second object |
| Conflict | Same key, different canonical bytes | Hard conflict; no overwrite or silent new “winner” |
| Generation pinning | Read exact version/generation after a later unauthorized write attempt | Original generation remains retrievable; unexpected generation flagged |
| Delete attempt | Writer tries object delete and version delete | Permission denied and audit evidence present |
| Retention change | Writer tries to alter retention policy | Permission denied and alert/audit event present |
| IAM escalation | Writer tries to change roles/policy | Permission denied and separately logged |
| Independent identity | Verifier reads using its own principal | Principal and account boundary independently confirmed |
| Audit completeness | Perform allowed and denied data/admin operations | Expected records appear in separately controlled audit destination |
| Pagination | Create enough synthetic records to cross list pages | Full sequence enumerated; missing page/object fails closed |
| Tamper | Alter bytes/metadata in disposable test object where policy permits | Digest, generation or metadata mismatch detected |
| Backup restore | Restore to isolated recovery destination | Exact generations, hashes and chain independently verified |
| Policy drift | Change a test policy using admin identity | Independent alert and evidence; writer cannot perform change |
| Retention expiry | Wait/test with short disposable policy | Expiry behavior matches policy; no early delete |

The test must record provider request IDs, immutable principal identifiers, object generation/version IDs, hashes, audit references and exact test account identifiers. Never place credentials or participant data in test reports.

## 8. Cost, residency and governance items not yet scored

No price or regional claim is made in this document. Before provider selection, obtain current quotes and document:
- storage, request, retrieval, egress, audit-log ingestion/export, backup/replication and support charges;
- region availability and data residency requirements;
- retention period and lawful basis for retained evidence;
- ownership and billing account control;
- incident response and key-loss/recovery responsibilities;
- operational skills, support coverage and exit/migration strategy.

The cheapest storage tier is not necessarily the lowest-risk design. Long retention, audit export, replication and restore testing can dominate total cost.

## 9. Explicit non-actions and release gates

This evaluation did not:
- create or access any cloud account, project, bucket, subscription, storage account or resource;
- create service accounts, IAM roles, policies, credentials, keys or secrets;
- set retention, enable versioning, lock a policy, or configure audit logging;
- connect Apps Script, GitHub, Sheets, Drive, the public site or a live draw service;
- copy or process real member data.

A provider choice requires explicit user approval after security, legal/privacy, cost, regional and ownership review. Resource provisioning requires a separate explicit approval. Any irreversible retention lock requires a further separate approval.

**P1.7 result:** Desk comparison complete; GCS is the conditional first PoC candidate, S3 the fallback comparator, Azure the third candidate. Provider selection and PoC provisioning remain NOT STARTED. Official draw remains NO-GO; roulette remains SIMULATION ONLY.
