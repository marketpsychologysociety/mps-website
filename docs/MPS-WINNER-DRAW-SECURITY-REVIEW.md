# MPS v4.8 — Winner Board & Official Roulette Security Review

**Status:** Security design review — isolated workbench only  
**Date:** 2026-11-11  
**Scope:** Candidate Apps Script source review and proposed control model. No sheets, Drive folders, Script Properties, triggers, deployment, member data, or production resources were changed.

## 1. Executive decision

**Official roulette is not ready to implement or operate.** Keep the existing roulette clearly labelled as simulation. Do not use `Math.random()`, `Utilities.getUuid()`, browser state, client timestamps, or an Admin-supplied winner as the source of an official result.

The preferred direction is a future-beacon draw:
1. Publish fixed rules and eligibility cutoff.
2. Freeze a canonical private participant snapshot and its commitment.
3. Record the exact future drand round before that round is generated.
4. Retrieve and cryptographically verify the beacon against a pinned chain configuration.
5. Derive one deterministic index with unbiased rejection sampling.
6. Independently reproduce the result against the private frozen snapshot.
7. Publish only after independent review; never expose the participant list or real winner identity.

This is a design recommendation, not a claim that drand or a verifier has been integrated. A verified drand signature and the exact draw protocol are mandatory; a JSON response from a relay is not sufficient evidence.

## 2. Findings from the current candidate backend

The isolated candidate at `/mnt/data/mps_v48_privacy_patch/Code.gs` was inspected for role checks, locking, audit, hashing, and persistence patterns. These are source-level observations only; the source pair is a reconstruction and has not been proven to match the active deployment.

### Reusable foundations
- `requireSuperAdmin_(session)` resolves the cached session and checks the role at the backend.
- `LockService.getScriptLock()` is already used around sensitive sheet mutations.
- `Utilities.computeDigest(SHA_256, ...)` is already used for hashing.
- The candidate has a shared audit sheet and content-sheet helpers.
- The existing admin UI/content API is already separated from public read paths.

### Gaps that block a draw implementation
1. **Audit is not immutable.** `recordMpsAudit_` catches and suppresses write errors, and the audit sheet is trimmed by deleting older rows after a size threshold. It cannot be the sole evidence log for a prize draw.
2. **Cache is not durable idempotency.** CacheService is temporary and can evict entries. A draw operation must use a durable operation journal and unique draw constraint, not a cache key.
3. **Sheets are not transactional.** A multi-step write can partially succeed. Freeze, draw, verification, and publication need explicit state transitions, read-back checks, and a reconciliation state.
4. **A script lock is not a transaction.** It serializes cooperating script executions, but it does not prevent an editor from changing the spreadsheet or script outside the workflow.
5. **Current role model does not prove dual control.** The candidate has Admin and Super Admin sessions, but the inspected paths do not establish two separately identified human reviewers. A second approval cannot be treated as independent if it is the same credential/person or a shared role token.
6. **No official draw implementation was found.** The roulette is a front-end simulation; the winner workflow is a proposed new subsystem.

Consequently, do not build the draw by simply adding sheets and reusing the current audit function.

## 3. Randomness architecture

### 3.1 Recommended source: drand default mainnet chain, subject to approval

drand documents a distributed public randomness beacon and recommends using client libraries that verify each beacon signature. The default League of Entropy mainnet chain is chained and has a published chain hash. The drand documentation explicitly warns that consumers must validate signatures and obtain/pin chain information from a trusted source rather than blindly trusting a relay response.

Candidate configuration for a later proof of concept:
- Network: League of Entropy **default** mainnet chain (not deprecated fastnet).
- Chain hash: `8990e7a9aaed2ffed73dbd7092123d6f289930540d7651336225dc172e51b2ce`.
- Pin the trusted chain public key, period, genesis time, scheme, and chain hash out-of-band in reviewed verifier configuration.
- Choose a specific future round only after the participant snapshot has been frozen and committed.
- Fetch the exact round from more than one independent relay where practical; matching responses improve availability checks but do not replace signature verification.

References:
- drand HTTP API and supported relays: https://docs.drand.love/developer/http-api/
- drand v2 API, network/chain information, and testnet guidance: https://docs.drand.love/developer/API-v2/drand-http-api/
- drand protocol specification and signature-verification requirements: https://docs.drand.love/docs/specification/
- Google Apps Script Utilities documents digest and HMAC helpers; it does not document a native BLS12-381 signature-verification primitive: https://developers.google.com/apps-script/reference/utilities/utilities

### 3.2 Important implementation limitation

Apps Script `Utilities.computeDigest` can hash data, but SHA-256 hashing is **not** verification of a drand BLS signature. Do not accept a relay's `randomness` field merely because it is well-formed JSON.

