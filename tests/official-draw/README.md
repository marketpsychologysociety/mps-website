# Official Draw Security Contract Harness

**Status:** Adapter-based test scaffold; not connected to a Draw API implementation.  
**Data:** Synthetic actors and participants only.  
**Safety:** The runner refuses non-loopback targets. It never targets production.

## Purpose

This harness is the next step after the MPS threat model. It defines repeatable integration checks for the API contract without pretending that the future backend already exists.

The suite is intentionally **not green by default**. Without an implementation adapter, tests are reported as skipped. A skipped test is not a pass. Once a sandbox Draw API exists, provide an adapter implementing the contract below.

## Requirements

- Node.js 20 or later.
- A disposable local sandbox Draw API bound only to `127.0.0.1`, `::1`, or `localhost`.
- Synthetic test identities and synthetic participant fixtures.
- No production URL, live member record, production credential, real draw round, or production secret.

## Run

From the repository root:

```sh
node --test tests/official-draw/security-contract.test.mjs
```

Until an adapter is supplied, all backend integration cases are skipped intentionally.

When the local sandbox implementation is ready:

```sh
MPS_DRAW_TEST_ALLOW_LOCAL=1 \
MPS_DRAW_TEST_ADAPTER=./path/to/local-draw-test-adapter.mjs \
node --test tests/official-draw/security-contract.test.mjs
```

The adapter path must resolve to a local file. The adapter must export:
- `baseUrl`: local loopback HTTP(S) URL.
- `actors`: synthetic actor handles named `operatorA`, `reviewerB`, `reviewerSameSubjectAsA`, `publisherC`, and `auditorD`.
- `reset()`: reset disposable synthetic state before each case.
- `seedApprovedEvent({preparedBy, approvedBy})`: return `{ eventId, drawId, snapshotDigest, version }` for a synthetic event that has passed rules and snapshot approval.
- `seedDrawAtState({state, preparedBy, approvedBy})`: return `{ eventId, drawId, version, rulesHash }` for a synthetic event/draw at the requested supported state.
- `request({method, path, actor, body, headers})`: make one request to the local sandbox API; actor is a synthetic adapter handle, not a client-supplied identity claim.
- `seedPublishedProjection()`: seed a published synthetic record with private canaries and return its public result ID.
- `getPrivateCanaries()`: return synthetic canary strings seeded in private fields for leak detection.
- `getPublishedProjection(publicResultId)`: call the anonymous public collection and detail HTTP routes and return both responses.
- `getOperationCount(drawId)`: return durable operation count for the draw.

The adapter source must be reviewed before execution. It must not make requests to any host other than its configured loopback base URL, and must not bypass the API under test to make assertions pass. Fixture setup may use a documented sandbox-only fixture interface; test actions themselves must traverse the real API handler and authorization middleware. The loopback URL check is a guardrail, not a substitute for reviewing adapter code or isolating the test environment.

## Safety rules

1. The runner requires `MPS_DRAW_TEST_ALLOW_LOCAL=1`.
2. The configured base URL must resolve syntactically to loopback only. Remote hosts, public IPs, production domains, and non-loopback URLs are rejected before tests execute.
3. Never configure real identity tokens or production credentials in the adapter.
4. The test process must be isolated from production databases, Apps Script deployments, Drive, Script Properties, webhooks, and live services.
5. Do not use a live drand round. Use fixed synthetic beacon vectors and test keys.
6. Do not seed real names, IDs, phone/email, Telegram, MT5, deposit/payment data, PINs, or proof documents.
7. If any test unexpectedly reaches a non-loopback service, stop immediately and treat it as a security incident.

## Covered integration invariants

