# P1.32 — Recovery-checkpoint nonce crash recovery

**Status:** synthetic same-host process-crash fault injection only.

## Objective

Exercise the P1.31 recovery-checkpoint nonce-consumption path when a child process terminates while holding the trust-registry lock. The test distinguishes an append interrupted before fsync from a durable append whose acknowledgement is lost.

## Fault scenarios

1. **AFTER_WRITE_BEFORE_SYNC:** the child exits after nonce-consumption bytes are written but before fsync. On restart, the journal may contain no complete committed record or may contain the complete record. The test reconciles both states: retry only if no consumption is present; otherwise reject replay. Exactly one eventual consumption is required.
2. **AFTER_SYNC_BEFORE_ACK:** the child exits after fsync but before the API acknowledges success. On restart, the nonce must already be consumed; replay is rejected and no second consumption is appended.

The existing crash worker now supports a recovery-checkpoint operation in addition to the existing GCS provenance operation. Only synthetic keys, checkpoint values, nonce and temporary directories are used.

## Tests

Two child-process tests cover the pre-fsync uncertain append and post-fsync lost acknowledgement.

Run:
```sh
node --test tests/official-draw/recovery-checkpoint-nonce-crash.test.mjs
```

## Limits

Controlled process termination is not physical power loss, kernel panic, controller-cache failure, filesystem corruption, network-filesystem behavior, or multi-host recovery. The trust registry remains local same-host JSONL with a hash chain but no independent external anchor. No real identity provider/MFA, production database, member data, cloud resources, or deployment is involved. Official winner draw remains **BLOCKED / NO-GO**; MPS Lucky Roulette remains **SIMULATION ONLY**.
