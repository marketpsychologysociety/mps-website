# P1.30 — Signed recovery-checkpoint attestation contract

**Status:** offline cryptographic contract and synthetic tests only. **Not an operational trust system.**

## Purpose

P1.29 compares a restored SQLite database with an expected logical checkpoint, but its test fixture creates that checkpoint in the same process. P1.30 adds a detached Ed25519 signature contract so a separately governed reviewer can attest to an exact checkpoint and bind it to an opaque source/checkpoint identifier and one-time nonce.

## Contract

- Exact checkpoint schema: format version, schema SHA-256, logical-content SHA-256, and row counts.
- Exact signed payload: schema version, immutable key ID, issuer, reviewer subject, exporter subject, checkpoint/source IDs, checkpoint digest, nonce, issue/expiry times, and reviewer-auth-context assertion.
- Exact trust record: key ID, issuer, subject, Ed25519 public key, validity interval, and revocation state.
- The verifier checks canonical serialization, exact field allowlists, signature encoding and Ed25519 signature, checkpoint digest, source/checkpoint scope, reviewer/exporter separation, nonce equality, key validity/revocation, and a maximum 24-hour attestation lifetime.
- Any malformed or unknown field fails closed.

## Nonce and identity boundary

This module is deliberately pure and does not issue or consume nonces. A real caller must obtain a high-entropy nonce from an independently authenticated durable registry and atomically consume it exactly once after successful verification. The supplied trust record must be pinned out-of-band and governed by a separate identity/key-registration process. reviewerAuthContext is a signed assertion, not proof of MFA. The verifier does not authenticate a human, authenticate the database source, or prove checkpoint completeness.

## Tests

Twelve synthetic tests cover valid signature acceptance, checkpoint tampering, scope substitution, nonce mismatch, reviewer/exporter collision, key revocation, signature tampering, expired/future/overlong attestations, malformed/unknown fields, trust identity mismatch, and invalid verifier context.

Run:
```sh
node --test tests/official-draw/recovery-checkpoint-attestation.test.mjs
```

## Release boundary

No real keys, identities, nonce registry, cloud resources, provider receipts, production DB, member data, Apps Script, Sheets, Drive, Telegram, DNS, hosting, or deployment are used or changed. This contract is SYNTHETIC. Official winner draw remains **BLOCKED / NO-GO**; MPS Lucky Roulette remains **SIMULATION ONLY**.