- Client-supplied actor identity cannot override server-authenticated identity.
- Same immutable issuer + subject cannot satisfy two-person approval, even via a second session.
- Missing or revoked privileges cannot perform protected actions.
- State-changing requests require idempotency and expected version.
- Same idempotency key with changed payload is rejected.
- Replayed execute requests do not create another draw operation.
- Cross-event object identifiers do not bypass authorization.
- Public output does not contain private canary values or full participant identifiers.
- Unverified draw states cannot be published.

## Result interpretation

- **PASS:** the sandbox backend produced the expected security response and state was independently checked.
- **FAIL:** the backend violated an expected invariant; treat as release blocker.
- **SKIP:** no adapter or prerequisite fixture exists; no security conclusion can be drawn.
- **ERROR:** test infrastructure failed; investigate before interpreting security posture.

A passing harness is not a complete security certification. It does not replace OIDC provider validation, cryptographic beacon verification, source review, independent proof reproduction, fault injection, browser testing, Android testing, or external security review.

## Included loopback sandbox (synthetic only)

A deliberately limited local API sandbox and adapter are included at
`tests/official-draw/local-sandbox-adapter.mjs`. It binds only to
`127.0.0.1:4178` and uses fixed synthetic bearer tokens mapped to synthetic
actor subjects/roles inside the test process. It has in-memory state only.

Run the integration scaffold against it from the repository root:

```sh
MPS_DRAW_TEST_ALLOW_LOCAL=1 \
MPS_DRAW_TEST_ADAPTER=./tests/official-draw/local-sandbox-adapter.mjs \
node --test tests/official-draw/security-contract.test.mjs
```

The sandbox is intended to exercise real local HTTP routing and middleware
boundaries for a narrow set of negative/contract tests. It checks operator ownership
on draw execution, expected-version (`If-Match`) preconditions, role separation,
idempotency conflicts, and refusal to publish unverified results. It is **not** an OIDC
implementation, durable database, tamper-evident journal, production identity
system, beacon verifier, fair winner-selection engine, or deployable Draw API.

The sandbox now includes a deliberately synthetic published-projection fixture, a strict allowlist serializer, and anonymous read-only collection/detail routes. The privacy test sends requests through those loopback HTTP routes and checks that private canaries (name, raw member ID, phone, email, Telegram ID, MT5 login, deposit, proof-document reference, PIN, token, and participant reference) do not appear in either response. It also checks exact public field allowlists and fail-closed behavior for empty/unknown results. This is a narrow sandbox test only; it does not prove the production CMS, Apps Script, cache, browser DOM, or a future Draw API is private.
Its synthetic credentials are test fixtures, not secrets. Never expose the
port, reuse its tokens, connect it to real data, or deploy this module.

The sandbox's state is reset in memory before each test. Passing these tests
would demonstrate only that these specific sandbox contracts behave as
asserted; it would not demonstrate that a future production backend is secure.


## Durable synthetic audit journal prototype (test only)

Run the standalone persistence and fault-injection suite:

```sh
node --test tests/official-draw/durable-audit-journal.test.mjs
```

The journal uses a disposable local directory and an append-only JSONL file. It writes INTENT and COMPLETION records, fsyncs each append, verifies a sequential SHA-256 hash chain and exact journal-record key allowlist on reopen, recovers complete records, drops only an incomplete final line, rejects complete-record tampering/unknown fields, and enforces idempotency and a narrow completion-result field allowlist.

The fault-injection tests cover failure before append, write-before-fsync ambiguity, and fsync-before-ack loss. Uncertain outcomes require closing/reopening and reconciling before writes resume.

**Limitations:** this is a single-process local test prototype and is not yet connected to the HTTP sandbox state transitions. It has no multi-process lock, transactional database, external hash anchor, backup/restore, OIDC, or production hardening. A hash chain stored only in the same writable file is not tamper-proof against an attacker who can rewrite the entire file and recompute all hashes. Use synthetic metadata only; never write participant PII, proof documents, PINs, credentials, or production data.


### P1.1 strict journal schema hardening — verified CI (2026-11-11)