Before official implementation, choose and independently review one of these:
- A maintained, pinned drand client/verifier library that can run correctly in the Apps Script V8 runtime, with test vectors and an independently maintained verifier; or
- A separately deployed verification service using a maintained drand client, with an authenticated backend-to-verifier contract, pinned chain configuration, versioned source/build, tamper-evident logs, and an independent second-person/public proof verification step.

A remote service returning only `{verified:true}` is not enough. Its proof artifact must include the exact round, chain hash, signature, randomness, protocol/version, and verifier build identity. An independent verifier must be able to recompute signature validity. If the verifier is unavailable, the signature is invalid, the chain does not match, or the beacon round is not the precommitted round, stop the draw. **No fallback RNG.**

### 3.3 Freeze-before-entropy timing

- Fix the event rules, eligibility cutoff, participant eligibility policy version, draw protocol version, and planned beacon round before the beacon is generated.
- Freeze the roster and write the snapshot commitment first.
- The selected beacon round must be strictly in the future at freeze time, with a documented safety margin; it cannot be chosen after seeing candidate beacon values.
- Persist the chosen round and freeze commitment in the durable journal before requesting that round.
- A relay outage delays the draw; it does not authorize changing the round or using another random source.
- A change to rules, roster, participant count, snapshot hash, chain, round, or protocol invalidates prior approvals. Re-freeze and re-approve under a new draw attempt, preserving the old record.

## 4. Deterministic selection protocol

Use a versioned, domain-separated input encoding. Do not concatenate ambiguous free-form strings.

Conceptual input:
`MPS-DRAW-V1 | event_id | snapshot_hash | participant_count | chain_hash | beacon_round | beacon_randomness`

Then:
1. Hash the canonical encoded input using SHA-256 to derive a deterministic byte stream.
2. Convert the stream to an unsigned integer using a precisely specified byte order.
3. Map it to the range `[0, participant_count - 1]` using **rejection sampling**. Do not use naïve modulo unless the implementation proves there is no modulo bias.
4. If a candidate is outside the largest divisible range, derive the next block with a counter and repeat.
5. Select exactly one participant at that zero-based index in the frozen canonical ordering.
6. Store the selected index, selected private participant reference, full derivation inputs, output digest, and verifier result in the private draw record.

The exact encoding, byte order, integer width, counter format, and rejection rule must be frozen in protocol test vectors before implementation. Every verifier must reproduce identical outputs for the same inputs. Do not silently change protocol versions.

## 5. Participant snapshot and privacy

- Eligibility rules and cutoff must be published before freeze; evaluate eligibility server-side from authoritative database fields only.
- Canonicalize and sort stable opaque participant references; reject duplicates and record policy-based exclusions by reason code.
- Do not copy names, phone, email, Telegram ID/username, MT5 login, deposit amount, payment status detail, PIN, or proof-document references into the public dataset.
- Store the frozen participant snapshot in a restricted location with access limited to the draw service and named reviewers. Do not place it in GitHub Pages, browser storage, public API payloads, or a public Google Sheet.
- A plain hash of predictable Member IDs can be dictionary-attacked. The snapshot commitment must use a reviewed private per-event salt or keyed commitment, with secret material stored separately under restricted access. Document who can access it and how independent reviewers receive it.
- Public proof may publish participant count, snapshot commitment, event/rules version, beacon chain/round, selected index, protocol version, and verification status. It must not publish the participant list or unsalted member identifiers.
- A masked Member ID is optional only after the existing privacy uniqueness gate. If masking is unsafe, omit it and display a generic winner message. Never display a real name or alias.

**Transparency limit:** a public commitment plus a selected index does not, by itself, let the public prove that the private roster was complete or eligible. A separately authorized auditor must inspect the private snapshot and reproduce the result. Do not market the process as fully publicly verifiable or “provably fair” unless a privacy-preserving proof system actually establishes roster completeness and eligibility.

## 6. Durable state machine and idempotency

Proposed states:
`DRAFT → RULES_PUBLISHED → FREEZE_PENDING → FROZEN → APPROVAL_PENDING → APPROVED → BEACON_PENDING → DRAWN → VERIFY_PENDING → VERIFIED → PUBLISH_PENDING → PUBLISHED`

Terminal/exception states:
- `CANCELLED`: only under prepublished cancellation rules, with reason and immutable history.
- `RECONCILIATION_REQUIRED`: any partial write, ambiguous timeout, failed read-back, or inconsistent journal. No further draw/publish action until reconciled.
- `VERIFICATION_FAILED`: no publication; preserve evidence and require security review.

Each sensitive operation must:
- Require a backend Super Admin check at function entry.
- Have a unique operation ID and idempotency key bound to event ID, action, expected version, and actor.
- Acquire ScriptLock, re-read current durable state, validate expected version, write intent, perform the operation, read back, then mark complete.
- Return the same recorded outcome on retry; never execute a second draw because the browser timed out.
- Reject stale or out-of-order transitions.
- Preserve all earlier attempts and correction records; never overwrite a published winner.

