# MPS P1.19 — Incident Tabletop Exercise & Recovery Decision Matrix

**Status:** synthetic exercise pack and deterministic response evaluator only.  
**Branch:** `mps-v4.8-workbench`.  
**Production impact:** none; no incident was opened and no live action was performed.  
**Official draw:** BLOCKED / NO-GO; roulette remains SIMULATION ONLY.

## Purpose and boundary

P1.19 turns the P1.18 incident runbook into a repeatable tabletop exercise. Participants discuss fictional injects and record decisions. The evaluator checks whether required safeguards were selected; it does not emulate provider behavior, authenticate people, prove operational readiness, send alerts, touch backups, or execute recovery.

Use synthetic resource labels and timestamps only. Never enter member names/IDs, contact details, MT5 or payment data, PINs, documents, tokens, credentials, private keys, or real incident evidence.

## Exercise protocol

1. Appoint a facilitator, incident commander, first responder, independent reviewer, and observer. These are exercise roles, not privileged production identities.
2. State clearly: **TABLETOP / SYNTHETIC — NO LIVE ACTION**.
3. Read the scenario inject and reveal follow-up injects one at a time.
4. Ask the team to state severity, immediate posture, evidence to preserve, stop conditions, reviewer involvement, and closure evidence.
5. Record only decision identifiers from the matrix and four control flags: evidence preserved, second reviewer assigned, privacy safe, production action attempted.
6. Evaluate the response. Any prohibited decision or attempted production action fails the scenario; missing controls remain incomplete.
7. Debrief with owner, corrective action, due date and retest criterion. Do not mark a control operational merely because the tabletop passed.

## Scenario decision matrix

| Scenario | Inject | Required decision themes | Prohibited decision examples |
|---|---|---|---|
| IR01 Backup overdue | Expected checkpoint has no independently verified backup receipt | Confirm independent checkpoint; preserve provider evidence; verify readback before closure | Treat upload request as proof; overwrite old checkpoint |
| IR02 Integrity mismatch | Digest differs and same-sequence checkpoint conflicts | Freeze affected writes; preserve exact generations; new isolated restore target; independent review | Repair/recompute in place; choose newest timestamp |
| IR03 Retention expiry | Evidence generation is near or past retention expiry | Verify exact generation/expiry; preserve policy/audit; independent review | Irreversible lock shortcut; unauthorized legal-hold change |
| IR04 Audit export gap | Export pagination is incomplete and Data Access coverage is uncertain | Mark evidence incomplete; preserve query/pagination; independent source review | Infer no action; label incomplete export complete |
| IR05 Ambiguous restore | Restore timed out after target writes may have occurred | Stop; preserve artifacts; confirm out-of-band checkpoint; use new target | Retry same ambiguous target; overwrite source; unapproved cutover |
| IR06 Key recovery | Test key is unavailable or suspected compromised | Stop key changes; preserve metadata; authorized custodian; synthetic fixture only | Paste private key into ticket; unauthorized rotation/destruction |
| IR07 Alert delivery | Provider timed out without a receipt | Treat delivery as unknown; preserve receipt state; reconcile before retry; out-of-band escalation if critical | Manually mark delivered; assume timeout means not sent |
| IR08 Privileged identity/journal | Shared identity or ownerless lock is discovered | Stop privileged operations; preserve evidence; independent security review; quiesce before lock recovery | Steal ownerless lock; delete evidence; continue shared identity |

## Evaluation states

- **PASS:** all required decisions are present; no prohibited decision; evidence preservation, independent reviewer and privacy controls are true; no production action was attempted.
- **INCOMPLETE:** no hard-fail condition, but a required decision or control is missing. Keep the scenario open.
- **FAIL:** a prohibited decision, privacy failure, or production action attempt is recorded. Stop the exercise, preserve the record, and create a corrective-action item.

The machine-readable evaluator uses strict allowlists and rejects unknown fields. Its output is a checklist result, not a security attestation.

## Exercise record template

- Exercise ID (synthetic):
- Date/time (UTC):
- Facilitator / roles:
- Scenario ID:
- Declared severity and rationale:
- Decision identifiers selected:
- Evidence preservation confirmed: yes/no
- Independent reviewer assigned: yes/no
- Privacy-safe record: yes/no
- Production action attempted: yes/no (must be no)
- Evaluator result and blockers:
- Lessons / corrective actions / owner / due date:
- Retest evidence:
- Facilitator and independent observer sign-off:

## Exit criteria and activation gates

A tabletop is complete only when all eight scenarios have a recorded result, every FAIL/INCOMPLETE has a corrective action, and a separate observer confirms that no live system was touched. Operational activation still requires named and authorized responders, approved escalation channels and objectives, real individually authenticated identities, independently verified provider evidence, tested monitoring/notification delivery, off-site backup and restore drills, key recovery, and approved policies. This exercise does not satisfy those gates.

## Verification and limitations

The Node test suite covers all eight positive scenario fixtures, missing controls, prohibited decisions, privacy failure, attempted production action, unknown fields/scenarios and malformed decisions. Tests use synthetic data only. A green CI run proves only that this evaluator behaves as specified in the test harness; it does not prove the MPS incident process is staffed, activated, or effective.
