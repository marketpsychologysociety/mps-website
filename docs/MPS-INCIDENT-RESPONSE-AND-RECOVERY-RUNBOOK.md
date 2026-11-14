# MPS P1.18 — Incident Response & Recovery Runbook

**Status:** operational procedure design only; not activated against production.  
**Branch:** `mps-v4.8-workbench`.  
**Production impact:** none.  
**Live responders / notification channels:** not configured or tested.  
**Official draw:** BLOCKED / NO-GO; MPS Lucky Roulette remains SIMULATION ONLY.

## 1. Purpose and safety principles

This runbook defines how an authorized MPS incident team should contain, preserve evidence, assess scope, recover, independently verify and close backup-integrity or disaster-recovery incidents. It is a procedure, not evidence that monitoring, off-site backups, identity controls, notification delivery or recovery infrastructure currently exist.

Non-negotiable principles:

1. Protect people, member privacy and evidence before restoring service.
2. Stop destructive or ambiguous operations. Never overwrite, delete, rotate, purge, recreate or "repair" an evidence source to make a check pass.
3. Preserve source and backup bytes, exact object generations, timestamps, provider request IDs, audit exports, alert/outbox states and relevant hashes.
4. Do not treat a dashboard, normalized assertion, provider response, hash chain stored in the same trust boundary, or a green synthetic test as independent proof.
5. Require a distinct authorized reviewer for privileged recovery and closure. If independent review is unavailable, keep the incident open and restrict the action to safe containment.
6. Never expose member names, full member IDs, contact details, MT5 details, deposit/payment information, PINs, proof documents, tokens, keys or credentials in incident tickets, public status, or alert text.
7. No rollback or restore to production until source authority, target isolation, exact checkpoint, change window, approvals and rollback path are verified.
8. Any uncertainty about evidence integrity, identity, scope, or write outcome transitions to **RECONCILIATION_REQUIRED**.

## 2. Severity and response objectives

These are proposed operational classifications, not approved MPS SLA/SLO or contractual response-time commitments. A named incident owner must set actual targets before activation.

| Severity | Example | Immediate posture |
|---|---|---|
| SEV-1 Critical | suspected source compromise, backup tampering, key compromise, unauthorized deletion, evidence-chain break, restore affecting production unexpectedly | Stop privileged writes; preserve evidence; isolate affected credentials/workloads through approved incident authority; notify security leadership out-of-band |
| SEV-2 High | latest backup missing/stale, independent audit export gap, failed restore drill, retention expired, key recovery failure | Freeze risky changes; preserve current source; open incident; require independent reviewer before recovery |
| SEV-3 Moderate | retention nearing expiry, alert delivery retry/dead-letter, noncritical evidence lag with a separately verified current backup | Track owner and deadline; verify alternate evidence path; escalate if unresolved or threshold crossed |
| SEV-4 Low | documentation drift, test fixture issue, non-production CI regression with no evidence impact | Track as engineering issue; do not label as production incident without evidence |

## 3. Universal first-response checklist

### First responder
- [ ] Record incident ID, discovery time (UTC), detector/source, observed finding codes, affected environment and known checkpoint/generation identifiers.
- [ ] Record only opaque resource references and minimum necessary metadata; do not copy member data or secrets.
- [ ] Declare a severity with rationale and assign one incident commander.
- [ ] Pause relevant scheduled/automated writes only when an authorized owner can identify the exact control and safe pause procedure. Do not disable unrelated services.
- [ ] Preserve logs, manifests, audit exports, alert delivery receipts, provider request IDs and relevant state snapshots to a separate evidence location.
- [ ] Record hashes and byte counts; do not claim provenance until independently authenticated.
- [ ] Establish a second-person reviewer who did not initiate the affected operation.
- [ ] If source state, write outcome or identity is ambiguous, mark **RECONCILIATION_REQUIRED** and stop recovery writes.

### Incident commander
- [ ] Define scope, affected trust boundaries, last known-good checkpoint and potential confidentiality/integrity/availability impact.
- [ ] Decide whether read-only service can continue without risking further evidence loss.
- [ ] Approve containment and recovery plan; document alternatives rejected.
- [ ] Ensure status communications are factual, privacy-safe and do not claim restoration before independent verification.

## 4. Incident playbooks

### IR-01 — Backup missing or overdue
**Trigger:** no backup evidence for the expected interval, or the newest backup is stale.

1. Confirm the expected source checkpoint from an independently controlled record.
2. Check provider listing, exact object generation and audit trail using read-only access first.
3. Determine whether this is a collection/monitoring gap, failed write, delayed replication, deletion, or access-policy change.
4. Preserve provider responses and audit evidence; do not create a replacement object under the old checkpoint identity.
5. If no valid backup exists, raise SEV-2 or SEV-1 if source integrity is also in doubt. Restrict destructive maintenance and prioritize a new separately identified backup only after the source is verified and an authorized recovery plan is approved.
6. Close only after a new backup is independently read back, digest/checkpoint verified, retention verified and audit coverage reviewed.

