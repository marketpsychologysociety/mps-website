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

Before the public-projection fixture was added, a local test run against a reconstructed working copy recorded **8 PASS, 1 SKIP, 0 FAIL**. The privacy SKIP was the known gap addressed by the latest workbench change. The updated suite was executed by GitHub Actions from a clean checkout. Workflow run #173 at commit `56379ed9bc11a07bd01d0455fff35d8f06106b56` completed successfully: Official Draw contract **10 PASS, 0 FAIL, 0 SKIP**; schema compatibility **9/9 PASS**; read-only inspector **5 scenarios PASS**; Chromium browser suite **PASS**.

| Area | Status |
|---|---|
| Threat model and abuse-case plan | Documented |
| API and data contract | Documented |
| Adapter-based integration scaffold | Present |
| Synthetic loopback sandbox adapter | Present; in-memory and test-only |
| Earlier narrow sandbox contract run | 8 PASS, 1 SKIP on reconstructed working copy; superseded by privacy-fixture update |
| Public projection fixture and serializer | Implemented; allowlist verified in CI run #173 |
| Canary privacy test through public HTTP routes | 10-test suite PASS; 0 SKIP in CI run #173 |
| Official Draw API implementation in inspected workbench | Not found |
| OIDC | Not implemented |
| Durable synthetic journal | Exact record allowlist; 8/8 CI tests PASS in run #180; API integration pending |
| Public projection privacy test | Synthetic API canary test PASS; production CMS/cache/log privacy remains unverified |
| Cryptographic verifier integration | Not implemented |
| Official winner draw | **BLOCKED** |
| Frontend roulette | **SIMULATION ONLY** |

## 7. Safety boundary

This isolated workbench update adds test-only local journal code and documentation. No production branch, Apps Script deployment, database, spreadsheet, Drive file, Script Property, identity provider, cloud resource, webhook, or member record is created, modified, or accessed.


### P0 public projection privacy gate — verified update (2026-11-11)

A synthetic private fixture, strict allowlist serializer, anonymous collection/detail routes, and canary assertions are now present. The CI privacy test traverses the loopback HTTP routes, checks all synthetic canaries and exact public field sets, and checks empty/unknown results. Workflow run #173 completed successfully with **10 PASS, 0 FAIL, 0 SKIP** for the Official Draw contract suite. The full workflow also passed schema compatibility (9/9), read-only inspector (5 scenarios), and Chromium PWA/browser checks.

This closes the known **sandbox** privacy-test skip only. Production CMS/Apps Script integration, production caches/logs, OIDC, durable persistence/journal, beacon verification, and official winner selection remain unimplemented or unverified. Official draw remains **BLOCKED** and roulette remains **SIMULATION ONLY**. No production system was changed.


## P1.1 — durable synthetic audit journal prototype (2026-11-11)

**Implemented in isolated workbench:** `tests/official-draw/durable-audit-journal.mjs` is a local-file, append-only JSONL journal with sequential records, SHA-256 hash chaining, file fsync, initial directory fsync, recovery on reopen, durable INTENT/COMPLETION records, idempotency-key replay/conflict handling, serialized concurrent writes within one process, bounded completion-result allowlist, and fail-closed integrity validation. A truncated final line is discarded during recovery; malformed complete records and hash-chain tampering are rejected.

**Fault-injection coverage:** tests inject failures before append, after write but before fsync, and after fsync but before acknowledgement. Uncertain write outcomes block further writes until reopen/reconciliation. A durable intent whose acknowledgement was lost is recovered and replayed without creating a second intent.

**Local evidence:** Node.js 22 syntax checks passed. GitHub Actions clean-checkout run #175 completed the committed journal suite with **7 PASS, 0 FAIL, 0 SKIP**; the full workflow succeeded.

**Important scope boundary:** this is a single-process, local-filesystem test prototype, not yet integrated into the loopback Draw API adapter or its event/draw state transitions. It has no cross-process lock, database transaction, external hash anchor, independent tamper-proof storage, backup/restore process, OIDC identity, or production hardening. A hash chain detects accidental/partial tampering but an attacker able to rewrite the whole file can recompute the chain. Do not store real participant data or secrets in it. Production official draw remains **BLOCKED / NO-GO**; roulette remains **SIMULATION ONLY**.


