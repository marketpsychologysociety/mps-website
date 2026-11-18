# MPS P1.16 — Off-site Backup Architecture & Recovery Drill Contract

**Status:** architecture and offline evidence-contract implementation only.  
**Branch:** `mps-v4.8-workbench`.  
**Production impact:** none.  
**Cloud provisioning:** not started and not authorized.  
**Official draw:** BLOCKED / NO-GO; roulette remains SIMULATION ONLY.

## 1. Objective

P1.15 demonstrated local backup/restore mechanics but did not establish independent disaster recovery. P1.16 defines what a separately administered off-site backup and recovery drill must prove before any provider integration can be considered.

The intended trust boundaries are:

- source evidence account/project;
- backup account/project under a separately accountable administrator;
- audit evidence destination administered independently from source and backup writers;
- distinct human/service subjects for source writer, backup writer, recovery operator, independent verifier, storage administrator and audit administrator;
- a recovery target isolated from the live source.

The backup must be in a different account, project and region from the source for this contract. A second bucket in the same project, a second folder, a versioned copy, or a second service-account name is not sufficient evidence of administrative independence.

## 2. Provider-neutral architecture

### 2.1 Data path

1. Stop source writers and establish a source checkpoint from an independently trusted source.
2. Export the exact journal/evidence generation and its canonical digest; do not export participant PII or member records.
3. A separately controlled backup writer transfers exact bytes to a create-only object key in the backup account/project.
4. Capture provider object generation/version, provider checksum, server timestamp, encryption-key reference and retention metadata.
5. An independent verifier reads the exact generation and independently recomputes the canonical payload digest.
6. Export audit evidence to a third administrative boundary. Exhaust all result pages and retain query scope, principal, time window and retrieval provenance.
7. Recovery operator restores the exact generation to a new isolated target; never overwrite source.
8. Independent verifier checks byte digest, journal sequence/hash checkpoint, source-before/source-after equality, audit trail and measured RPO/RTO.
9. Preserve drill evidence and record pass/fail, exceptions and sign-offs. Any mismatch or missing evidence is a failed drill.

### 2.2 Required identity separation

The evidence package records six distinct roles:

| Role | Responsibility | Must not be able to |
|---|---|---|
| Source writer | Create source evidence | Administer backup, audit or approve recovery |
| Backup writer | Copy evidence to off-site destination | Alter source, verify its own copy, administer retention |
| Recovery operator | Execute isolated restore | Overwrite source or approve its own result |
| Independent verifier | Read exact backup and restored bytes | Write, delete or administer storage |
| Storage administrator | Manage storage, retention and encryption policy | Operate draw or verify own administrative changes |
| Audit administrator | Export and preserve audit evidence | Mutate source/backup evidence or self-approve audit completeness |

Subjects, administrator boundaries and account boundaries must be evidenced, not inferred from role labels. MFA/step-up assurance must be independently verified. Distinct service-account names do not establish distinct human control.

### 2.3 Storage and retention

- Use create-only writes and pin exact provider generation/version identifiers.
- Preserve canonical bytes and verify SHA-256 independently; provider checksums are additional signals.
- Use encryption at rest and a separately governed key-management boundary. Record key identity/version and prove recovery access without exposing key material.
- Require an approved immutable retention control for official evidence. A retention label or manifest field is not proof that the provider enforced it.
- Test restore from the exact retained generation and verify that delete/recreate, lifecycle, metadata, key revocation and administrator actions cannot silently invalidate evidence.
- Keep audit exports in a third administrative boundary with independent retention and access logs.
- No retention lock is created in P1.16. A real compliance lock may be irreversible and requires explicit legal, financial and governance approval.

## 3. Recovery drill contract

Offline module: `tests/official-draw/offsite-recovery-drill-contract.mjs`