The recovery verifier now requires an exact record-key allowlist; unknown extra fields fail closed before hash-chain application. A synthetic canary test confirms that an unexpected private payload field is rejected during recovery. Completion results also remain restricted to the bounded allowlist.

**GitHub Actions run #180** on commit `ec9c3df600dbd7e3509f56dc9e620309aa4fb606` completed successfully from a clean checkout: durable journal suite **8 PASS, 0 FAIL, 0 SKIP**; Official Draw contract **10 PASS**; schema compatibility **9/9**; read-only inspector **5 scenarios**; Chromium PWA/browser checks passed. Overall workflow: **SUCCESS**. The immediately preceding run #179 failed because the new canary test reached CI one commit before its matching exact-schema guard; the follow-up commit added the guard, and run #180 verified the combined change green.

This closes the standalone journal's synthetic test gap only. The journal is not yet integrated into API state transitions and remains single-process local-file storage without a cross-process lock, transactional database, or external hash anchor. API-level restart/fault-injection tests remain next. Official draw remains **BLOCKED / NO-GO**; roulette remains **SIMULATION ONLY**.

## P1.2 persistent Draw API sandbox (test only)

tests/official-draw/persistent-local-sandbox-adapter.mjs is a separate loopback-only HTTP sandbox on 127.0.0.1:4179. It uses the P1.1 durable JSONL journal as the write-ahead operation log and reconstructs synthetic draw state from completed aggregate records after a process restart. The aggregate result schema is exact and allowlisted; arbitrary nested fields are rejected.

Run the process-restart tests with:
node --test tests/official-draw/persistent-api-integration.test.mjs

The five integration cases start and stop real child Node processes against one disposable temporary journal directory. They check durable seed/state recovery after restart, idempotent replay, changed-payload conflict, per-draw concurrent execution serialization, crashes after durable intent and after in-memory mutation but before completion, and recovery when the completion record is fsynced but its acknowledgement is lost. Incomplete intents restore as RECONCILIATION_REQUIRED; a durably completed operation is replayed without executing twice. The standalone journal suite also tests exact aggregate allowlisting and replay.

Limitations remain material: single-process local filesystem only; no cross-process lock, transactional database, external journal anchor, OIDC/MFA, beacon verifier, unbiased selection algorithm, or production hardening. The fixture route exists only in this test adapter. Do not expose port 4179, use real data, or deploy it. Official winner draw remains BLOCKED / NO-GO and roulette remains SIMULATION ONLY.

## P1.3 — cross-process journal lock and single-writer API lease (test only)

The P1.1 journal now uses an atomic filesystem lock directory around recovery and every append. Each writer re-reads and verifies the complete journal while holding the lock before applying idempotency checks or appending, preventing independent Node processes from using stale sequence/hash state. Lock ownership is recorded with an exact schema (PID, hostname, random token, start time); release verifies the token and owner. A same-host lock is reclaimed only after the recorded PID is confirmed absent, using an atomic rename to a quarantine path. A missing/malformed owner record, foreign-host owner, or live owner fails closed; no timeout-based lease stealing is used.

The persistent Draw API opts into a separate exclusive server-process lease. A second sandbox process pointed at the same journal directory is rejected before it starts listening. This is deliberately **single-writer**, not active-active/multi-instance service support. A crashed process leaves a lock that is reclaimed on restart only after same-host PID death is confirmed.

New tests use two independent child Node processes writing 20 synthetic operations to the same journal, verify 40 intact chained records after recovery, test exclusive lease rejection/release, and test stale same-host lock recovery. The API integration suite also verifies that a second server cannot acquire the same directory lease. Clean-checkout GitHub Actions run #218 on commit 788ab5cb18d4b027c9edc870808bee846346f8d8 passed the full workflow. Journal lock suite: 13 PASS, 0 FAIL, 0 SKIP; persistent API integration: 6 PASS, 0 FAIL, 0 SKIP. Chromium PWA checks also passed 15 pages and the offline/mobile/install flows. Run: https://github.com/marketpsychologysociety/mps-website/actions/runs/42938105450.

