# P1.33 — Trust journal integrity failure containment and evidence preservation

**Status:** synthetic local-filesystem contract only.

## Finding and change

The prior registry loader automatically truncated an incomplete trailing JSONL record during startup. Although intended to recover a torn append, this modified the only local evidence copy before an operator could inspect it.

P1.33 changes this behavior to fail closed. Any non-newline-terminated trailing bytes now cause `REGISTRY_INTEGRITY_ERROR`; the loader does not truncate, rewrite, rename, quarantine, or delete the journal. Complete malformed JSON, unknown fields, sequence gaps, hash-chain mismatches and other schema violations likewise reject startup.

## Test coverage

Five new tests verify that the original bytes remain exactly unchanged after failed open for:
1. malformed complete JSON record;
2. hash-chain predecessor mismatch;
3. sequence gap;
4. incomplete trailing record;
5. unknown-field tampering.

The existing registry regression test was changed from automatic recovery to fail-closed preservation. Evidence must be copied and reconciled through the controlled manual runbook; this test harness intentionally does not implement an automatic repair path.

Run:
```sh
node --test tests/official-draw/reviewer-trust-integrity-preservation.test.mjs
node --test tests/official-draw/durable-reviewer-trust-registry.test.mjs
```

## Operational limits

This is a local synthetic JSONL registry, not an immutable external evidence store. Byte preservation is tested within the same host/filesystem process model and does not prove hardware-level forensic preservation, off-host backup, or resistance to privileged filesystem administrators. A hash chain without an independent anchor cannot prove authenticity if an attacker can rewrite the entire file. Manual reconciliation must use preserved copies and independent expected checkpoints; do not edit the only source journal in place.

No production DB, member data, cloud resources, credentials, identity provider, Apps Script, Sheets, Drive, Telegram, DNS, hosting, or deployment was accessed or changed. Official winner draw remains **BLOCKED / NO-GO**; MPS Lucky Roulette remains **SIMULATION ONLY**.
