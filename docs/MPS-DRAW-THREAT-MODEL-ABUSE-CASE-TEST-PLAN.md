# MPS Official Draw — Threat Model & Abuse-Case Test Plan

**Status:** Design and test plan only — no implementation approval implied  
**Scope:** Isolated MPS v4.8 workbench; future Official Draw service, identity boundary, private participant snapshot, verification pipeline, audit evidence, and public projection  
**Data policy:** Synthetic identities and synthetic participants only  
**Production boundary:** No production attacks, live member data, live credentials, deployment, provisioning, or configuration changes

## 1. Executive security position

The MPS Official Draw is a high-integrity workflow: a successful compromise could select an ineligible participant, substitute a result, publish a false winner, or expose private member information. Its security objective is not merely to make the roulette animation difficult to manipulate. The authoritative outcome must be independently reproducible from a frozen eligible-participant snapshot and a precommitted, verifiably authentic randomness beacon.

The current roulette in the public frontend remains **SIMULATION ONLY**. The candidate Apps Script source and existing MPS admin/audit model do not establish person-level identity, independent two-person approval, transactional state changes, or tamper-evident evidence. Consequently, the official draw remains **BLOCKED** until the identity, snapshot, randomness, journal, verification, and publication gates in this document and the companion design documents are implemented and independently tested.

This document specifies controlled tests. It does not claim that these attacks have been executed or that the proposed controls already exist.

## 2. Scope and trust boundaries

### 2.1 Components in scope

1. Public GitHub Pages frontend: announcement ticker, Winner Board, roulette presentation, and read-only public feed.
2. Official Draw API: authenticated privileged endpoints, state machine, authorization, idempotency, and rate limits.
3. Identity provider and server-side OIDC validation/session service.
4. Operator registry and role/approval policy.
5. Private participant source and eligibility evaluation.
6. Frozen participant snapshot and commitment generation.
7. Future randomness beacon selection, round commitment, signature verification, and unbiased index mapping.
8. Durable operation journal, audit evidence, external anchoring, and recovery/reconciliation.
9. Independent verifier and public publication approval.
10. Deployment pipeline, dependency supply chain, secrets, backups, monitoring, and incident response.

### 2.2 Out of scope

- Attacking GitHub, Google, an identity provider, or drand infrastructure outside an explicitly authorized sandbox.
- Scanning or stress-testing production URLs, Apps Script deployments, databases, member accounts, or public services.
- Testing with real member records, real personal identifiers, actual winner data, or production credentials.
- Creating cloud resources, identity tenants, storage retention locks, webhooks, or production infrastructure as part of this design exercise.

### 2.3 Trust boundaries

| Boundary | Untrusted input crossing it | Required enforcement |
|---|---|---|
| Public browser → public feed | URL parameters, browser state, DOM content | Read-only allowlist; no privileged data or action |
| Operator browser → API | Request body, role claims, actor fields, IDs, headers | Server-derived identity, schema validation, authorization |
| Identity provider → session service | OIDC tokens and claims | Signature/JWKS, issuer, audience, expiry, nonce, authorized client, assurance checks |
| Member source → eligibility engine | Mutable records, statuses, duplicates, malformed fields | Versioned rules, canonicalization, provenance, fail-closed validation |
| Eligibility engine → frozen snapshot | Participant list and ordering | Freeze protocol, canonical digest, independent review, immutable version reference |
| Beacon source/relay → verifier | Round metadata, randomness, signature | Pinned chain configuration and independent cryptographic verification |
| Draw service → journal | State transitions and evidence | Durable idempotency, append-only protocol, read-back, external anchor |
| Verified result → public feed | Winner projection and proof | Independent verification, publication approval, strict field allowlist |
| Build/deploy pipeline → runtime | Source, dependencies, configuration | Pinned dependencies, reviewed builds, protected deployment and rollback |

## 3. Assets and security objectives