Run:
node --test tests/official-draw/durable-audit-journal.test.mjs
node --test tests/official-draw/persistent-api-integration.test.mjs

Remaining limits: local filesystem semantics only; no distributed/network filesystem guarantees, multi-host coordination, transactional database, external immutable journal anchor, backup/restore, OIDC/MFA, beacon verifier, unbiased selection, or production suitability. Official winner draw remains BLOCKED / NO-GO; roulette remains SIMULATION ONLY.


## P1.4 crash-while-lock-held recovery test (test only)

A new child-process crash test terminates a synthetic writer immediately after its INTENT bytes are written but before fsync/acknowledgement, while the writer still owns the journal lock. A fresh process must confirm the previous PID is absent, atomically quarantine the stale same-host lock, recover the journal, and replay the same idempotency scope without appending a second intent. The test uses a disposable temporary directory and synthetic identifiers only. It does not establish power-loss durability, cross-host/network-filesystem safety, or production tamper resistance. The test is included in the existing durable journal CI step; do not treat the complete workflow as passed until the associated run finishes successfully.


## P1.5 synthetic external-anchor contract (test only)

Run:
node --test tests/official-draw/synthetic-external-anchor.test.mjs

The test-only contract simulator defines ordered checkpoint anchors, create-only object semantics, an explicit predecessor receipt hash, deterministic receipt hashing, idempotent same-checkpoint retry, conflict rejection, and verification for missing/reordered/tampered/unknown-field anchors. It uses an in-memory provider in the test process. **It is not an external store, independent trust boundary, immutable service, cloud integration, or evidence of production retention/IAM.** The CI test proves only the contract simulator's behavior. No bucket, project, credentials, retention policy, or external resource is created.


## P1.6 independent external evidence storage architecture (design only)

See `docs/MPS-EXTERNAL-EVIDENCE-STORAGE-ARCHITECTURE.md` for the provider-neutral trust-boundary, writer/verifier/admin separation, conditional-create and exact-generation contract, retention/IAM/audit/backup/monitoring controls, verification protocol, abuse cases, provider scorecard, runbooks and release gates.

No provider has been selected or connected. P1.5 remains an in-memory simulator only. A real provider must be tested in an explicitly authorized isolated account; writer and verifier identities must be independently administered. A hash or versioning feature alone does not establish immutability. No cloud resources, credentials, retention lock, production data or deployment were created. Official draw remains NO-GO; roulette remains SIMULATION ONLY.


## P1.7 provider candidate evaluation (desk review only)

See `docs/MPS-EXTERNAL-EVIDENCE-PROVIDER-EVALUATION.md` for a documented comparison of GCS, S3 and Azure Blob Storage, including native conditional-create semantics, generation/version pinning, WORM controls, audit limitations, a synthetic PoC test matrix and explicit non-actions. GCS is only a conditional first PoC candidate; S3 is the fallback comparator. No provider is selected or provisioned. No cloud resources, accounts, credentials, retention locks or production connections were created.

## P1.9 — offline GCS PoC evidence-bundle verifier (test only)

Run:
`node --test tests/official-draw/gcs-poc-evidence-verifier.test.mjs`

The offline verifier checks a strict normalized evidence-bundle schema, distinct principal subjects and administrative boundaries, decimal-string generation/metageneration identifiers, exact expected sequence coverage, canonical payload SHA-256, chained receipt hashes, complete declared audit coverage, writer create evidence, independent verifier read evidence, writer delete-denial evidence, and storage-admin policy-change evidence. The tests use synthetic fixture records only.

