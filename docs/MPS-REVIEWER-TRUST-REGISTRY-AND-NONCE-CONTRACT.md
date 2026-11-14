# MPS P1.12 — Durable Reviewer Trust Registry & Single-Use Nonce Contract

**Status:** Synthetic workbench contract only. **Not production-ready.**
**Data:** Synthetic reviewer identities, ephemeral Ed25519 keys, synthetic evidence bundles.
**Scope:** Reviewer key registration/revocation, immutable key history, durable nonce issuance/consumption, and replay/crash recovery behavior.

## 1. Security boundary

The implementation in \`tests/official-draw/durable-reviewer-trust-registry.mjs\` is a local Node.js filesystem prototype. It is not an identity provider, OIDC verifier, HSM/KMS, distributed database, external immutable journal, or production authorization service. An injected \`authorizeAdmin(context, action)\` callback is an explicit integration seam; the synthetic tests use a fixed test policy. A future service must validate an authenticated, individually managed admin identity server-side before calling the registry. Client-supplied actor fields are not authentication.

The prototype accepts Ed25519 public keys only. Private keys are never accepted or stored. A key record is immutable and identified by a never-reusable \`keyId\`; rotation registers a new key ID and preserves the old public-key record for historical evidence verification.

## 2. Trust registry events

The append-only local JSONL journal records four exact-schema events:

- \`KEY_REGISTERED\`: key ID, issuer, immutable reviewer subject, public-key PEM, SHA-256 fingerprint, and validity interval.
- \`KEY_REVOKED\`: key ID and explicit effective timestamp.
- \`NONCE_ISSUED\`: SHA-256 digest of a cryptographically random 256-bit challenge and expiry. The plaintext nonce is returned once to the caller and is not written to the journal.
- \`NONCE_CONSUMED\`: nonce digest, exact attestation digest, and exact evidence-bundle digest.

Every record is sequence-numbered and linked through a SHA-256 hash chain. The file is fsynced after each append; the containing directory is fsynced on first creation. A same-host process lock serializes independent registry instances. A dead same-host PID lock may be atomically quarantined; live, foreign-host, ownerless, or malformed locks fail closed. The journal has a hard record cap and requires a controlled archival/migration design before that cap is reached.

## 3. Rotation, expiry, and revocation semantics

- Key IDs are never overwritten or reused.
- Routine rotation registers a new key ID. Old key records remain available for historic verification.
- Key validity is evaluated at the attestation's \`issuedAt\`, not at the later verification time. An attestation signed while the key was valid remains historically verifiable after normal key expiry.
- Revocation includes an explicit \`effectiveAt\`. Attestations issued before that instant may remain historically verifiable; attestations issued at or after it are rejected.
- A real compromise response may require a separately governed retroactive compromise timestamp and evidence re-evaluation. This prototype does not infer compromise time or decide whether prior signatures remain trustworthy.
- Duplicate registration, duplicate revocation, unknown key IDs, malformed keys, invalid validity windows, unauthorized admin actions, private-key PEM input, and reuse of a previously registered public-key fingerprint fail closed.

## 4. Single-use nonce protocol

1. An independently authenticated trust administrator requests a nonce.
2. The registry creates 32 random bytes, returns the base64url challenge once, and durably stores only its SHA-256 digest and expiry.
3. Reviewer signs the provenance attestation with that nonce and an expiry no later than the nonce expiry.
4. Verifier resolves the immutable key ID, checks key/revocation history, checks nonce issuance and expiry, verifies the detached Ed25519 signature and exact evidence-bundle digest, then appends \`NONCE_CONSUMED\` while holding the same cross-instance lock.
5. Concurrent replay attempts serialize; only one can consume the challenge. Invalid signatures do not consume a nonce. A consumed nonce remains consumed after restart.
6. If an append acknowledgement is uncertain, reopen and reconcile from the journal before retrying. A complete durable consume is replay-rejected; an incomplete final line is discarded only during recovery.

The verifier continues to report \`googleSourceCryptographicallyAuthenticated: false\`. A reviewer signature binds reviewer assertions to a particular normalized evidence bundle; it does not authenticate Google Cloud Audit Logs or prove those assertions true.

## 5. Local test contract

Run:

\`\`\`sh
node --test tests/official-draw/durable-reviewer-trust-registry.test.mjs
\`\`\`

Synthetic tests cover authorization denial, separation of duties, key registration and immutable IDs, private-key rejection, duplicate key-material rejection even after revocation, rotation and historical verification after expiry, revocation effective-time behavior, restart persistence, exactly-once nonce consumption, cross-instance replay serialization, invalid-signature retry, nonce expiry and plaintext non-storage, exact-schema/hash-chain tampering, incomplete-tail recovery, and dead same-host lock recovery. Local run at implementation review: **12 PASS, 0 FAIL, 0 SKIP**; clean-checkout GitHub Actions result is still pending/unconfirmed.

## 6. P1.13 crash-recovery fault-injection extension

The registry accepts a test-only `testFaultInjector` seam in its local Node.js prototype. The CI suite launches a child process and terminates it while the `NONCE_CONSUMED` append is in progress at two deterministic boundaries:

- `AFTER_WRITE_BEFORE_SYNC`: after journal bytes are handed to the file handle but before `fsync`. This models process termination, **not** power loss or storage-device cache loss. On restart, the complete record may be present or the trailing incomplete record may be truncated; either outcome must permit at most one eventual successful consumption.
- `AFTER_SYNC_BEFORE_ACK`: after the journal file (and initial directory entry when applicable) has been synced, but before in-memory application/acknowledgement. Restart must recover the consumed state and reject replay.

Both cases terminate the child while it owns the lock. The parent reopens the registry, exercises stale same-host PID lock recovery, reconciles the journal, and asserts the final consumed-nonce count is exactly one. These are local process-crash tests only; they do not simulate power failure, kernel panic, disk-controller cache loss, network filesystem behavior, or multi-host failover.

The test-only hook is not an operational production feature and must not be wired to user-controlled input.

## 7. Known limitations and production gates

- Local filesystem only; no multi-host or network-filesystem guarantees, transactional database, managed backup/restore, external hash anchor, or tamper-proof retention.
- Hash chain in the same writable file can be rewritten by an attacker able to replace the entire file and recompute hashes.
- PID-based lock recovery is same-host only and is not a distributed consensus/lease protocol.
- The admin authorization callback is only a seam. There is no OIDC/JWKS/MFA/session/step-up validation or real administrator registry.
- No key ceremony, HSM/KMS custody, independent out-of-band trust bootstrap, root-key governance, emergency compromise workflow, or external audit of trust changes.
- No authenticated raw Google Cloud log retrieval or real GCS project/bucket/IAM/audit-sink/retention tests.
- No real winner algorithm, beacon signature verification, official draw, or publication integration.

Before production use, move trust state and nonce consumption to a transactional, independently administered service; authenticate admin and reviewer subjects using a tested identity provider; anchor the trust journal externally; define key ceremony/rotation/compromise and recovery runbooks; test crash/restore and multi-region failure; and obtain independent security review.

**Release status:** Official winner draw remains **BLOCKED / NO-GO**. MPS Lucky Roulette remains **SIMULATION ONLY**. No cloud resource, billing, identity provider, credentials, private key, production database/member record, Apps Script deployment, or live service was created or changed by this phase.
