# MPS Security Harness Readiness Review

**Review date:** 2026-11-11  
**Branch:** `mps-v4.8-workbench`  
**Status:** Narrow synthetic loopback sandbox added; real backend integration and production-readiness remain blocked  
**Production impact:** None

## 1. Executive decision

The existing `tests/official-draw/security-contract.test.mjs` is an adapter-based integration-test scaffold. It is not a backend, a security simulator, or evidence that the official draw API is secure.

The repository workbench still contains no official Draw API implementation or production-intended backend package. A deliberately narrow synthetic loopback sandbox has since been added at `tests/official-draw/local-sandbox-adapter.mjs`. It runs a real local HTTP server and exercises a small set of authorization and state guards, plus anonymous public projection collection/detail routes backed by a synthetic private fixture and strict allowlist serializer. It uses in-memory fixtures and synthetic bearer tokens. It is not the eventual Draw API, does not implement OIDC, durable persistence, a tamper-evident journal, a beacon verifier, or winner selection.

**Decision:** The sandbox is useful for negative contract checks only. Its green tests must not be interpreted as evidence that the eventual service or production environment is secure.

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
- defines scenarios for actor spoofing, same-subject dual control, insufficient role, required/stale version checks, idempotency conflict, cross-owner read and execute attempts, public projection privacy, and publication of unverified results.

The local adapter binds to `127.0.0.1:4178`, uses fixed synthetic tokens, and stores state only in memory. It now rejects execution by a non-owner operator and requires current `If-Match` versions for approval, execution, and publication. The privacy scenario now seeds a synthetic private record, serializes a public allowlist projection, and calls both anonymous collection/detail routes over loopback HTTP. It checks canaries for name, raw ID, phone, email, Telegram, MT5, deposit, proof document, PIN, token, and participant reference; it also checks exact response field allowlists and empty/unknown-result behavior.

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

Before the public-projection fixture was added, a local test run against a reconstructed working copy recorded **8 PASS, 1 SKIP, 0 FAIL**. The privacy SKIP was the known gap addressed by the latest workbench change. The new test suite has been wired into the branch's GitHub Actions workflow; its result must be read from the resulting workflow run before claiming the new test passes. No clean-checkout/CI result for the updated suite is claimed yet.

| Area | Status |
|---|---|
| Threat model and abuse-case plan | Documented |
| API and data contract | Documented |
| Adapter-based integration scaffold | Present |
| Synthetic loopback sandbox adapter | Present; in-memory and test-only |
| Earlier narrow sandbox contract run | 8 PASS, 1 SKIP on reconstructed working copy; superseded by privacy-fixture update |
| Public projection fixture and serializer | Implemented in isolated sandbox; CI result pending |
| Canary privacy test through public HTTP routes | Added; CI result pending |
| Official Draw API implementation in inspected workbench | Not found |
| OIDC / durable persistence / journal | Not implemented |
| Public projection privacy test | Implemented in synthetic sandbox; production/cache/browser coverage still absent |
| Cryptographic verifier integration | Not implemented |
| Official winner draw | **BLOCKED** |
| Frontend roulette | **SIMULATION ONLY** |

## 7. Safety boundary

This review changes documentation only. No production branch, Apps Script deployment, database, spreadsheet, Drive file, Script Property, identity provider, cloud resource, webhook, or member record is created, modified, or accessed.