**Never:** infer success from an upload request, local copy, or dashboard timestamp alone.

### IR-02 — Digest mismatch, manifest corruption, checkpoint fork or suspected tampering
**Trigger:** payload/manifest hash mismatch, same-sequence conflicting checkpoint, unexplained generation change, broken journal chain.

1. Treat as SEV-1 until integrity is disproved.
2. Freeze writes to the affected evidence namespace through the approved control plane; preserve the exact affected generations and logs.
3. Do not overwrite, delete, regenerate manifests, repair the journal, or recompute a chain in place.
4. Obtain independent copies and independently verify source checkpoint, raw bytes, object generation and audit trail.
5. Identify the last independently verified checkpoint and assess possible compromise of writer, storage admin, audit admin or recovery credentials.
6. Recover only into a new isolated target from a separately verified source; require two-person approval and readback.

**Never:** select the newest timestamp as authoritative when hashes/checkpoints conflict.

### IR-03 — Retention expired or nearing expiry
**Trigger:** retention deadline passed or warning threshold reached.

1. Determine exact object generation, policy mode, expiry time and whether any legal/contractual hold applies.
2. For near-expiry, escalate before expiry and obtain approval for a new independently verified protected copy.
3. For expired retention, assume deletion/modification protection is no longer established; classify SEV-2 or higher depending on exposure.
4. Preserve current provider policy and audit records. Do not enable irreversible retention locks or alter legal holds as an emergency shortcut.
5. Verify new retention metadata through an independent reviewer and confirm the correct generation is protected.

### IR-04 — Independent audit export missing, stale or incomplete
**Trigger:** pagination incomplete, missing Data Access events, failed export, unexplained principal/action gap.

1. Treat the relevant evidence as unauthenticated/incomplete; do not infer that no action occurred.
2. Preserve query, time window, source project/account, retrieval principal, page tokens, raw response bytes and export hashes.
3. Repeat read-only retrieval only under a separately approved reviewer identity; record exact query and complete pagination.
4. Compare audit coverage with object generations, writer/verifier/storage-admin actions and known incident timestamps.
5. If source authenticity cannot be independently established, keep the incident open and mark **RECONCILIATION_REQUIRED**.

**Never:** normalize incomplete pages into a "complete" export or treat a signed reviewer assertion as proof that Google/provider logs themselves were signed.

### IR-05 — Restore drill failed, RPO/RTO missed, or production restore is ambiguous
**Trigger:** restore checksum/checkpoint mismatch, unsafe overwrite attempt, source changed, independent readback missing, or approved objective missed.

1. Stop the restore process; do not retry against the same target if the prior outcome is ambiguous.
2. Preserve target and staging artifacts; never auto-delete or overwrite them.
3. Confirm source checkpoint out-of-band and identify exact backup generation.
4. Create a new isolated target only after the previous attempt is reconciled.
5. Independently verify bytes, checkpoint, application consistency, security controls and source immutability.
6. Record actual elapsed recovery time and data-loss interval; do not alter the timestamps to meet objectives.
7. Any production cutover requires separate approval, tested rollback and an explicit maintenance window.

### IR-06 — Encryption key unavailable, suspected compromised or recovery test failed
**Trigger:** KMS key disabled/deleted, key version inaccessible, recovery material mismatch, suspected key exfiltration.

1. Treat compromise as SEV-1; treat recoverability failure as at least SEV-2.
2. Stop key rotation, destruction, version disablement and bulk re-encryption until impact is understood.
3. Preserve key version identifiers, IAM/policy history, KMS audit logs and recovery evidence. Never export or paste private key material into tickets/chat.
4. Engage the separately authorized key custodian and security reviewer; verify identity through the approved independent channel.
5. Test recovery only in an isolated environment against a non-production encrypted fixture.
6. Do not claim recoverability until a distinct recovery operator decrypts/verifies the fixture and an independent reviewer confirms evidence.
7. Key compromise response/rotation must follow the approved cryptographic incident plan; this document does not authorize key actions.

### IR-07 — Alert delivery failed, duplicate alerts or dead-letter
**Trigger:** notification outbox stuck, provider rejection, no acknowledgement, duplicate delivery, or exhausted retries.