| Asset | Security objective | Failure impact |
|---|---|---|
| Draw rules and eligibility policy | Integrity, versioning, approved before freeze | Unfair or invalid draw |
| Operator identity and roles | Authenticity, least privilege, revocation | Unauthorized privileged action |
| Participant source and snapshot | Completeness, eligibility, confidentiality, immutability | Omission, injection, duplicate or disclosure |
| Snapshot commitment | Binding to one canonical snapshot | Undetected roster substitution |
| Beacon round and signature | Authenticity, unpredictability, correct timing | Predictable or biased outcome |
| Draw proof and selected index | Deterministic reproducibility | Forged or non-reproducible result |
| Journal and external evidence | Integrity, availability, traceability | Disputed or erased history |
| Public winner projection | Accuracy and privacy | False announcement or personal-data leak |
| Credentials, signing keys, sessions | Confidentiality and revocability | Account takeover |
| Source/dependency/build artifacts | Integrity and provenance | Supply-chain compromise |

Primary security objectives:
- Only authorized, individually authenticated people can perform assigned actions.
- No person can approve their own preparation or bypass the required independent reviewer.
- A frozen snapshot is complete, eligible, canonical, and bound to the draw before the beacon result is knowable.
- The result is deterministic, unbiased, and independently verifiable; no reroll or manual override.
- Every privileged transition is durably recorded and recoverable.
- Public output contains only explicitly approved fields; private roster data never reaches the public client.
- Failures stop safely and produce a visible reconciliation state rather than a false success.

## 4. Threat actors and assumed capabilities

| Actor | Assumed capability | Security response |
|---|---|---|
| Malicious or compromised operator | Valid operator session; can submit requests and manipulate own browser | Least privilege, independent approval, server-side validation, immutable evidence |
| Fake or colluding reviewer | Attempts to approve using forged identity or same human's second account | Stable person-level subject, independent identity proof, separation-of-duties checks |
| External unauthenticated attacker | Can inspect public site and send arbitrary HTTP requests | No privileged public endpoints, strict authentication, rate limits, schema validation |
| Stolen-session attacker | Possesses a valid session cookie/token | Short session, revocation, step-up authentication, CSRF defenses, anomaly detection |
| Malicious participant | Attempts duplicate, malformed, or manipulated registration data | Canonical eligibility validation and deduplication |
| Compromised relay/verifier | Returns fabricated beacon result or `verified=true` | Independent signature verification; never trust relay boolean |
| Insider with repository/deployment access | Can alter code, configuration, or dependencies | Protected branch, reviewed immutable release artifact, independent verification |
| Cloud/account administrator | Can access storage or modify operational configuration | Separation of duties, least privilege, retention controls, independent external anchors |
| Supply-chain attacker | Publishes compromised package or alters build input | Pinned versions/hashes, provenance, review, reproducible build where feasible |

Assume an attacker may control a browser, replay network requests, know public event metadata, and exploit concurrency. Do not assume the attacker can break modern cryptography. Cloud-provider or identity-provider compromise is treated as a severe residual risk requiring independent evidence and incident procedures.

## 5. Threat analysis (STRIDE)

| STRIDE class | MPS-specific threat | Required control |
|---|---|---|
| Spoofing | Fake reviewer, forged actor ID, shared admin account | Verified OIDC subject; server-owned actor context; distinct subject enforcement |
| Tampering | Change rules, roster, snapshot, selected index, proof, or public result | Versioned canonical records; digest/commitment; state transition guards; independent verifier |
| Repudiation | Operator denies approval or journal entry is rewritten | Signed/authenticated action context; append-only journal; external anchor |
| Information disclosure | Raw member IDs, names, contacts, MT5 or payment details leak | Data minimization; private/public separation; allowlist projection; synthetic test assertions |
| Denial of service | Flooding, lock contention, journal/storage exhaustion | Per-actor and per-IP limits, bounded work, queueing, quotas, alerting, safe retry |
| Elevation of privilege | Operator calls reviewer/publisher endpoint or IDOR accesses another event | Object-level and action-level authorization on every request; deny by default |

## 6. Abuse-case test catalogue

All tests below must run only against a disposable sandbox populated with synthetic actors and synthetic participants. A test passes only when the expected denial, detection, or independently verifiable outcome is observed and recorded. “Not implemented” is a release blocker, not a pass.

