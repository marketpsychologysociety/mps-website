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

The integration suite starts and stops real child Node processes against one disposable temporary journal directory. It checks durable seed state, execute transition recovery after restart, idempotent replay, changed-payload conflict, and a forced process crash after the durable intent. An incomplete intent restores the draw as RECONCILIATION_REQUIRED; the same key cannot silently execute again.

Limitations remain material: single-process local filesystem only; no cross-process lock, transactional database, external journal anchor, OIDC/MFA, beacon verifier, unbiased selection algorithm, or production hardening. The fixture route exists only in this test adapter. Do not expose port 4179, use real data, or deploy it. Official winner draw remains BLOCKED / NO-GO and roulette remains SIMULATION ONLY.