1. Treat alert state as delivery unknown unless a provider acknowledgement and message ID are preserved.
2. Do not mark an alert delivered manually to clear the queue.
3. Check provider status, idempotency key, retry attempt history and dead-letter evidence without including private member data.
4. Reconcile ambiguous sends with provider message lookup before retrying; use the same idempotency key where supported.
5. Escalate through an independent out-of-band channel if the underlying incident is SEV-1/SEV-2.
6. Close the delivery sub-incident only when delivery is acknowledged or an alternate communication is confirmed by its recipient.

**Never:** assume timeout means the provider did not receive the message.

### IR-08 — Privileged identity, reviewer separation or audit journal compromise
**Trigger:** shared identity, unexpected admin subject, MFA assurance failure, unauthorized policy change, journal discontinuity or ownerless lock.

1. Treat as SEV-1; stop privileged operations.
2. Preserve session, issuer/subject, auth assurance, role registry, lock state, journal and external anchor evidence.
3. Revoke or suspend identities only through an approved identity incident procedure and authorized security administrator; do not improvise credential changes.
4. Do not delete or steal an ownerless lock. Quiesce writers and follow the dedicated lock-recovery runbook.
5. Re-establish independent actor identity and reviewer separation before any privileged recovery.
6. Require security review of all actions since the last independently verified audit checkpoint.

## 5. Recovery authorization gates

No recovery write or production cutover until every applicable gate is checked:

- [ ] Incident commander and scope recorded.
- [ ] Source of truth/checkpoint independently established.
- [ ] Exact backup generation and retention evidence verified.
- [ ] Raw audit evidence retrieved with complete pagination and independent provenance review.
- [ ] Writer, recovery operator, verifier and storage/audit administrators are distinct identities and administrative boundaries.
- [ ] MFA/step-up and authorization evidence verified by the actual identity system.
- [ ] Target is isolated and demonstrably new; no overwrite path exists.
- [ ] RPO/RTO objectives are explicitly approved for this service (P1.16 sample defaults are not MPS objectives).
- [ ] Rollback and reconciliation paths are documented.
- [ ] Independent reviewer approves the exact plan, checkpoint and target.
- [ ] Change window and communications are approved.
- [ ] Post-restore readback and application/security verification are defined.

If any gate is false or unknown, do not proceed with production recovery. Keep the service in a safe read-only/degraded posture where feasible and escalate.

## 6. Incident closure and evidence retention

An incident is not closed because a service responds or a dashboard turns green. Closure requires:

1. Root cause and impact statement with evidence references.
2. Containment actions and all privileged actors recorded.
3. Source and restored target checkpoints independently reconciled.
4. Exact-generation, digest, retention, audit coverage and key-recovery evidence checked as applicable.
5. RPO/RTO measured honestly against approved targets; missed objectives remain visible.
6. Independent reviewer signs the closure evidence.
7. Follow-up corrective actions have owners and due dates.
8. Privacy review confirms tickets and communications contain no unnecessary member data or secrets.
9. Evidence package is retained under an approved policy with independent access/audit controls.

Ambiguous write, missing source evidence, unverified delivery, or unresolved identity issue leaves the incident **OPEN / RECONCILIATION_REQUIRED**.

## 7. Communication templates

**Internal incident opened**
> MPS incident [opaque incident reference] opened at [UTC time]. Severity: [SEV]. Affected service/control: [non-sensitive scope]. Current state: [confirmed facts only]. Evidence preservation is in progress. Next update: [time]. Do not share credentials or member data in this thread.

**Service status**
> MPS is investigating [service/control] disruption. Some functions may be unavailable or restricted while integrity checks are completed. We will confirm restoration only after independent verification.

**Recovery verified**
> Recovery for [service/control] was completed at [UTC time] and independently verified against checkpoint [opaque reference]. Any remaining limitations: [list]. This statement does not imply unrelated systems are healthy.

## 8. Roles and activation prerequisites

Required roles: incident commander, source-system owner, backup/storage owner, recovery operator, independent verifier, audit administrator, security/identity administrator, communications owner. A person may not review their own privileged operation. The actual MPS roster and escalation contacts must be approved and tested separately; no names, personal phone numbers or contact routes are embedded here.

Before operational activation, MPS must approve severity targets, service-specific RPO/RTO, incident authority, identity and two-person policy, evidence location, retention policy, provider notification routes, runbook ownership, tabletop schedule and recovery cutover rules.

## 9. Validation and scope limits

This document is a design/runbook artifact. No live incident was declared, no production setting was changed, no provider was contacted, no alert was sent, no identity or key was revoked, no backup was restored, and no cloud or Apps Script resource was created or modified. The runbook itself does not prove that any named control is available.

Official winner draw remains **BLOCKED / NO-GO** until all previously documented identity, dual-control, evidence authenticity, immutable storage, verifier, operational recovery and release gates are independently satisfied. MPS Lucky Roulette remains **SIMULATION ONLY**.
