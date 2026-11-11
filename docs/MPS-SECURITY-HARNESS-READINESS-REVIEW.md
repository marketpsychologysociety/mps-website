# MPS Security Harness Readiness Review

**Review date:** 2026-11-11  
**Branch:** `mps-v4.8-workbench`  
**Status:** Harness scaffold exists; real backend integration is blocked  
**Production impact:** None

## 1. Executive decision

The existing `tests/official-draw/security-contract.test.mjs` is an adapter-based integration-test scaffold. It is not a backend, a security simulator, or evidence that the official draw API is secure.

The repository workbench contains the API contract and test scaffold, but no official Draw API implementation or runnable backend package was found in the inspected branch contents. The scaffold's README also explicitly says it is not connected to an implementation. A synthetic adapter that simply returns expected responses would make the suite appear green without exercising authentication middleware, authorization, persistence, or state transitions. That would be misleading and is therefore rejected.

**Decision:** Do not create a pass-producing mock adapter under the integration adapter interface. First implement a disposable local Draw API that exercises the same handlers, middleware, state machine, and persistence boundary intended for the eventual service. Then write an adapter that calls that local API.

## 2. Existing scaffold verified

The following files were read back from GitHub on `mps-v4.8-workbench`:

- `tests/official-draw/security-contract.test.mjs`
- `tests/official-draw/README.md`

The scaffold currently:
- requires explicit `MPS_DRAW_TEST_ALLOW_LOCAL=1`;
- requires a local adapter file;
- checks the adapter's `baseUrl` for localhost/loopback;
- requires synthetic actor handles and fixture/reset/request methods;
- skips backend integration cases when no adapter is supplied;
- defines seven integration scenarios covering actor spoofing, same-subject dual control, auditor denial, idempotency conflict, cross-event access, privacy canaries, and publication of unverified results.

The README correctly states that SKIP is not PASS and that adapter source must be reviewed before execution.

## 3. Gaps to close before trusting a green run

### 3.1 The adapter boundary is not itself a security boundary

The runner can inspect the adapter's declared `baseUrl`, but it cannot prove that arbitrary adapter code does not make requests elsewhere, use hidden credentials, or bypass the API. Adapter source review and process/network isolation remain mandatory.

The adapter must not be allowed to change its target after validation. Prefer an immutable parsed base URL, strict origin comparison on every request, no redirects, no proxy configuration, and a disposable environment with outbound network denied.

### 3.2 Existing assertions need stronger state/evidence checks

- Actor-spoofing test must verify the persisted audit/journal actor is the server-authenticated subject, not merely inspect selected response fields.
- Dual-control test must verify that a second session for the same immutable issuer+subject is rejected and that no approval record/state transition was written.
- Idempotency test must verify canonical request digest conflict, exactly one durable operation, and safe replay response.
- IDOR test should cover both read and mutation attempts and verify no cross-tenant/event side effect.
- Privacy test should inspect every public endpoint and serialized response, including errors, logs exposed to clients, caches, and ticker/announcement projections.
- Unverified publication test must verify durable state remains unchanged and no public artifact/event was emitted.
- Add missing/revoked identity, invalid issuer/audience/nonce/expiry, CSRF, role escalation, stale version, race, partial journal write, and reconciliation cases from the threat model.

Tests must assert durable postconditions, not only HTTP status codes.

### 3.3 Fixture setup must be isolated

Fixture creation may use a dedicated test-only interface, but test actions must traverse the actual API handlers and authorization middleware. Test fixtures must be synthetic and must never touch Apps Script production deployments, production spreadsheets, Drive, Script Properties, webhooks, or real identity-provider accounts.

### 3.4 Cryptographic tests need a real verifier boundary

A fake beacon vector may be used for deterministic unit tests, but it must not establish production signature-verification readiness. The integration suite must exercise the selected verifier implementation with pinned test vectors, invalid signatures, wrong chain configuration, malformed encodings, and replay/wrong-round cases. A relay response such as `verified: true` is never sufficient evidence.

## 4. Required implementation sequence

1. Create a separate local Draw API package or service; do not put privileged draw endpoints on the public GitHub Pages frontend.
2. Implement server-validated OIDC session handling and immutable issuer+subject actor identity.
3. Implement role authorization and distinct-subject dual control.
4. Implement the state machine, optimistic version checks, durable idempotency, and reconciliation behavior.
5. Implement isolated synthetic persistence and a durable operation/journal interface.
6. Implement private snapshot creation and digest binding.
7. Integrate a real beacon signature verifier and deterministic selection implementation; no client-side winner selection.
8. Implement a strict public projection allowlist.
9. Write the adapter to call the local HTTP API only; disable redirects and reject any origin change.
10. Run the full synthetic suite, fault injection, independent proof reproduction, browser and Android tests before any release review.

## 5. Acceptance gates

A local integration run is eligible for review only when all are true:

- the API process is bound to loopback and runs against disposable synthetic storage;
- adapter source and all imported dependencies have been reviewed;
- outbound network is denied except for explicitly isolated local test dependencies;
- every test traverses the real API route and middleware;
- assertions verify durable state and journal postconditions;
- all tests are PASS (not SKIP/ERROR), with test output and commit SHA retained;
- no live member data, production credentials, production services, or real beacon rounds are used.

Passing this suite alone is not a security certification and does not authorize deployment.

## 6. Current status

| Area | Status |
|---|---|
| Threat model and abuse-case plan | Documented |
| API and data contract | Documented |
| Adapter-based integration scaffold | Present |
| Official Draw API implementation in inspected workbench | Not found |
| Real adapter | Not created |
| Backend integration tests | Not run |
| Cryptographic verifier integration | Not implemented |
| Official winner draw | **BLOCKED** |
| Frontend roulette | **SIMULATION ONLY** |

## 7. Safety boundary

This review changes documentation only. No production branch, Apps Script deployment, database, spreadsheet, Drive file, Script Property, identity provider, cloud resource, webhook, or member record is created, modified, or accessed.
