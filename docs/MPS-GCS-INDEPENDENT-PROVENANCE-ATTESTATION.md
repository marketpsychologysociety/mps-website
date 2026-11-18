# P1.11 — Independent source provenance attestation verifier

**Status:** implemented as an offline Ed25519 attestation verifier with synthetic keys and fixtures. This is not a Google-issued signature verifier, GCP API client, identity provider, or actual-provider test.

## Purpose and trust boundary

P1.10 checks the structure and byte integrity of raw Cloud Audit Log captures. P1.11 adds a separate provenance layer: an independently governed reviewer signs a statement binding a specific evidence bundle, project, bucket, query digest, retrieval window, page/entry counts, and one-time challenge to a pinned reviewer public key.

A successful result means only that:
1. the detached Ed25519 signature verifies under the supplied trust key;
2. the key's issuer/subject and validity/revocation metadata match the signed reviewer identity;
3. the signed claims bind to the exact canonical evidence bundle and expected project/bucket/query/challenge;
4. the signed assertion records independent authenticated retrieval and Data Access coverage.

It does **not** mean Google cryptographically signed the records. The field googleSourceCryptographicallyAuthenticated is always false. It also cannot prove that signed reviewer assertions are true. Those depend on governance of the key, the reviewer's actual authenticated retrieval process, and independent operational oversight.

## Verification sequence

1. Run P1.10 normalizeGcsRawAuditEvidence first and require ok === true. The provenance verifier does not replace raw log parsing, method mapping, page manifest validation, or expected event checks.
2. Obtain the raw evidence bundle and its query/filter digest from a restricted evidence store. Do not commit real raw logs or signatures to the public repository.
3. Obtain the reviewer trust record from an out-of-band, independently administered trust registry. The public key must not be supplied by the exporter or embedded in the attestation being verified.
4. Generate a fresh one-time challenge in the caller's durable state and pass it as expectedNonce. Consume it atomically after successful verification; the offline module does not implement durable replay prevention.
5. Supply expected project ID, bucket, query SHA-256, and trusted clock time from the caller's controlled context.
6. Verify the detached Ed25519 signature over the canonical payload and compare all claims to the exact bundle and caller context.
7. Preserve the attestation, trust-key version, verifier version, decision, and evidence digest in the separately controlled audit journal.

## Signed payload

The strict payload binds:
- schema version, pinned key ID, issuer, immutable reviewer subject, exporter subject, and authenticated retrieval principal;
- project ID, bucket, start/end time, exact query/filter SHA-256;
- canonical raw bundle SHA-256, page count, entry count, and pagination completion;
- fixed retrieval method identifier, retrieval timestamp, reviewer authentication-context assertion, independent source-access assertion, and Data Access coverage assertion;
- one-time nonce, issue time, and expiry.

The reviewer subject must match the independently pinned trust record and authenticated retrieval principal, and must differ from the exporter subject. Attestations are limited to 24 hours, must be current, and must fall within the trust key's validity interval. Revoked keys, unknown fields, malformed signatures, wrong scope, altered bundle bytes, incomplete pagination, mismatched query digest, and nonce mismatch fail closed.

## Key governance requirements

- Trust records must be provisioned and approved out of band by a separate security administrator. Never trust a public key that arrives beside the evidence it claims to validate.
- Use individually assigned reviewer identities with MFA/step-up and a documented key-issuance process. The signed reviewerAuthContext is still an assertion; it is not independently proven by this offline verifier.
- Keep private signing keys outside the repository and outside exporter control. Prefer a managed signing key/HSM or controlled offline signing workflow; establish rotation, revocation, compromise response, and dual approval.
- Pin key ID, issuer, subject, algorithm, validity and revocation state in a controlled trust registry. This fixture module accepts Ed25519 only.
- The caller must persist and atomically consume each challenge nonce. A stateless signature verifier alone cannot prevent replay.
- Keep reviewer and exporter as distinct real people/subjects, not merely different labels for one shared account.
- Independent reviewers must repeat retrieval from authenticated Cloud Logging access and compare the result set. The signed attestation is evidence of the reviewer's statement, not a substitute for this work.

## What this does not prove

It does not verify Google TLS sessions, OAuth tokens, Cloud Logging API response signatures, raw log authenticity, query completeness, log configuration, live IAM, retention, immutable storage, reviewer MFA, or the truth of the reviewer's assertions. It does not verify a GCP signed export because no such signed-export contract is implemented here. It does not provision cloud resources or access credentials.

## Test and release status

Run:
node --test tests/official-draw/gcs-evidence-provenance-verifier.test.mjs

Tests generate ephemeral Ed25519 keys at runtime and use synthetic evidence only. They cover valid signatures, bundle alteration, signature tampering, reviewer/key substitution, revoked/expired keys, expiry, nonce mismatch, incomplete pagination, source/query scope mismatch, reviewer/exporter identity reuse, missing independent-access/Data Access assertions, malformed schemas and invalid verifier context.

A passing test suite is not a live source-authenticity result. Real provenance acceptance remains blocked until the trust registry, identity issuance, authenticated retrieval, nonce store, key lifecycle, restricted evidence storage, and independent reviewer process are implemented and separately validated.

No GCP project, bucket, billing, IAM, service account, audit sink, credential, retention lock, production data, Apps Script integration, or deployment is created by P1.11. Official winner draw remains **BLOCKED / NO-GO**; roulette remains **SIMULATION ONLY**.