**Critical evidence boundary:** this is a local/offline validator for an exported and normalized bundle. It does not call Google Cloud, authenticate Cloud Audit Logs, prove the export pipeline is complete, inspect live IAM, prove retention, or establish actual GCS behavior. The normalization/export adapter and raw source evidence require separate independent review. A passing fixture test is not a GCS PoC PASS and must never be presented as one. No GCP project, bucket, identity, credential, billing, audit sink, or production connection is created.


## P1.10 — raw GCS audit log normalizer (offline only)

Run:
node --test tests/official-draw/gcs-raw-audit-normalizer.test.mjs

The normalizer accepts exact raw JSON strings plus a page manifest and checks raw-byte SHA-256, page-token continuity/completion, page counts/digests, project and bucket scope, Cloud Audit Log envelope, timestamps, insert IDs, expected actor roles, recognized operation names, and create/read/delete-denial evidence. It emits a narrow normalized event projection. Fixtures are synthetic only.

**Authenticity limitation:** sourceAuthenticated is always false. Hashes, JSON parsing, and an export reference do not authenticate Google as the source or prove that an export is complete. A separately authenticated Cloud Logging retrieval or provider-verifiable custody evidence and independent reconciliation are still mandatory. Actual GCS method names/resource-name forms must be confirmed against real PoC records; unknown variants fail closed. No GCP resources or production connections are created. See docs/MPS-GCS-RAW-AUDIT-EVIDENCE-NORMALIZATION.md.


## P1.11 — independent reviewer provenance attestation (offline only)

Run:
node --test tests/official-draw/gcs-evidence-provenance-verifier.test.mjs

This stage verifies a detached Ed25519 signature from an independently pinned reviewer key, binds the signature to the canonical P1.10 raw evidence bundle, and checks reviewer/exporter separation, project/bucket/query scope, retrieval window, page/entry counts, pagination completion, trust-key validity/revocation, expiry, and a caller-supplied one-time nonce. Tests use ephemeral synthetic keys only.

**Authenticity boundary:** a valid result proves that the pinned reviewer key signed claims bound to this exact bundle. It does not prove Google signed the raw logs or that reviewer claims are true. The trust key must be provisioned out of band; the caller must run P1.10 first and durably consume nonce challenges. No real keys, raw logs, GCP resources, or production connections are committed. See docs/MPS-GCS-INDEPENDENT-PROVENANCE-ATTESTATION.md.

## P1.13 — reviewer nonce process-crash recovery (synthetic only)

The P1.12 trust-registry test suite now includes two child-process fault-injection cases. A worker terminates with exit code 73 while holding the registry lock, first after nonce-consumption bytes are written but before fsync, and again after fsync but before acknowledgement. A fresh process must recover the stale same-host lock and journal; the pre-fsync case reconciles either an absent/incomplete or complete record without double consumption, while the post-fsync case must reject replay. Both assert exactly one final nonce consumption. The injected hook is test-only. These tests model process termination, not power loss, kernel panic, storage cache loss, or multi-host behavior.

Run: `node --test tests/official-draw/durable-reviewer-trust-registry.test.mjs`

**Clean-checkout CI evidence:** GitHub Actions workflow #305 (run ID `42947053810`) on commit `6ca41acd5e29dbadb4b46a47c68514d3d31fa714` completed **SUCCESS**. The trust-registry suite reported **14 PASS, 0 FAIL, 0 SKIP**, including both child-process crash-recovery cases. The full workflow also passed the other configured synthetic suites and Chromium browser checks. This is process-crash simulation only; it does not establish power-loss, storage-device, or multi-host guarantees.

## P1.14 — ownerless registry-lock recovery (synthetic only)

Operator guidance: `docs/MPS-REVIEWER-REGISTRY-LOCK-RECOVERY-RUNBOOK.md`. It requires service quiescence, evidence preservation, validation on a separate copy, independent manual review, atomic quarantine (never deletion), and single-writer readback. It is not a production runbook.