A lock timeout, spreadsheet write error, missing audit acknowledgement, or partial write must fail closed into reconciliation. CacheService may accelerate reads but must never decide whether a draw has already occurred.

## 7. Audit and dual-control requirements

The current spreadsheet audit sheet is useful operational history but is not tamper-proof. For official prize evidence:
- Create a separate durable draw journal with operation intent/completion, prior/current state, actor reference, timestamps, snapshot hash, beacon proof reference, output digest, and verifier result.
- Use a tamper-evident chain of audit record hashes and export/replicate evidence to a separately permissioned append-only or retention-locked store. A hash chain in the same editable spreadsheet alone is not tamper-proof.
- Audit write failure must block freeze, draw, verification, and publication. Never swallow it and continue.
- Keep secrets and private roster data out of audit details and logs.
- Require two distinct, individually authenticated people for freeze approval and result publication. The candidate's shared role tokens/role labels do not establish distinct identity; a separately reviewed identity and approval mechanism is a prerequisite.
- Step-up authentication is required for freeze, draw execution, cancellation, disclosure, and prize handover.
- Separate operator and reviewer. The person who prepares/finalizes the roster must not approve their own draw.

## 8. Winner Board lifecycle

A winner record is generated only from a `VERIFIED` draw record:
- Draft result → Independent verification → Privacy review → Publication approval → Published → Claim pending → Claim verified → Prize handed over / Expired.
- Public result: event title, prize description, draw ID, draw date/time (WIB display; UTC storage), participant count, protocol version, beacon round/chain reference, snapshot commitment, selected index, proof link, and generic winner message.
- Do not expose the winner's real name, alias, full Member ID, contact details, Telegram identifiers, MT5, deposit/payment information, or private claim evidence.
- Claim status changes are separate audited transitions. Never claim “prize delivered” until handover is confirmed.
- Corrections append a correction record; they do not mutate the original draw outcome.
- Public feed must return an explicit allowlist projection, not whole spreadsheet rows.

## 9. Roulette UI contract

- The browser receives only a verified, display-safe result and decorative wheel parameters.
- The browser never receives participant rows, private snapshot, entropy secret, signing key, or draw authority.
- The wheel animation maps the backend-confirmed selected index to a visual stop position. It must not select or reroll.
- Reloading, double-clicking, animation failure, or reduced-motion mode shows the same recorded result.
- Reduced-motion mode reveals the confirmed result immediately.
- Simulation remains labelled **SIMULASI — BUKAN HASIL RESMI** and cannot create a claimable Winner Board record.

## 10. Required test gates

### Protocol / cryptography
- Valid and invalid drand signatures; wrong chain hash; wrong public key; wrong round; altered randomness; malformed/oversized response.
- Relay disagreement and outage; no silent fallback.
- Fixed test vectors for canonical encoding, digest derivation, rejection sampling, boundary values, participant count 1, maximum supported count, and counter rollover.
- Independent implementation reproduces the exact selected index and proof.
- Test that no beacon value can be fetched/selected before the snapshot and round commitment are durably recorded.

### State / resilience
- Duplicate click, replayed request, concurrent requests, stale version, timeout after write, partial row write, lock timeout, missing audit store, and cache eviction.
- Restart after each state transition and reconciliation recovery.
- Attempt to change roster/rules/hash/round after approval; must invalidate approval and block draw.
- Attempt second draw/reroll; must reject and preserve first attempt.
- Attempt unauthorized Admin/member/public calls; every privileged action must fail server-side.
- Verify separate human identities and prohibit self-approval.

### Privacy
- Public JSON contains no participant list, raw winner ID, real name/alias, Telegram, email, phone, MT5, deposit/payment details, proof files, PIN, or credentials.
- Test dictionary/re-identification risks for snapshot commitments and masked IDs.
- Verify Winner Board only publishes after verified draw + separate publication approval.
- Verify the ticker uses generic winner copy only.

### Runtime / deployment
- Apps Script test project, synthetic spreadsheet and restricted test Drive folder only.
- Test verifier deployment with pinned configuration and reproducible build.
- Real browser, Android narrow viewport, accessibility/reduced motion, and service-worker regression.
- No production deployment until all gates pass and the user explicitly approves.

## 11. Implementation decision

**Current decision: design-only; official draw implementation blocked.**

Safe next steps:
1. Confirm the exact active Apps Script source pair and deployment provenance without changing the deployment.
2. Decide whether the project will support a separately hosted, maintained drand verification service or a fully reviewed in-runtime verifier.
3. Design an individually authenticated second-reviewer mechanism; current candidate roles alone are insufficient.
4. Design the durable journal/append-only evidence store and recovery protocol.
5. Only then build an isolated test backend and synthetic end-to-end tests.

No official draw, winner selection, database migration, new sheet creation, Drive permission change, credential/configuration change, trigger, or deployment was performed in this review.
