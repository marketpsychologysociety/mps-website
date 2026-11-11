# Reviewer Trust Registry — Ownerless Lock Recovery Runbook

**Status:** isolated workbench / synthetic local-filesystem test guidance only.  
**Not approved for production use.** This procedure is not a substitute for a production incident-response policy, distributed lock service, or transactional storage.

## Purpose and trigger

Use this runbook only when the synthetic reviewer trust registry returns `LOCK_RECOVERY_REQUIRED` because `reviewer-trust.lock` exists but a verifiable `owner.json` is absent or malformed.

An ownerless lock is ambiguous. It may be an abandoned directory left by a process crash, or a live process may be between atomic directory creation and owner-record creation. **Never automatically delete, rename, or steal it based only on a missing owner file.**

## Mandatory stop conditions

Stop and leave the registry unavailable if any of these apply:

- The host, filesystem type, registry directory, or service owner is uncertain.
- Any process may still be creating or using the registry lock.
- The environment is multi-host, network-mounted, container-shared, or otherwise outside the tested same-host local-filesystem model.
- The journal cannot be copied or independently validated.
- There is no authorized operator able to preserve evidence and approve the recovery.
- The incident may involve tampering, unexpected permissions, or an unexplained journal change.

Do not run repeated retries, delete the lock directory, edit the journal, or restart multiple writers to “see if it clears”.

## Controlled recovery sequence

1. **Stop new work.** Disable the synthetic caller and stop the single test service through its normal supervisor. Do not kill unrelated processes. Record the error, UTC time, host identity, service identity, and registry path.
2. **Establish quiescence.** Confirm through the service supervisor and process inspection that no registry writer or worker remains active on the host. Check open handles where the operating system supports it. If a process may still be in lock initialization, wait for the bounded initialization window and investigate; do not proceed on assumption.
3. **Preserve evidence.** Copy the entire registry directory, including the journal and lock directory, to a restricted incident-evidence location on the same controlled host. Record file metadata and permissions, and calculate SHA-256 hashes for the copied journal and lock metadata. Keep the original untouched.
4. **Inspect the lock.** Record whether `owner.json` is absent, malformed, or has unexpected fields. Do not modify the original lock contents. A PID alone is not proof of ownership; hostname, process identity, service state, and the registry path must agree.
5. **Validate a working copy.** Make a separate disposable copy of the preserved registry data, excluding only the copied lock directory from this validation copy. Open the copied registry with the synthetic test harness in read-only/no-mutation mode where available, or use the approved verifier. Confirm the complete journal parses, sequence numbers and hash chain validate, and the expected record count/last hash match the evidence manifest. If no non-mutating verifier is available, stop; do not improvise against the original.
6. **Authorize quarantine.** A second authorized reviewer confirms the service is stopped, no writer is active, evidence is preserved, and the validation copy is sound. Record both reviewers and the decision in the incident record. This is a manual control, not implemented identity assurance in the prototype.
7. **Quarantine, never erase.** Only after the above checks, atomically rename the original ownerless lock directory to a unique quarantine name on the same filesystem. Do not delete it. If the rename fails or a new lock appears, stop and investigate.
8. **Single-writer restart.** Start exactly one synthetic registry process. Confirm it creates a fresh owner record, reads the unchanged journal, and reports the same record count and last hash as the validated copy. Do not enable caller traffic until this readback is independently checked.
9. **Close and retain.** Preserve the quarantined lock and incident evidence according to the test environment's retention rules. Record the recovery outcome, hashes, operator/reviewer identities, and any deviations. If any check differs, stop the service and move to reconciliation; do not rewrite or truncate the journal.

## Recovery outcome states

- **RECOVERED:** evidence preserved, two-person review completed, journal independently validated, old lock quarantined, and single-writer readback matches.
- **RECONCILIATION_REQUIRED:** any uncertainty, mismatch, malformed journal, unknown writer, or incomplete evidence. Keep the service stopped.
- **NOT_APPLICABLE:** the environment is not the synthetic same-host local-filesystem test setup. Do not use this procedure.

## Explicit limitations

This runbook does not establish production-grade identity, independent two-person authentication, distributed locking, multi-host safety, network-filesystem semantics, power-loss durability, immutable audit retention, backup/restore, or tamper-proof evidence. The current registry is a synthetic test harness. No production or GCP resource is authorized by this document.
