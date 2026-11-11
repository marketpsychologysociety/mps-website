# P1.24 — Isolated SQLite Transactional Persistence Adapter

**Evidence class:** SYNTHETIC  
**Status:** local SQLite adapter and nine focused tests added; CI verification pending  
**Production decision:** official winner draw **BLOCKED / NO-GO**; roulette **SIMULATION ONLY**

## Objective

P1.23 established a narrow in-memory contract. P1.24 moves that same small execution boundary to a real file-backed SQLite database so atomic database transactions, constraints, idempotency persistence, and transactional outbox behavior can be exercised without provisioning a cloud database or touching MPS production data.

## Artifacts

- \`tests/official-draw/sqlite-transactional-store.mjs\`
- \`tests/official-draw/sqlite-transactional-store.test.mjs\`
- Dedicated CI command: \`node --test tests/official-draw/sqlite-transactional-store.test.mjs\`

The adapter uses Node.js built-in \`node:sqlite\` and the existing P1.23 canonical JSON function. It adds no npm dependency and is run only against temporary synthetic database files created by the test suite.

## Transaction design

A single \`BEGIN IMMEDIATE\` transaction performs:

1. Lookup of the scoped idempotency key \`(subject, draw_id, key)\`.
2. Replay of the original result for an identical canonical request digest, or conflict for a changed request.
3. Draw ownership, expected-version, and state precondition checks.
4. Conditional draw state/version update.
5. Durable idempotency operation insert.
6. Durable \`PENDING\` notification outbox insert.
7. Commit of all three state changes together.

Database constraints enforce allowed draw states, positive versions, foreign-key relationships, unique idempotency scope, unique outbox-to-operation relation, and bounded state enumerations. SQLite is configured with foreign keys, a bounded busy timeout, WAL journaling, and \`synchronous=FULL\`.

## Local verification

Local Node.js 22.16.0 execution completed:

- 9 tests passed
- 0 failed
- 0 skipped
- \`node --check\` passed for both new files
- SQLite emitted its expected experimental-feature warning because \`node:sqlite\` is still experimental in this Node release.

Coverage includes atomic state/idempotency/outbox commit, same-key replay, changed-payload conflict, rollback before commit, lost acknowledgement after commit followed by database reopen/replay, SQL constraint enforcement, owner/version/state rejection, canonical key-order invariance, and rollback when outbox insertion fails.

A local database reopen is not a power-loss, process-kill, multi-host, or disaster-recovery test. The fault points are controlled synthetic return paths, not physical crash simulation.

## Explicit limitations

- Synthetic fixture actors only; no OIDC, MFA, real identity provider, sessions, CSRF, or human dual control.
- Local SQLite file only; no production DB, managed database, multi-host service, network filesystem, or horizontal scaling.
- No actual beacon verification, winner-selection algorithm, participant roster, member data, PII, or official draw.
- Outbox records remain \`PENDING\`; no notification provider, worker, scheduler, or delivery is connected.
- No external evidence store, immutable retention, independent audit source, off-site backup, key recovery, or production monitoring.
- SQLite durability settings are not proof of storage hardware, filesystem, host, or off-site recovery guarantees.

## Non-action boundary

No cloud resource, paid service, billing, IAM, database outside temporary test directories, identity tenant, credential, Apps Script, Sheets, Drive, Telegram, DNS, hosting, production branch, live deployment, or production member data was accessed or changed.

P1.24 is a local technical persistence experiment only. It does not satisfy the operational G0–G11 release gates and does not lift the official draw NO-GO decision.


## Verification outcome

- Local Node.js 22.16.0: 9 PASS, 0 FAIL, 0 SKIP; both files passed `node --check`.
- Clean-checkout GitHub Actions run #417 (`42964627111`) on commit `6b4c7c98d269c005671cd4647c44fbd027630c55`: **SUCCESS**. The P1.24 SQLite test step passed, all remaining synthetic suites passed, and Chromium browser checks passed; no failed or skipped steps were reported.
- This evidence remains SYNTHETIC and does not establish production database, multi-host, process/power-loss, OIDC, cloud, or official-draw readiness.