### P1.1 readiness status

The standalone journal prototype is implemented and locally tested (11 PASS, 0 FAIL, 0 SKIP). It provides local append/fsync, hash-chain verification, reopen recovery, idempotency and injected-failure handling. It is not yet integrated with the loopback API; there is no cross-process lock, transactional database, external anchor or production durability acceptance. API-level restart/fault-injection tests remain pending.


### P1.1 CI verification — 2026-11-11

**Clean GitHub Actions evidence:** workflow run #175 on commit `44d23528692539846238462335a4ce4b21e9c843` completed successfully from a clean checkout. The durable synthetic journal fault-injection suite reported **7 PASS, 0 FAIL, 0 SKIP**. The same workflow also passed the Official Draw contract (**10/10**), schema compatibility (**9/9**), read-only inspector (**5 scenarios**), and Chromium PWA/browser checks. Workflow run #176 on documentation-correction commit `a1b2ea9589013c06e3ad5ba14d36a12367296209` also completed successfully.

This proves only the standalone synthetic journal prototype and the repository's existing synthetic/browser checks in GitHub Actions. The journal is still not integrated into the loopback Draw API state transitions. It is single-process local-file storage without a cross-process lock, transactional database, or external hash anchor. API-level restart/fault-injection tests remain the next gate. Official draw remains **BLOCKED / NO-GO** and roulette remains **SIMULATION ONLY**.


### P1.1 strict journal schema hardening — verified CI (2026-11-11)

The recovery verifier now requires an exact record-key allowlist; unknown extra fields fail closed before hash-chain application. A synthetic canary test confirms that an unexpected private payload field is rejected during recovery. Completion results also remain restricted to the bounded allowlist.

**GitHub Actions run #180** on commit `ec9c3df600dbd7e3509f56dc9e620309aa4fb606` completed successfully from a clean checkout: durable journal suite **8 PASS, 0 FAIL, 0 SKIP**; Official Draw contract **10 PASS**; schema compatibility **9/9**; read-only inspector **5 scenarios**; Chromium PWA/browser checks passed. Overall workflow: **SUCCESS**. The immediately preceding run #179 failed because the new canary test reached CI one commit before its matching exact-schema guard; the follow-up commit added the guard, and run #180 verified the combined change green.

This closes the standalone journal's synthetic test gap only. The journal is not yet integrated into API state transitions and remains single-process local-file storage without a cross-process lock, transactional database, or external hash anchor. API-level restart/fault-injection tests remain next. Official draw remains **BLOCKED / NO-GO**; roulette remains **SIMULATION ONLY**.

## P1.2 — persistent HTTP sandbox integration (2026-11-11)

A separate test-only adapter, tests/official-draw/persistent-local-sandbox-adapter.mjs, now connects HTTP draw execution to the P1.1 durable audit journal. Completed allowlisted aggregate records rebuild synthetic draw state on process startup. An incomplete durable intent causes the associated draw to restore as RECONCILIATION_REQUIRED; the API rejects a duplicate attempt rather than silently executing again.

tests/official-draw/persistent-api-integration.test.mjs now contains five child-process HTTP integration cases: process-restart state recovery, idempotency replay/conflict, concurrent execute serialization, crash after intent, crash after in-memory mutation, and durable completion with lost acknowledgement. The last case proves that a completion already fsynced is recovered as completed and replayed rather than executed again. CI runs this suite.

**CI verification:** GitHub Actions run #200 on commit 2e4934e022871dcb5d1178481bc0c6136db9f789 completed successfully from a clean checkout. The durable journal suite (including aggregate allowlist/recovery) and persistent HTTP API integration suite both passed; the full workflow also passed PWA/privacy, schema compatibility, Official Draw contract, read-only inspector, and Chromium browser checks. Run: https://github.com/marketpsychologysociety/mps-website/actions/runs/42937357517.

Scope limits: this is still a single-process local-file prototype. It has no cross-process locking, transactional database, external hash anchor, OIDC/MFA, beacon signature verifier, fair selection algorithm, or production suitability. Crash reconciliation is fail-closed but requires a separate reviewed recovery procedure. Official draw remains BLOCKED / NO-GO; roulette remains SIMULATION ONLY.
