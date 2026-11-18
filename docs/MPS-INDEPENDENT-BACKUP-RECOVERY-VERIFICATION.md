# MPS P1.15 — Independent Backup & Recovery Verification (Synthetic Only)

## Purpose and boundary

This stage adds an offline, local-filesystem test harness for independent verification of a journal backup and safe restoration to a new path. It uses only synthetic test journal records. It is not a cloud backup service, disaster-recovery system, immutable archive, production journal, or proof that a backup is independent of the host that created it.

No GCP project, bucket, IAM policy, service account, credential, billing resource, retention lock, production database, member record, Apps Script deployment, or live service is created or changed.

## Implemented contract

Module: `tests/official-draw/synthetic-backup-recovery.mjs`

- Read the source journal without repairing, truncating, or otherwise modifying it.
- Require a newline-terminated journal; an incomplete trailing record is rejected, not silently discarded.
- Independently validate exact record fields, sequence, INTENT/COMPLETION relationship, idempotency uniqueness, result allowlist, SHA-256 record chain, and final checkpoint.
- Copy journal bytes to a unique staging directory using create-only file opens, fsync file contents and directory metadata, write a strict manifest, then atomically rename the staging directory to a unique backup ID.
- Manifest binds format version, opaque backup ID, sequence, final journal hash, SHA-256 of exact journal bytes, byte count, and creation timestamp.
- Verify a backup by checking real non-symlink paths, exact manifest schema, byte count, raw file digest, journal chain, and checkpoint agreement.
- Restore only after independent verification and caller-supplied current-checkpoint comparison.
- Reject a backup whose sequence is behind the current checkpoint or whose equal sequence has a different final hash.
- Restore only to a new, non-existing target using exclusive file creation; fsync and read back the exact checkpoint. Never overwrite an existing target or the source journal.
- Interrupted staging/restore artifacts are preserved for reconciliation. The harness does not automatically delete or overwrite uncertain evidence.

## Fault and abuse coverage

The synthetic tests cover:
1. valid create-only backup and manifest readback;
2. journal-byte tampering;
3. manifest alteration and unknown fields;
4. stale backup rejection after the current journal advances;
5. equal-sequence checkpoint conflict;
6. successful restore to a new target with exact byte/checkpoint comparison;
7. refusal to overwrite an existing target and preservation of source bytes;
8. interrupted backup publication leaving staging evidence but no published backup;
9. interrupted restore preserving a possibly partial target and refusing retry-overwrite;
10. incomplete source journal rejection without source mutation.

CI runs the suite through `tests/official-draw/synthetic-backup-recovery.test.mjs`.

## Recovery operator rules

- Stop writers before taking a backup or deciding which checkpoint is authoritative.
- Preserve source, backup, staging directories, manifests, and logs before investigation.
- Verify the backup first; do not restore from a failed or ambiguous verification.
- Compare against an independently established current checkpoint. Do not accept a caller-provided checkpoint as trustworthy merely because it is syntactically valid.
- Restore to a fresh, isolated destination. Do not restore over the live journal.
- If a target exists after an interrupted restore, stop and reconcile it; do not retry by overwriting.
- A local backup on the same host/device is not an independent disaster-recovery copy.

## Limitations and release gates

This is a same-host local-filesystem synthetic harness. It does not establish off-host independence, cloud provider identity, IAM separation, immutable retention, external audit anchoring, backup scheduling, encryption/key management, geographic redundancy, ransomware resistance, restore-time objectives, power-loss durability, filesystem/controller behavior, multi-host coordination, or operational readiness.

P1.15 is complete only as a synthetic contract and test harness after clean-checkout CI passes. Actual GCS provisioning, raw Cloud Audit Log retrieval, backup export to an independently administered account, recovery drills, and production integration remain unstarted and require separate explicit authorization.

**Official winner draw remains BLOCKED / NO-GO. MPS Lucky Roulette remains SIMULATION ONLY.**