| ID / Severity | Abuse case and attack path | Required control / expected result | Test method and pass criteria |
|---|---|---|---|
| TM-01 Critical | Operator submits a forged `actorId`, `role`, or `approvedBy` in JSON | Server ignores client actor claims and derives actor from verified session; forged fields cannot change authorization or audit attribution | Submit altered actor fields as synthetic operator; response denies unauthorized action or records only authenticated subject |
| TM-02 Critical | Operator creates a second account and uses it as “independent” reviewer | Dual control compares immutable issuer + subject and rejects same person/subject; account duplication under same subject cannot satisfy independence | Prepare with subject A, approve with same subject through second client/account alias; approval rejected |
| TM-03 Critical | OIDC token has bad signature, wrong issuer/audience, expired time, invalid nonce, wrong authorized party, or insufficient assurance | Server validates all required claims and key provenance; no session or privileged action is granted | Identity sandbox token mutation suite; every invalid token rejected; valid test token accepted only for assigned role |
| TM-04 Critical | Stolen or replayed privileged session is used after logout, expiry, revocation, or privilege removal | Short-lived server session, revocation, rotation, step-up for high-risk action; revoked session cannot mutate state | Reuse synthetic session after each invalidation condition; all writes denied and security event recorded |
| TM-05 High | Cross-site request causes reviewer approval or publication | CSRF protection and origin/session binding prevent state-changing cross-site requests | Browser integration test with hostile synthetic origin; state remains unchanged |
| TM-06 Critical | IDOR/BOLA: operator changes event/snapshot ID to access or mutate another event | Every endpoint checks object ownership, role, event state, and action scope | Swap synthetic object IDs across two events; no cross-event read or write |
| TM-07 Critical | Operator calls reviewer, security-admin, or publisher endpoint directly | Server-side role/action matrix rejects unauthorized route regardless of hidden UI | Call each privileged route with each synthetic role; only explicitly permitted role/action combinations succeed |
| TM-08 Critical | Two concurrent approvals or draw requests race | Lock + re-read + durable state/version checks; exactly one valid transition/result | Parallel request harness; one transition wins, duplicate receives deterministic conflict/replay response; no split-brain result |
| TM-09 Critical | Replay same request with changed payload or reuse idempotency key across actions | Idempotency key is bound to actor, operation, resource, and canonical request digest; changed payload conflicts | Repeat identical request then mutate body under same key; first returns stable result, altered replay rejected |
| TM-10 Critical | Participant omitted, duplicated, injected, or reordered after freeze | Snapshot canonicalization, completeness reconciliation, source version, independent review, digest binding | Synthetic roster fixtures with omissions, duplicates, injected IDs and reorder; invalid freeze rejected or digest changes and requires new approval |
| TM-11 Critical | Ineligible, pending, rejected, or unverified member enters snapshot | Eligibility rules are versioned and evaluated server-side at freeze; fail closed on unknown status | Boundary fixture suite for every eligibility state; only explicitly eligible synthetic records included |
| TM-12 Critical | Eligibility changes between review and freeze | Freeze uses a consistent source version/time boundary and requires re-review if source changes | Mutate synthetic source between preview and freeze; freeze rejects stale version or requires fresh approval |
| TM-13 Critical | Beacon round is chosen after randomness is known, or wrong chain/round is substituted | Future round and chain config committed before beacon output; round is fixed in approved draw record | Attempt late round change, earlier round, wrong chain hash or round; all rejected and logged |
| TM-14 Critical | Relay supplies fabricated randomness or `verified:true` | Draw service verifies beacon signature against pinned public key/config itself or uses an independently audited verifier contract | Feed fake signature, altered randomness, wrong public key and relay-only success flag; all invalid proofs rejected |
| TM-15 Critical | Modulo bias or attacker-controlled mapping changes selected index | Deterministic rejection sampling with fixed, reviewed algorithm and canonical input encoding | Statistical/property tests plus adversarial boundary vectors; same proof always maps to same valid index without modulo bias |
| TM-16 Critical | Operator refreshes, reruns, or “rerolls” until preferred result appears | One draw operation per frozen snapshot and committed beacon round; retries return same operation/result; no reroll endpoint | Repeat execution and alter request metadata; no second outcome can be created |
| TM-17 Critical | Verifier library or pinned beacon configuration is replaced | Versioned verifier, pinned configuration, reviewed dependency, independently reproducible proof | Substitute test library/config/hash; verification fails or release attestation mismatch blocks execution |
| TM-18 Critical | Journal write succeeds partially, times out, or is deleted/reordered | Intent/action/read-back/completion protocol; external anchor; ambiguous state enters reconciliation | Inject failure at each write boundary; no false success; state becomes recoverable/reconciliation-required |
| TM-19 High | Journal hash chain is rewritten and recomputed by an insider | External independently controlled anchor detects rewritten history; spreadsheet-only chain is not treated as immutable | Rewrite synthetic journal and recompute chain; external anchor comparison detects mismatch |
| TM-20 Critical | Public API leaks raw IDs, names, phone, email, Telegram, MT5, deposits, PIN or proof docs | Strict response allowlist and privacy projection; no private source fields in public payload/cache/log | Seed synthetic canary secrets in private fields; inspect every public endpoint, cache and rendered DOM; zero canaries appear |
| TM-21 High | Masked IDs collide or cannot be safely derived | Unique suffix gate; collision/invalid ID/DB failure suppresses identifier and uses generic text | Collision and malformed-ID fixtures; no ambiguous mask is emitted |
| TM-22 Critical | Winner title, CMS text, or untrusted field injects HTML/script | DOM uses text nodes/textContent; URL allowlist; CSP where applicable; output encoding | XSS payload corpus in all public fields; payload remains inert and no script executes |
| TM-23 High | Open redirect or SSRF via announcement/button URL | Strict URL policy; no server-side fetch of user-supplied URLs; redirect destinations constrained | Use javascript/data URLs, credentials in URL, protocol-relative and private-network URLs; all rejected |
| TM-24 High | Cache poisoning serves stale private or unverified winner data | Versioned cache namespace, public-only cache object, safe invalidation, no auth-dependent data in shared cache | Prime cache with synthetic private response; anonymous retrieval cannot expose it; stale result is invalidated |
| TM-25 High | API rate-limit bypass through header/IP/account variation | Multi-dimensional limits, bounded expensive operations, server-side actor key | Synthetic burst tests varying spoofable headers and sessions; limits remain effective and alert |
| TM-26 High | Webhook/API callback spoofing or duplicate delivery | Authenticated webhook signatures, timestamp/nonce validation, idempotent processing | Invalid signature, stale timestamp and duplicate event tests; no unauthorized state transition |
| TM-27 Critical | Dependency or build artifact is substituted | Lockfile/hash pinning, provenance, code review, protected build and release identity | Alter dependency hash or artifact; CI/release verification fails |
| TM-28 Critical | Deployment/configuration drift enables public privileged access or wrong endpoint | Environment-specific config validation, deployment approval, post-deploy smoke tests, fail-closed flags | Deliberately misconfigure sandbox; deployment gate blocks release or service fails closed |
| TM-29 High | Backup restore rolls state backward and permits duplicate draw | Restore reconciliation against external journal anchor and idempotency ledger; no draw resumes until reconciled | Restore stale synthetic backup; service enters reconciliation-required and blocks execution |
| TM-30 High | Attacker exhausts storage, locks, quotas, or journal capacity | Quota monitoring, bounded retention policy, alerting, backpressure, recovery plan | Sandbox quota/lock fault injection; system degrades safely without partial success |
| TM-31 Critical | Publisher changes verified winner projection or publishes before verification | Separate publisher approval; projection generated from verified proof; immutable linkage to draw ID | Mutate winner fields or publish from unverified state; publication rejected |
| TM-32 High | Logs expose session tokens, OIDC tokens, raw IDs or private snapshot | Structured log redaction and restricted access; secrets never logged | Canary secret injection in sandbox; scan logs/traces/errors; no secret values present |