If a process terminates after creating `reviewer-trust.lock` but before writing `owner.json`, the lock has no verifiable PID/token owner. The registry waits only for a bounded owner-file creation window, then fails with `LOCK_RECOVERY_REQUIRED` and deliberately does not delete or steal that ambiguous lock. An operator must reconcile it out of band after proving no writer is active. A regression test asserts fail-closed behavior and confirms the lock directory remains untouched.

The expanded trust-registry suite now contains 15 test cases. Clean-checkout GitHub Actions workflow #315 (run ID `42948585112`) completed **SUCCESS** on commit `6eeeb39657db5a2219656c574aca2f48a1b92553`; the full workflow and Chromium browser checks passed. This is not multi-host or power-loss protection.

## P1.12 — durable reviewer trust registry and single-use nonce (synthetic only)

Run:
`node --test tests/official-draw/durable-reviewer-trust-registry.test.mjs`

The local filesystem prototype records immutable Ed25519 reviewer public-key registrations, effective-time revocations, nonce issuance digests, and exact evidence/attestation digests on nonce consumption. Key rotation uses a new never-reused key ID and preserves historic key records; key validity is evaluated at signing time, while revocation effective before signing blocks verification. A random 256-bit nonce is stored only as a SHA-256 digest, verified with the exact signed evidence bundle, and consumed under a same-host cross-instance lock. The JSONL journal is fsynced, sequence/hash-chain checked, and recovered on restart. Twelve synthetic tests cover registration/auth denial, separation of duties, private-key PEM rejection, duplicate key-material rejection after revocation, key rotation/expiry, effective-time revocation, restart persistence, exactly-once and cross-instance concurrent replay, invalid-signature retry, nonce expiry/non-storage, tampering, incomplete-tail recovery and dead-lock recovery. Local implementation review: **12 PASS, 0 FAIL, 0 SKIP**; clean-checkout GitHub Actions result remains pending/unconfirmed.

**Limitations:** this is not OIDC/MFA, a real admin authorization service, a distributed database, a tamper-proof journal, or a production nonce service. The injected admin authorization callback is only a seam; test policy is synthetic. Local PID locks are same-host only, and a same-file hash chain can be rewritten by an attacker able to replace the file. The provenance verifier still does not cryptographically authenticate Google Cloud Audit Logs. No GCP resource, credentials, identity provider, private key, member data, Apps Script deployment or production service was created or changed. Official draw remains **BLOCKED / NO-GO**; roulette remains **SIMULATION ONLY**.


## P1.15 — independent synthetic backup and recovery

`synthetic-backup-recovery.mjs` verifies a create-only local backup, strict manifest, byte digest, full journal chain, stale/equal-sequence checkpoint rejection, and restore to a new target only. It rejects incomplete source journals without repairing them, preserves interrupted staging/restore artifacts, and never overwrites an existing target. Ten synthetic cases run in CI via `node --test tests/official-draw/synthetic-backup-recovery.test.mjs`. This is same-host local-filesystem test coverage only; it is not off-host/cloud backup, immutable retention, production disaster recovery, or proof of power-loss/multi-host safety. No cloud or production resources are created or changed. See `docs/MPS-INDEPENDENT-BACKUP-RECOVERY-VERIFICATION.md`.


## P1.16 — off-site backup and recovery drill contract (synthetic only)

`offsite-recovery-drill-contract.mjs` validates a normalized provider-neutral drill evidence envelope: separate source/backup accounts, projects and regions; six distinct privileged subjects and administrative boundaries; MFA assertions; locked-retention evidence; exact-generation restore to a new target; source preservation; independent audit coverage; RPO/RTO and an out-of-band expected checkpoint. Sixteen positive/negative synthetic tests run in CI. The validator does not authenticate provider APIs, IAM, MFA, retention, KMS, raw audit logs or the truth of normalized assertions. No cloud resource is provisioned. See `docs/MPS-OFFSITE-BACKUP-RECOVERY-DRILL-CONTRACT.md`.
