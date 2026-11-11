# P1.23 — isolated technical acceptance harness

**Evidence class:** SYNTHETIC  
**Status:** local contract harness added; operational integrations remain untested  
**Production decision:** official winner draw **BLOCKED / NO-GO**; roulette **SIMULATION ONLY**

## Scope delivered

P1.23 adds a Node.js built-in-only harness at:

- `tests/official-draw/isolated-acceptance-harness.mjs`
- `tests/official-draw/isolated-acceptance-harness.test.mjs`

The harness is deliberately independent of member data, cloud providers, external packages, Apps Script, production endpoints and credentials. It models only a narrow subset of P1.22 acceptance invariants.

Coverage:

1. Canonical JSON serialization with sorted object keys, plain-object enforcement and rejection of non-finite numbers.
2. SHA-256 digest over canonical synthetic payloads.
3. Strict event-creation input allowlist; identity, role, participant and unknown fields are rejected.
4. Deny-by-default role/action matrix, object ownership and same-subject separation-of-duties checks.
5. Public winner projection accepts only PUBLISHED + VERIFIED records with exact public/proof field allowlists; internal state is stripped.
6. Synthetic serialized execution model checks owner, expected version, allowed state, idempotency replay/conflict and a serialized concurrent request pair.
7. Fault points before commit and after commit/before acknowledgement, including replay of a committed operation after lost acknowledgement.
8. Synthetic outbox remains PENDING; no notification is sent.

A dedicated CI step runs:

`node --test tests/official-draw/isolated-acceptance-harness.test.mjs`

## Important limits

This harness is not the future Draw API and must not be mistaken for a database transaction implementation:

- Authorization receives synthetic role/subject values; no OIDC, MFA, token signature, issuer, audience, session or CSRF validation is implemented.
- The in-memory Maps and promise queue are a deterministic contract model only. They do not provide durable commits, database isolation, cross-process locking, crash recovery or transactional outbox semantics.
- The fault points simulate return paths; they do not kill a process or test filesystem/power-loss behavior.
- The SHA-256 digest is not a signature, beacon proof, participant-roster commitment or unbiased winner-selection protocol.
- Public projection tests do not exercise Apps Script, the live CMS, browser caches or a deployed public endpoint.
- No real participant/member data, PII, credentials, tokens, provider accounts, cloud resources, database, IAM, KMS, audit sink, deployment or production configuration is used or changed.

## Acceptance result interpretation

A passing suite establishes only that these synthetic functions satisfy their asserted contracts. It is not evidence of operational G0–G11 readiness and does not lift any production release blocker.

## Next safe work

The next implementation increment should be a genuinely isolated persistence/API adapter with a real transactional datastore and separately authenticated test identities, only after its environment, ownership, data boundary, and cost are approved. Do not label a local in-memory model as database integration. Real provider, OIDC/MFA, cryptographic beacon verification, independent audit provenance, off-site restore and human dual-control evidence remain separate gates.


## Verification record

- All six P1.23 artifacts were fetched back from the workbench after writes: harness module, test module, this specification, CI workflow, README and workbench plan.
- Source review caught and corrected three harness defects before final readback: public projection initially retained an internal-state allowlist mismatch; the UTC timestamp pattern was corrected to allow optional milliseconds; owner/reviewer identity context now fails closed when missing.
- Additional negative cases cover unsupported canonical JSON values, sparse arrays, cyclic values, malformed nested proof fields, missing owner subject and missing independent reviewer subject.
- The P1.22 clean-checkout workflow run #363 (42961399082) has now been independently checked and completed **SUCCESS**, including all existing synthetic suites and Chromium checks. This run predates the P1.23 harness.
- The P1.23 workflow step is committed and present in the workbench workflow. A completed CI result for the P1.23 commit is not yet available in the evidence checked for this record; do not count the P1.23 suite as CI-passed until that run is confirmed.
- Workbench remains isolated from main; no merge, deployment, cloud resource, database, member data or production configuration was changed.

- Follow-up review hardened authorization and public projection against null, inherited, accessor-based, symbol-keyed and non-enumerable properties; request validation now rejects hidden extra fields. The synthetic tests include these hostile object-shape cases and impossible calendar timestamps.
- Idempotency scoping now uses an unambiguous tuple encoding and fingerprints the expected version as part of the request. Invalid key/version/payload types fail closed. This remains an in-memory synthetic model, not durable idempotency.

- Cross-check against the P1.22 authorization matrix removed an overbroad synthetic grant: `DRAW_SECURITY_ADMIN` is not permitted to create draw events; `SERVICE_IDENTITY` cannot approve rules; publisher cannot execute draws. The harness remains a deliberately narrow subset, not the complete P1.22 matrix.


## Follow-up hardening review

A further source review identified canonicalization and projection edge cases that could otherwise make a synthetic digest ambiguous or accept an object that does not serialize as expected:

- Canonical JSON now rejects non-enumerable object properties rather than silently omitting them from the digest.
- Array element access uses own data descriptors; accessor-backed and non-enumerable array indices are rejected without invoking getters.
- Public winner projection now requires enumerable own data properties throughout the record and proof, and requires string types before applying identifier/hash/round patterns.
- Regression cases were added for hidden object fields, object/array getters, non-enumerable array elements, hidden public fields and malformed proof types.

These are source-level changes and regression assertions only. They must not be described as passing until the P1.23 test command has actually completed in CI or a local Node.js runtime. The synthetic scope and all operational NO-GO gates remain unchanged.


## CI failure diagnosis and correction

The first observed P1.23 CI execution on the hardened source completed the first five checks successfully, then reported **6 passed / 1 failed** in the seven-test suite. The failing assertion expected `INVALID_STATE` after a successful draw transition but reused `expectedVersion: 1`; the harness correctly rejected the stale version first with `VERSION_MISMATCH`. The test fixture has been corrected to use the current version (`expectedVersion: 2`) when specifically asserting the subsequent invalid-state condition. This is a test-fixture correction; the production model's version-before-state guard is unchanged.

A new CI run is required to establish the corrected result. Until that run completes, P1.23 remains **not yet CI-passed**.