## 7. Test fixtures and synthetic data policy

Use only synthetic records, for example:
- Synthetic operator subjects: `issuer-test / subject-operator-A`, `issuer-test / subject-reviewer-B`, `issuer-test / subject-publisher-C`.
- Synthetic participants: `TEST-MPS-000001` through `TEST-MPS-000100`.
- Synthetic statuses: eligible, pending, rejected, suspended, duplicate, malformed, and changed-after-review.
- Synthetic canary values in private fields to detect leakage. Never use realistic personal information copied from production.
- Synthetic beacon vectors with known valid/invalid signatures and fixed test keys. Never expose production signing keys or use a live draw round for destructive tests.

Public privacy fixture:
- Do not display names or full member IDs.
- A masked ID such as `MPS-****-4821` may appear only if the suffix is valid and unique within the complete eligible population and the privacy policy explicitly permits it.
- If uniqueness, validity, source completeness, or database access cannot be established, suppress the ID and use generic copy.
- Never expose phone numbers, email addresses, Telegram IDs, MT5 logins, deposit/payment values, PINs, credentials, or proof documents.

## 8. Test execution phases and evidence

| Phase | Scope | Required evidence | Release gate |
|---|---|---|---|
| P0 — Design review | Threat coverage, trust boundaries, roles, data flow | Reviewed threat model and traceability to API contract | No unresolved Critical design gap |
| P1 — Unit/property tests | Canonicalization, eligibility, idempotency, state machine, randomness mapping | Reproducible test output and fixed vectors | All Critical unit tests pass |
| P2 — Identity sandbox | OIDC validation, MFA/assurance, session, revocation, dual control | Sanitized token-validation and authorization reports | No spoofing or self-approval path |
| P3 — API integration | Object authorization, replay, race, CSRF, error handling | Request/response test evidence and journal correlation | No unauthorized state transition |
| P4 — Fault/chaos tests | Partial writes, lock timeout, storage outage, stale restore | Fault-injection timeline and reconciliation evidence | No false success or duplicate draw |
| P5 — Browser security | XSS, URL handling, cache, public response privacy | Browser console/network/DOM evidence | No executable injection or private-field leakage |
| P6 — Android/mobile | Responsive UI, session handling, pause/reduced motion, publication rendering | Real-device test record on supported Android browsers | No critical mobile-only security or usability issue |
| P7 — Independent verification | Separate verifier reproduces beacon and winner from approved proof | Signed/reproducible verification report | Exact deterministic match |
| P8 — External review | Independent security review and remediation | Findings register, retest evidence, residual-risk sign-off | No open Critical/High issue without explicit risk acceptance |
| P9 — Incident exercise | Credential compromise, false publication, journal outage, recovery | Tabletop record, decision log, recovery timings | Owners and rollback/revocation paths demonstrated |

