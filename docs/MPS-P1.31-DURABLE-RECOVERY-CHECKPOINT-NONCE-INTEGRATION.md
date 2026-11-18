# P1.31 — Durable recovery-checkpoint nonce integration

**Status:** synthetic local integration only. **Not a production identity or trust service.**

## Objective

Connect the P1.30 Ed25519 recovery-checkpoint attestation verifier to the existing append-only reviewer trust registry and its durable single-use nonce journal. The goal is to close the gap between a pure signature verifier and a durable replay-prevention boundary.

## Implementation

- Adds `verifyAndConsumeRecoveryCheckpoint` to the test-only `DurableReviewerTrustRegistry`.
- Resolves the reviewer key only from the registry's pinned key records; callers cannot submit an arbitrary trust key to this operation.
- Looks up the nonce by SHA-256 digest; plaintext nonce is never written to the journal.
- Checks nonce issuance/expiry scope and reviewer key validity/revocation at attestation issuance time.
- Calls the P1.30 verifier with the registered Ed25519 public key and exact checkpoint/source identifiers.
- On successful signature and checkpoint verification, appends a durable `NONCE_CONSUMED` journal event with attestation digest and checkpoint digest while holding the registry's cross-process lock.
- Invalid signatures do not burn a nonce. Replays are rejected after restart and concurrent registry instances serialize to one successful consumption.
- Existing GCS provenance verification behavior remains unchanged.

## Tests

Six synthetic tests cover successful attestation plus durable consumption, invalid-signature retry, restart replay rejection, concurrent independent registry instances, effective-time key revocation with historical evidence preservation, and nonce expiry/plaintext privacy.

Run:
```sh
node --test tests/official-draw/recovery-checkpoint-nonce-integration.test.mjs
```

## Security boundaries

The registry's authorization adapter is still an injected test seam, not real OIDC/MFA. Local JSONL plus same-host filesystem locking is not multi-host or network-filesystem safe, and the hash chain has no independent external anchor. The trust record is only as reliable as its out-of-band provisioning. This integration does not prove reviewer identity, checkpoint completeness, source authenticity, external immutable retention, production recovery, or operational dual control. The test suite uses synthetic keys, identities, checkpoints and nonces only.

No production database, member data, real identity provider, cloud project, bucket, IAM, credentials, Apps Script, Sheets, Drive, Telegram, DNS, hosting, or deployment is accessed or changed. Official winner draw remains **BLOCKED / NO-GO**; MPS Lucky Roulette remains **SIMULATION ONLY**.