The normalizer requires a strict evidence envelope containing:
- synthetic drill ID and schema version;
- source provider/account/project/region, sequence, final journal hash, payload digest and byte count;
- backup provider/account/project/region, opaque object key, exact generation, payload/object digests, encryption-key reference and retention evidence;
- six distinct privileged identities with subject, admin boundary, account boundary and MFA attestation;
- restore-to-new-target, no-overwrite, exact-generation read, source-preservation and independent-readback assertions;
- audit coverage for writer create, recovery read, independent verifier readback, denied source delete, policy change, independent export and complete pagination;
- drill timestamps, duration and observed RPO/RTO;
- an independently established expected source checkpoint supplied out-of-band to the verifier.

The validator fails closed on missing fields, unknown fields, shared identities/admin boundaries, same source/backup account or project, same region, non-locked or expired retention evidence, content/checkpoint mismatch, source mutation, overwrite, incomplete audit coverage, missed RPO/RTO, or wrong expected checkpoint.

Default validator ceilings (RTO 3,600 seconds; RPO 86,400 seconds) are test-contract defaults only. They are not approved MPS service objectives. A real drill must set targets based on business continuity, legal requirements, budget, provider capability and explicit owner approval.

## 4. Synthetic test coverage

The CI suite includes positive and negative fixtures for:
1. complete synthetic off-site recovery drill;
2. same source/backup account or project;
3. same-region backup;
4. non-locked retention;
5. duplicate human subject;
6. shared administrator boundary;
7. missing MFA assurance;
8. payload digest mismatch;
9. restore overwrite or unsafe target;
10. restore checkpoint fork/source mismatch;
11. incomplete audit export/coverage;
12. RTO/RPO objective miss;
13. wrong independently expected source checkpoint;
14. malformed timing/unknown fields;
15. missing expected checkpoint;
16. retention expiring before drill completion.

Run: `node --test tests/official-draw/offsite-recovery-drill-contract.test.mjs`.

## 5. Evidence and trust limitations

This module validates the shape and internal consistency of a normalized evidence bundle. It does **not**:
- connect to or authenticate any cloud provider;
- prove that account/project ownership or administrator boundaries are real;
- authenticate MFA, OIDC, IAM, KMS or audit log exports;
- prove retention policy enforcement or encryption/key recoverability;
- prove that audit pagination is complete or source logs are genuine;
- establish that the supplied expected checkpoint is authoritative;
- measure actual provider restore performance;
- prove off-site resilience, ransomware resistance, regional independence or disaster recovery.

A synthetic field such as `independent_export: true`, `COMPLIANCE_LOCKED`, or `mfa_attested: true` is a test assertion, not cryptographic/provider evidence. Real acceptance requires independently authenticated provider API reads, raw audit logs, signed reviewer attestations bound to the exact evidence, independently pinned trust records and separate human sign-off.

## 6. Provisioning and operational gates

No cloud action is part of P1.16. Before a real isolated PoC, obtain explicit approval for:
- named legal/resource owner and administrator groups;
- provider, separate account/project and region;
- budget ceiling, billing alerts and logging cost estimate;
- data classification, retention duration, deletion and legal hold policy;
- identity provider, MFA, immutable subject mapping and break-glass governance;
- encryption/KMS ownership, recovery procedure and key-rotation testing;
- audit export destination, independent access and evidence retention;
- approved RPO/RTO targets and restore drill window;
- named operators/reviewers and incident escalation.

Do not create projects, buckets, IAM, service accounts, KMS keys, log sinks, billing resources, retention locks, credentials or production integrations until a separate explicit authorization is given. Do not use live member data.

## 7. Exit criteria

P1.16 is complete only as a provider-neutral architecture and synthetic evidence-contract stage after clean-checkout CI passes. Actual off-site backup, provider IAM, authenticated audit evidence, retention enforcement, key recovery and restore drills remain NOT STARTED.

**Official winner draw remains BLOCKED / NO-GO. MPS Lucky Roulette remains SIMULATION ONLY.**