Every test record must include test ID, build/source commit, environment, synthetic fixture version, timestamp, steps, expected result, actual result, evidence reference, pass/fail, defect ID, retest result, and reviewer. Do not place secrets or private participant data in test evidence.

## 9. Release blockers

The following are non-waivable technical blockers for an official public draw:
1. No individually authenticated, server-verified human identity for every privileged actor.
2. No enforceable person-level separation of duties and independent reviewer.
3. No server-side authorization on every object and action.
4. No canonical, complete, eligibility-checked, frozen participant snapshot bound to an approved rules version.
5. No future beacon round committed before output and independently verified cryptographically.
6. No reviewed deterministic unbiased selection algorithm and reproducible proof.
7. Any reroll, manual winner override, or client-side outcome authority.
8. No durable idempotency and recoverable journal protocol.
9. No independent evidence anchor or a documented, accepted equivalent tamper-evidence design.
10. Any Critical or High test failure, unresolved privacy leak, or inability to independently reproduce the result.
11. Public output not generated from a verified result and independently approved publication record.
12. No backup/restore reconciliation, incident response, monitoring, and rollback plan.

A management decision cannot convert a failed cryptographic or privacy control into a passed technical test. Any accepted residual risk must be explicitly documented by the accountable owner and must not waive the core fairness, identity, or privacy invariants.

## 10. Detection, response, and recovery

Trigger a security incident workflow for:
- Unexpected privileged role/action combinations or repeated authorization failures.
- Same subject attempting both sides of dual control.
- Session use after revocation, anomalous geography/device changes where available, or repeated step-up failures.
- Snapshot digest/source-version mismatch.
- Beacon chain, round, signature, or verifier-version mismatch.
- Duplicate operation, unexpected state transition, journal gap, external-anchor mismatch.
- Any private canary value in public responses, browser DOM, cache, analytics, or logs.
- Unreviewed source/dependency/configuration change or deployment provenance mismatch.

