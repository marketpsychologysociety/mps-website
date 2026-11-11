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
- `seedApprovedEvent({preparedBy, approvedBy})`: return `{ eventId, drawId, snapshotDigest }` for a synthetic event that has passed rules and snapshot approval.
- `seedDrawAtState({state, preparedBy, approvedBy})`: return a synthetic event/draw at the requested supported state.
- `request({method, path, actor, body, headers})`: make one request to the local sandbox API; actor is a synthetic adapter handle, not a client-supplied identity claim.
- `getPrivateCanaries()`: return synthetic canary strings seeded in private fields for leak detection.
- `getPublishedProjection()`: return public projection JSON, or null.
- `getOperationCount(drawId)`: return durable operation count for the draw.

The adapter must not bypass the API under test to make assertions pass. Fixture setup may use a documented sandbox-only fixture interface; test actions themselves must traverse the real API handler and authorization middleware.

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