Immediate safe response:
1. Freeze the affected draw state; do not reroll or manually substitute a winner.
2. Disable privileged execution/publication paths using the approved incident control.
3. Revoke affected sessions and credentials through the identity provider; do not rotate or modify production secrets as part of this design document.
4. Preserve relevant logs, journal records, build artifacts, and external anchors without altering originals.
5. Set the event to `RECONCILIATION_REQUIRED` or `VERIFICATION_FAILED` as appropriate.
6. Reconcile snapshot, operation ledger, beacon proof, and journal with an independent reviewer.
7. If public information was exposed or a false result published, follow the approved correction and notification policy; do not silently edit history.
8. Resume only after root cause, remediation, independent retest, and authorized approval.

## 11. Risk register

| Risk | Likelihood before controls | Impact | Priority | Mitigation / residual concern |
|---|---|---|---|---|
| Shared credentials or false reviewer identity | High | Critical | Critical | Individual OIDC subjects and independent approval; identity-provider compromise remains residual |
| Roster manipulation or incomplete snapshot | Medium | Critical | Critical | Source reconciliation, canonical snapshot, freeze review; source-of-truth quality must be proven |
| Beacon/selection manipulation | Medium | Critical | Critical | Precommitted future round, pinned cryptographic verification, unbiased mapping; verifier supply chain remains sensitive |
| Journal rewrite or partial-write ambiguity | Medium | Critical | Critical | Durable journal, external anchor, reconciliation; external storage governance and availability required |
| Public privacy leakage | Medium | Critical | Critical | Strict allowlist, canary tests, no names/full IDs; operational logs/caches must also be reviewed |
| API object-level authorization gap | Medium | High | High | Central authorization middleware and exhaustive role/object matrix |
| Supply-chain or deployment compromise | Medium | Critical | Critical | Protected build, pinned dependencies, provenance, independent release review |
| Denial of service / quota exhaustion | Medium | High | High | Rate limits, queueing, quota monitoring, bounded operations; provider limits remain |
| Backup rollback and duplicate execution | Low–Medium | Critical | High | External anchor reconciliation and durable idempotency |
| Insider with broad cloud administration | Low–Medium | Critical | High | Separate accounts, least privilege, external evidence, alerting; privileged-provider administrators remain a residual trust domain |

Likelihood ratings are preliminary design estimates, not measured incident frequencies. Reassess after architecture implementation, sandbox results, and independent review.

## 12. Traceability to companion documents

- `docs/MPS-WINNER-DRAW-SECURITY-REVIEW.md` — randomness beacon, proof, snapshot, state machine, and verification constraints.
- `docs/MPS-DUAL-CONTROL-AUDIT-JOURNAL-DESIGN.md` — person-level approval, durable journal, external evidence, and recovery protocol.
- `docs/MPS-IDENTITY-EVIDENCE-ARCHITECTURE.md` — OIDC identity, session, role registry, and dual-control architecture.
- `docs/MPS-OFFICIAL-DRAW-API-CONTRACT.md` — API surface, schemas, state transitions, idempotency, and public projection.

## 13. Current implementation and test status

| Area | Status |
|---|---|
| Threat model and abuse-case plan | Documented in this file |
| Official draw backend | Not implemented / blocked |
| Individual OIDC identity and dual control | Design only; not provisioned or runtime-tested |
| Frozen snapshot and eligibility engine | Design only; not implemented |
| Beacon signature verifier and draw algorithm | Design only; not implemented |
| Durable journal and external anchor | Design only; not provisioned |
| Independent proof verification | Not implemented |
| Browser/API/Android abuse tests | Not run; test plan only |
| Production systems | Not accessed or changed |

**Current decision: NO-GO for official winner selection.** The frontend roulette remains a clearly labelled simulation. Do not publish fabricated winners, claim security testing is complete, or enable an official draw until all release blockers have objective evidence and independent approval.

---

*End of document. This is a design artifact, not authorization to test or change production systems.*
