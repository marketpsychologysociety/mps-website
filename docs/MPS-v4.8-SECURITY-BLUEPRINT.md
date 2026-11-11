# MPS v4.8 — Security & Anti-Abuse Blueprint

**Status:** Mandatory design and acceptance requirements for the isolated mps-v4.8-workbench branch.
**Applies to:** Public website, member portal, Apps Script/backend, APIs, Google Sheets/Drive, admin workflows, Telegram integrations, hosting, repository, domain/DNS, and release operations.
**Production boundary:** This document does not authorize production deployment, live configuration changes, credential rotation, database migration, member-data access, or destructive actions.

## 1. Security objective and realistic limits

MPS must be resilient against unauthorized access, account takeover, data theft, impersonation/cloning, vandalism, spam, service disruption, malicious uploads, and accidental destructive operations.

No public website can be made impossible to copy, and no system can honestly be promised to be 100% immune to hacking or DDoS. HTML/CSS/JavaScript delivered to browsers are inspectable and reproducible. Minification/obfuscation, hidden links, frontend checks, CORS, and secret-looking URLs are not security boundaries.

The security objective is:
1. A copied frontend must not grant access to the genuine MPS backend, member records, private files, admin functions, or integrations.
2. Every protected operation must be authorized by the server for the exact user, role, member status, and target object.
3. Compromise or misuse should be detectable, containable, recoverable, and auditable.
4. Public availability and member privacy must be preserved without exposing secrets in client code or public repositories.

## 2. Threat model and mandatory controls

### 2.1 Website cloning, impersonation, and phishing
- Treat all public frontend assets as copyable; never embed credentials, privileged business rules, private datasets, or authorization decisions in them.
- Establish and publish one canonical official MPS domain and a controlled list of official subdomains/hosts. Verify ownership and HTTPS for each.
- Provide a simple official-domain verification/contact notice so members can distinguish genuine MPS pages from imitations.
- Keep canonical host, preview host, and deployment source clearly separated. A preview deployment must never be presented as the official production site.
- Monitor domain/certificate and public brand impersonation where feasible; document a takedown/reporting procedure. Monitoring is not assumed to exist until configured and tested.
- Never trust a frontend-supplied member identity, role, status, price, deposit state, or admin flag.

**Acceptance tests:** copied/static frontend cannot read protected data or invoke privileged actions; fake host cannot authenticate against MPS merely by reproducing the UI; official-host guidance is visible and accurate.

### 2.2 Authentication, sessions, and account takeover
- Use server-verified authentication for every member and administrator session.
- Enforce member lifecycle/status on the server (pending, rejected, approved/active, suspended); UI visibility is not authorization.
- Enforce roles server-side: public, member, VIP where applicable, admin, and Super Admin. Apply least privilege and deny by default.
- Bind registration, verification, deposit, and account recovery to a verified identity challenge. A Telegram username, display name, Application Ref, or Member ID alone is not proof of account ownership.
- Use high-entropy opaque session identifiers; store only a verifier/hash where practical. Do not put session tokens in URLs, public logs, analytics, or local persistent storage.
- Define idle and absolute session expiry, logout/revocation, session rotation after authentication/privilege changes, and invalidation after account suspension or PIN reset.
- Protect PIN/password verification with a modern password-hashing approach supported by the chosen backend architecture; never store or log plaintext PINs. Rate-limit attempts and introduce escalating delays/temporary lockout with a safe recovery path.
- Require MFA/step-up verification for privileged administration and sensitive account/security changes. Do not assume Google Apps Script automatically provides a reliable end-user identity in a public Web App; verify the selected identity mechanism and deployment execution model.
- Protect against CSRF where cookie-based sessions are used; validate origin/anti-CSRF tokens as appropriate. Validate request method, content type, schema, and expected action.
- Return generic authentication errors that do not disclose whether a member/account exists.

**Acceptance tests:** anonymous, pending, rejected, suspended, expired-session, revoked-session, wrong-role, and unauthenticated direct API/page requests are denied; successful members can access only permitted resources; non-admin members cannot invoke admin actions; repeated invalid PIN attempts are throttled; session revocation takes effect.

### 2.3 API and object-level authorization
- Authenticate and authorize every protected page route and every API action independently. A protected page must not rely on a prior frontend redirect.
- Apply object-level authorization to every member row, deposit, proof file, Learning asset, Pulse dataset, announcement, briefing, and administrative record.
- Derive identity and role from the verified server session, never from caller-supplied IDs, Telegram handles, email, query parameters, hidden fields, or request bodies.
- Use explicit allowlists for actions and fields. Reject unexpected fields, invalid state transitions, malformed identifiers, oversized bodies, and unsupported content types.
- Keep public intake endpoints narrowly scoped. Public registration/deposit submission must not expose member lookup, overwrite existing member profiles, or mutate a verified member's record without a separate identity-bound workflow.
- Make sensitive writes idempotent and protect against replay, duplicate submissions, race conditions, and stale updates.
- Apply safe error handling; never return stack traces, spreadsheet contents, Drive IDs, internal configuration, or secrets to clients.
- CORS is only a browser-origin policy, not authentication or API access control.

**Acceptance tests:** direct URL and direct API requests are tested for every protected action; changing member IDs/object IDs in requests never exposes or changes another member's data; replay/duplicate writes do not create duplicate financial/member actions.

### 2.4 Database, Google Sheets, and migration safety
- Preserve the existing production database, historical sheets, member rows, identifiers, and legacy columns. No reset, clear, delete, rename, reorder, or destructive migration without explicit Super Admin approval and verified backup.
- Treat the legacy 18-column schema as a compatibility constraint until the actual deployed headers and active backend are confirmed. Any new schema is additive and versioned; exact mapping must be evidence-based, not guessed.
- Separate read-only reporting/dashboard operations from member-data writes. Dashboard generation must not clear or overwrite source data.
- Use bounded writes and explicit column/header mapping rather than fragile hard-coded offsets where possible.
- Validate row identity and expected current state before updating; use locking/transaction-like safeguards where supported by the platform.
- Maintain audit records for privileged and sensitive data changes, including actor, action, target, timestamp, outcome, and correlation/reference ID; avoid logging secrets or unnecessary personal data.
- Define backup frequency, retention, access restriction, restore procedure, recovery-point objective (RPO), and recovery-time objective (RTO). Verify restore on an isolated copy before relying on it.
- Require a dry-run migration report, row counts, duplicate/orphan checks, schema diff, backup verification, and rollback plan before any approved production migration.

**Acceptance tests:** migration dry-run is non-destructive; legacy records and IDs remain unchanged; repeated migration is idempotent; restore test recovers an isolated backup; dashboard refresh cannot clear source member data.

### 2.5 Private files and uploads (Drive)
- Store member proof, Learning files, and private Pulse datasets in restricted Drive locations. Verify actual folder/file ACLs and owner/deployment permissions; a source-code comment saying private is not evidence.
- Serve private files only after server-side authorization for the specific object. Do not publish public Drive links or expose direct file IDs as access control.
- Validate file size, extension, declared MIME type, detected file signature, and allowed formats server-side. Treat all filenames and MIME labels as untrusted input.
- Generate safe server-side filenames; prevent path tricks, script/HTML uploads, active content, and content-type confusion. Prefer serving downloads with safe content disposition and no inline execution.
- Apply upload rate/quantity limits, duplicate detection, and quarantine/review for suspicious files. Scan files where a supported scanning service is available; do not claim malware scanning unless implemented.
- Minimize retention of identity/proof material and restrict who can view/download it.

**Acceptance tests:** anonymous and wrong-member downloads fail; private files are not publicly shared; fake MIME/extensions and oversized uploads are rejected; upload names cannot overwrite unrelated files.

### 2.6 Abuse, bots, brute force, and service disruption
- Apply per-account/action throttling and quotas to login/PIN, registration, deposit intake, uploads, content APIs, and expensive endpoints.
- Use server-side idempotency keys or equivalent duplicate protection for sensitive submissions.
- Add bot/human verification to exposed high-abuse public forms if compatible with the platform; validate challenges server-side and keep provider secrets server-side.
- Apply request/body limits, pagination, bounded queries, execution timeouts, and safe failure behavior.
- Use edge CDN/WAF/bot protection for the public static host when supported by the chosen host. Do not assume edge WAF protects a separate Apps Script Web App endpoint; assess and protect that endpoint independently within platform limits.
- Define alert thresholds for abnormal traffic, repeated failures, upload spikes, quota exhaustion, and backend errors. Avoid claiming IP-based controls where the platform does not reliably expose caller IP.
- Prepare a documented incident response: detect → preserve evidence → contain/revoke → restore → verify → communicate. Include a safe kill switch for vulnerable integrations or write endpoints.
- DDoS resistance is bounded by hosting/provider capabilities and quotas; define escalation/provider support steps rather than promising immunity.

**Acceptance tests:** throttling activates at configured thresholds; repeated requests cannot bypass server checks; expensive endpoints are bounded; the team can disable a compromised integration without destroying member data.

### 2.7 Admin, repository, hosting, domain, and deployment takeover
- Protect GitHub, Google, hosting, DNS/domain registrar, and integration accounts with MFA and least-privilege access.
- Use protected production branches, required CI checks/reviews where available, restricted deploy permissions, and immutable release records. Verify actual repository rules/settings; do not claim they are configured until inspected.
- Keep secrets in approved server-side secret storage (for Apps Script, Script Properties or an equivalent managed secret store); never commit tokens, PINs, passwords, private keys, or webhook secrets.
- Rotate credentials only through an approved, coordinated change with dependency inventory, rollback plan, and verification. Never expose secrets in chat or ask the user to paste them.
- Pin and review third-party dependencies; minimize external scripts and supply-chain exposure.
- Define one canonical production host and separate preview environments. Verify deploy branch, build command, publish directory, redirects, HTTPS, security headers, and deployed commit for each host before release.
- Apply appropriate security headers where the hosting platform supports them (CSP, HSTS, frame restrictions, MIME sniffing protection, and referrer policy). GitHub Pages and Netlify have different header capabilities; do not assume one configuration applies to both. A meta CSP is not a full substitute for response headers.
- Keep deployment credentials separate from application credentials. Require a release checklist, known-good rollback target, and post-release smoke test.

**Acceptance tests:** unauthorized branch/deploy changes are blocked according to verified repository/host settings; secrets are absent from public artifacts; deployed commit matches the approved release; rollback procedure is rehearsed in a non-production environment.

### 2.8 Telegram bot and external integrations
- Keep bot tokens, webhook secrets, API keys, and private destinations server-side only.
- Authenticate inbound webhook requests using the provider's supported verification mechanism; validate sender/chat/user permissions for privileged commands.
- Allowlist commands and permitted destinations; separate member-facing notifications from admin-only actions.
- Make notifications idempotent, bounded, retry-safe, and observable. Prevent untrusted content from becoming executable HTML/commands.
- Provide a kill switch and credential rotation procedure; do not modify production webhook, triggers, or tokens during workbench development.

**Acceptance tests:** forged/unauthorized webhook requests and commands are rejected; duplicate events do not create duplicate actions; disabling the integration stops its side effects without affecting member records.

### 2.9 Privacy, monitoring, and incident response
- Collect only the personal data required for a defined workflow. Never expose phone/email, Telegram identifiers, MT5 login, deposit details, proof documents, PINs, or tokens in public ticker/notifications/logs.
- Define log access and retention; redact secrets and minimize sensitive personal data.
- Monitor authentication failures, privilege changes, data exports, file access anomalies, unusual write volume, API errors, and quota exhaustion.
- Maintain a severity matrix, response owner, evidence-preservation steps, member-notification decision process, and recovery checklist.
- Keep incident notes factual; distinguish confirmed compromise from suspicious activity or unverified alerts.

**Acceptance tests:** logs contain enough metadata for investigation without plaintext credentials/PINs or unnecessary personal data; test alerts reach the designated operator; incident and restore procedures are documented and rehearsed.


## 2.10 Optional member passkeys (biometric/device verification)
- Passkeys are optional for members; do not force enrollment. Admin and Super Admin are not required to use passkeys under the current product decision. This does not remove the separate requirement for strong privileged-account protection and step-up verification.
- Never collect, transmit, or store fingerprints, Face ID templates, or other biometric data. The device/passkey provider performs local user verification; MPS receives and verifies a cryptographic WebAuthn assertion.
- Enrollment and authentication must use a vetted WebAuthn implementation with unpredictable one-time challenges, strict RP ID/origin validation, signature/counter/credential checks as appropriate, challenge expiry and replay prevention, credential revocation, and safe account recovery.
- The current split between the public static frontend and Apps Script backend means the RP ID/origin and server-side verification architecture must be resolved before implementation. Do not add a frontend-only biometric button or trust a client-side success flag.
- Offer a non-passkey login path to members. Enrollment, removal, recovery, and new-device events must be auditable and bound to a verified member identity.
- Test supported Android/iOS/browser combinations and fallback behavior on real devices before claiming broad compatibility.

## 2.11 One-time VIP trial for new, non-deposit members
- A newly registered member who is eligible under the server's current member-state policy may start exactly one VIP trial before a verified deposit. The trial does not change the member's deposit or paid-VIP status.
- The trial duration is fixed at **60 minutes maximum**. The countdown starts only after the member explicitly activates the trial; registration time or merely viewing the offer must not start it.
- Persist the trial claim/start timestamp and immutable expiry timestamp server-side, associated with the canonical member identity. Enforce a unique one-time claim atomically (lock/transaction-equivalent) so concurrent requests, logout/login, browser storage clearing, device changes, URL changes, and replay cannot create another trial.
- The browser countdown is informational UI only. Every protected VIP API/resource request must independently verify eligibility and server time against the stored expiry; client clock changes, paused tabs, edited JavaScript, or direct URLs must not extend access.
- At expiry, deny further trial access server-side and show the locked state. Re-login must show the actual remaining time or expired state derived from the backend, never reset the timer.
- Define the exact trial feature allowlist. Keep paid-only, high-risk, financial, account-management, private member data, and privileged actions excluded unless explicitly approved. Trial access must not expose another member's data.
- Record minimal audit events for trial offered, activated, access denied/expired, and any admin override; do not log secrets or unnecessary personal data. Any extension/reset/override requires an authorized, audited administrative action and explicit policy.
- Acceptance tests must cover: eligible first activation; duplicate/concurrent activation; ineligible or already-used member; expiry boundary; manipulated client clock/timer; logout/login; new browser/device; direct API/URL; stale session; backend outage/fail-closed behavior; and confirmation that deposit/VIP-paid status remains unchanged.
- No trial implementation or production access is authorized by this design entry alone. Implement and test only on the isolated workbench with synthetic accounts/data; production changes require separate explicit approval.

## 3. Required adversarial test matrix

Run only against an isolated workbench/test backend and synthetic accounts/data unless a separately approved production test plan exists.

| Test actor / scenario | Expected result |
|---|---|
| Anonymous visitor opens member/admin/Pulse/Learning API directly | Denied; no private data returned |
| Pending/rejected/suspended member opens protected routes | Denied according to status policy |
| Approved member requests another member's record/file | Denied; no existence/data leakage |
| Member calls admin/Super Admin action directly | Denied server-side |
| Request changes role/status/member ID/object ID in body/query | Ignored or rejected; server session remains authoritative |
| Expired/revoked/replayed session | Denied |
| Repeated wrong PIN/login attempts | Throttled/locked according to policy |
| Duplicate/replayed registration or deposit submission | Safely deduplicated; no unintended overwrite |
| Oversized, malformed, spoofed-MIME, or active-content upload | Rejected/quarantined |
| Public access to private Drive file URL | Denied |
| Forged Telegram webhook or unauthorized command | Rejected |
| Burst traffic / expensive API abuse | Bounded, throttled, observable |
| Admin deletes/updates content or member state | Authorized only, confirmed, audited, recoverable |
| Backup restoration | Restores isolated test copy and validates row counts/integrity |
| Copied frontend hosted elsewhere | Cannot access private backend resources without valid server authorization |

For each test, record: test ID, build/commit, environment, synthetic actor/role/status, request path, expected result, actual result, evidence, severity, remediation, retest result, and date. Mark each PASS / FAIL / BLOCKED / NOT TESTED. A source-code review is not a penetration test; a mocked browser test is not a live backend authorization test.

## 4. Security severity and release gates

- **Critical:** unauthenticated access to private data/admin actions; cross-member data access; account takeover; exposed credentials; destructive write without authorization; public private-file exposure. Release blocker.
- **High:** bypassable rate limits on sensitive flows; weak identity binding; upload execution/content risks; missing auditability for privileged changes; unsafe deployment/secret handling. Release blocker until fixed or explicitly risk-accepted with compensating controls.
- **Medium:** incomplete monitoring, hardening headers, dependency controls, or recoverability with no demonstrated exploit path. Must have owner and remediation date.
- **Low:** defense-in-depth improvements with limited direct security impact. Track and prioritize.

No protected member feature may be marked production-ready while critical/high authorization, identity-binding, or private-file controls remain unverified. Do not publish real member data merely because the frontend is complete.

## 5. Platform-specific design cautions

- The public static host (GitHub Pages/Netlify) serves inspectable frontend assets; it is not the security authority for member data.
- The Apps Script Web App is a separate backend surface. Its deployment execution identity, access settings, active source/version, quotas, and available request metadata must be verified before choosing concrete controls.
- Apps Script limitations may prevent conventional edge WAF/IP controls or conventional server frameworks. Select implementable controls based on verified platform capabilities; do not claim unsupported controls.
- Google Sheets is not a transactional database. Use locks, bounded operations, explicit state checks, backup/restore, and carefully designed write paths; assess whether a stronger datastore is required before scaling.
- Service worker must continue to cache only approved public static assets. Never cache authenticated HTML, member data, private files, session/token-bearing requests, or API responses.
- CORS, obfuscation, hidden UI, client-side route guards, and unguessable URLs are defense-in-depth at most, never substitutes for server authorization.

## 6. Workbench implementation sequence

1. Identify the actually deployed Apps Script project/version and execution/access model without changing it.
2. Recover the exact existing 18-column database headers and compare them with the candidate schema. Preserve all legacy data; produce a non-destructive compatibility/migration design.
3. Define identity proof, role/status model, session lifecycle, and server-side authorization contract.
4. Define API schemas, object-level access rules, idempotency, throttling, audit events, and safe errors.
5. Define private Drive upload/download policy and verify ACLs in a non-production test environment.
6. Define admin MFA/step-up, repository/hosting controls, secret inventory, and incident/rollback procedures.
7. Implement only in isolated workbench with synthetic data and no production secrets.
8. Run static, unit, integration, direct-API negative, abuse, recovery, and browser tests; document evidence and limitations.
9. Obtain explicit Super Admin approval before any production credential, DNS, hosting, deployment, webhook, trigger, or database change.
10. After approved release only: verify deployed commit, host/backend behavior, alerts, backup, and rollback readiness.

## 7. Current evidence baseline (2026-11-11)

- Public GitHub Pages resources were fetched successfully in the prior smoke check; this confirms resource availability at that time only.
- The active Apps Script deployment source/version, execution model, full authorization behavior, spreadsheet schema, Drive ACLs, Telegram bot source, and Netlify deployment settings remain NOT VERIFIED.
- Two repository Apps Script files are historical/legacy. Static review found public doPost handlers without caller authentication and weak identity binding in historical intake flows. These findings must not be attributed to the active deployment until its source/version is confirmed.
- Unauthenticated route fetches returned generic Google wrapper content and were inconclusive; no claim of denial or exposure is justified.
- The workbench's service worker uses an explicit public asset allowlist and bypasses HTML navigation and non-allowlisted/parameterized requests; preserve and retest this behavior.
- No live backend penetration test, real-device security test, DDoS test, account takeover test, or recovery drill has been completed.
- No production database, member records, Apps Script deployment, Drive ACL, Script Properties, credentials, DNS, hosting configuration, trigger, or Telegram webhook was changed by this blueprint update.

## 8. Definition of done

Security is accepted only when:
- The active backend and deployment are identified and reviewed.
- All protected routes/actions enforce server-side identity, role, status, and object authorization.
- Legacy database compatibility and backup/restore are proven without destructive changes.
- Private files remain private and are mediated by authorization.
- Sensitive flows have input validation, anti-abuse controls, idempotency, and auditability.
- Admin/infrastructure accounts and release paths have verified protections.
- Adversarial test matrix has evidence-backed results, with no unresolved Critical/High findings.
- Incident response and rollback are documented and rehearsed.
- Production changes have explicit approval and post-release verification.

**This blueprint defines requirements; its existence is not evidence that any control is implemented or passed.**

---

## 9. Implementation progress and remaining security gates — 2026-11-11

This status record separates documented design, isolated source work, synthetic tests, and production evidence. A documented control is not an implemented control.

### Delivered in the workbench

- [x] Core security blueprint and acceptance matrix.
- [x] Companion winner-draw security review.
- [x] Dual-control and audit-journal design.
- [x] Individual identity and evidence architecture.
- [x] Official Draw API/data contract.
- [x] Draw threat model and abuse-case test plan (TM-01–TM-32).
- [x] Security harness readiness review.
- [x] Narrow synthetic loopback Draw sandbox adapter with fixed test actors and in-memory state.
- [x] Sandbox ownership check for draw execution and expected-version (`If-Match`) guards for approval, execution, and publication.
- [x] Contract tests for cross-owner mutation and missing/stale version preconditions.
- [x] Privacy test corrected to report SKIP when no actual public projection fixture exists; null output is not counted as privacy proof.
- [x] Announcement public ticker/frontend privacy controls documented and implemented in isolated frontend workbench: generic public copy, masked-ID-only policy, strict rendering, safe link handling, no names/full IDs.

### Test evidence and limitations

- [x] Narrow synthetic contract suite: **8 PASS, 1 SKIP, 0 FAIL** on a reconstructed local working copy of fetched source; not a clean checkout and not a CI run.
- [x] Public ticker static route audit and synthetic DOM checks passed in the isolated workbench.
- [ ] Clean-checkout or CI run of the current exact adapter/test commits.
- [ ] Real public projection serialization and synthetic canary-leak test.
- [ ] Apps Script runtime, real browser, mobile-device, and live backend authorization tests remain NOT TESTED.
- [ ] No production penetration test or independent security certification has been performed.

### Remaining critical implementation work

- [ ] Real OIDC provider integration with server-side signature/JWKS, issuer, audience, nonce, expiry, authorized-party, and assurance validation.
- [ ] Individually authenticated privileged actors, revocation, MFA/step-up, and enforceable person-level separation of duties.
- [ ] Durable isolated persistence, transactional/locking behavior, idempotency ledger, tamper-evident journal, external evidence anchor, and reconciliation workflow.
- [ ] Canonical eligible participant snapshot, freeze/review, and proof of completeness.
- [ ] Pinned future randomness beacon round and cryptographic signature verification; never trust a relay's `verified:true`.
- [ ] Deterministic unbiased winner selection, independent proof reproduction, and anti-reroll enforcement.
- [ ] Real public winner projection generated only from verified proof and independently approved publication.
- [ ] Announcement CMS/backend implementation and Apps Script bridge runtime validation; current public-center feature flag remains OFF.
- [ ] Full TM-01–TM-32 execution, including race, fault injection, journal failures, cache/privacy, webhook replay, supply chain, rollback, and recovery.
- [ ] Browser, Android/iOS, direct API, Apps Script, Sheets/Drive ACL, and independent external review evidence.

### Current security decision

| Surface | Current status |
|---|---|
| Public ticker frontend privacy controls | Implemented in isolated workbench; static/synthetic checks only |
| Public-center Apps Script feed | Disabled pending isolated runtime validation |
| Draw sandbox | Synthetic loopback harness only; not production API |
| OIDC / privileged human identity | Design only; not implemented |
| Durable journal / external anchor | Design only; not implemented |
| Beacon verifier / fair draw algorithm | Design only; not implemented |
| Public winner publication | Not implemented |
| Production Apps Script authorization | NOT VERIFIED |
| Production Sheets/Drive permissions | NOT VERIFIED |
| Official winner draw | **BLOCKED / NO-GO** |

The latest repository comparison records `mps-v4.8-workbench` 136 commits ahead and 0 behind `main`; production `main` remains at baseline `9f5d9128f7226b1a53cbcaa1615068e7a7fbc6ff`. This branch comparison is not a release or security certification.

**Safety boundary:** no production deployment, database/member data, Drive ACL, Script Properties, credential, DNS/hosting setting, trigger, or Telegram webhook was changed by this status update.


## P0 public projection privacy gate — verified update (2026-11-11)

**Scope completed in the isolated workbench:** a synthetic private projection fixture now contains canary values for a name, raw member ID, phone, email, Telegram ID, MT5 login, deposit, proof-document reference, PIN, token, and participant reference. A strict allowlist serializer emits only the approved public result fields and a bounded proof summary, and only when the fixture is both VERIFIED and PUBLISHED. Anonymous collection and detail routes exercise the serializer through the local loopback HTTP server. The test checks every canary, exact top-level and nested field allowlists, and fail-closed empty/unknown-result behavior.

**Clean GitHub Actions evidence:** workflow run #173, commit `56379ed9bc11a07bd01d0455fff35d8f06106b56`, completed successfully:
- Official Draw synthetic security contract: **10 PASS, 0 FAIL, 0 SKIP**.
- Synthetic database schema compatibility: **9/9 PASS**.
- Read-only schema inspector: **5 scenarios PASS**.
- Chromium PWA/browser suite: **PASS**, 15 pages plus service-worker, cache/offline, mobile navigation, Android install prompt, and iOS guidance checks.
- Overall workflow: **SUCCESS**.

The browser suite initially exposed stale assertions that still opened cache namespace v5 after the service worker had been upgraded to v6. The test script was corrected to inspect v6; the full workflow then passed. This was a test assertion mismatch, not evidence of a production cache leak.

**Evidence boundary:** these results are for the exact clean GitHub Actions checkout of the isolated workbench commit and synthetic fixtures only. They do not verify the production CMS/Apps Script bridge, production member data, real cache/log pipeline, actual Draw API, OIDC, durable journal, beacon signature verification, or a fair winner-selection implementation. The Public Center backend feature flag remains disabled. Official winner draw remains **BLOCKED / NO-GO**; frontend roulette remains **SIMULATION ONLY**. No production branch, deployment, database, spreadsheet, Drive, credentials, webhook, or member data was changed.


### Security decision after P0 sandbox verification

The canary privacy gap in the **synthetic sandbox contract** is closed. This is not a production privacy acceptance: the real CMS/Apps Script bridge, shared cache behavior with real deployment responses, logs, and production authorization remain unverified. Continue with durable persistence/journal and individually authenticated identity before any privileged draw implementation. Do not enable official draw or public winner publication.


## P1.1 — durable synthetic audit journal prototype (2026-11-11)

**Implemented in isolated workbench:** `tests/official-draw/durable-audit-journal.mjs` is a local-file, append-only JSONL journal with sequential records, SHA-256 hash chaining, file fsync, initial directory fsync, recovery on reopen, durable INTENT/COMPLETION records, idempotency-key replay/conflict handling, serialized concurrent writes within one process, bounded completion-result allowlist, and fail-closed integrity validation. A truncated final line is discarded during recovery; malformed complete records and hash-chain tampering are rejected.

**Fault-injection coverage:** tests inject failures before append, after write but before fsync, and after fsync but before acknowledgement. Uncertain write outcomes block further writes until reopen/reconciliation. A durable intent whose acknowledgement was lost is recovered and replayed without creating a second intent.

**Local evidence:** Node.js 22 syntax checks passed. GitHub Actions clean-checkout run #175 completed the committed journal suite with **7 PASS, 0 FAIL, 0 SKIP**; the full workflow succeeded.

**Important scope boundary:** this is a single-process, local-filesystem test prototype, not yet integrated into the loopback Draw API adapter or its event/draw state transitions. It has no cross-process lock, database transaction, external hash anchor, independent tamper-proof storage, backup/restore process, OIDC identity, or production hardening. A hash chain detects accidental/partial tampering but an attacker able to rewrite the whole file can recompute the chain. Do not store real participant data or secrets in it. Production official draw remains **BLOCKED / NO-GO**; roulette remains **SIMULATION ONLY**.


### Security decision after P1.1

The local synthetic journal prototype and its fault-injection suite are implemented, but they are not yet connected to API state transitions. Do not interpret this as durable Draw API acceptance. Next gate is API integration plus process-restart tests, then a transactional/multi-process storage design and independent journal anchoring. OIDC and official winner selection remain blocked.


### P1.1 CI verification — 2026-11-11

**Clean GitHub Actions evidence:** workflow run #175 on commit `44d23528692539846238462335a4ce4b21e9c843` completed successfully from a clean checkout. The durable synthetic journal fault-injection suite reported **7 PASS, 0 FAIL, 0 SKIP**. The same workflow also passed the Official Draw contract (**10/10**), schema compatibility (**9/9**), read-only inspector (**5 scenarios**), and Chromium PWA/browser checks. Workflow run #176 on documentation-correction commit `a1b2ea9589013c06e3ad5ba14d36a12367296209` also completed successfully.

This proves only the standalone synthetic journal prototype and the repository's existing synthetic/browser checks in GitHub Actions. The journal is still not integrated into the loopback Draw API state transitions. It is single-process local-file storage without a cross-process lock, transactional database, or external hash anchor. API-level restart/fault-injection tests remain the next gate. Official draw remains **BLOCKED / NO-GO** and roulette remains **SIMULATION ONLY**.


### P1.1 strict journal schema hardening — verified CI (2026-11-11)

The recovery verifier now requires an exact record-key allowlist; unknown extra fields fail closed before hash-chain application. A synthetic canary test confirms that an unexpected private payload field is rejected during recovery. Completion results also remain restricted to the bounded allowlist.

**GitHub Actions run #180** on commit `ec9c3df600dbd7e3509f56dc9e620309aa4fb606` completed successfully from a clean checkout: durable journal suite **8 PASS, 0 FAIL, 0 SKIP**; Official Draw contract **10 PASS**; schema compatibility **9/9**; read-only inspector **5 scenarios**; Chromium PWA/browser checks passed. Overall workflow: **SUCCESS**. The immediately preceding run #179 failed because the new canary test reached CI one commit before its matching exact-schema guard; the follow-up commit added the guard, and run #180 verified the combined change green.

This closes the standalone journal's synthetic test gap only. The journal is not yet integrated into API state transitions and remains single-process local-file storage without a cross-process lock, transactional database, or external hash anchor. API-level restart/fault-injection tests remain next. Official draw remains **BLOCKED / NO-GO**; roulette remains **SIMULATION ONLY**.

## P1.2 — persistent sandbox integration (2026-11-11)

The workbench contains a separate loopback-only persistent Draw API sandbox integrated with the P1.1 durable audit journal. It replays completed aggregate state records at startup and marks draws with incomplete operation intents as RECONCILIATION_REQUIRED. Five child-process API integration cases cover restart recovery, idempotency replay/conflict, concurrent execution serialization, crash recovery after intent or in-memory mutation, and recovery after durable completion with lost acknowledgement. Clean-checkout GitHub Actions run #200 passed the complete workflow: https://github.com/marketpsychologysociety/mps-website/actions/runs/42937357517.

This remains a synthetic, single-process local-file prototype. It does not provide cross-process locking, transactional persistence, external tamper-resistant anchoring, real identity, beacon verification, fair winner selection, or production security. Keep official draw NO-GO and roulette SIMULATION ONLY.

## P1.3 — cross-process persistence safety (2026-11-11)

The workbench now adds an atomic lock-directory protocol around journal recovery and appends. Each writer reloads and verifies the hash chain under the lock before checking idempotency or writing, so separate Node processes cannot independently append using stale sequence/hash state. Ownership is bound to PID, hostname, random token, and start time; lock release verifies ownership. Same-host stale locks are quarantined only after confirming the owner PID no longer exists. Ambiguous/malformed/foreign/live locks fail closed.

The persistent API also holds an exclusive process lease for its journal directory, preventing a second server process from starting against the same state. This is a deliberate single-writer safety fence, not active-active service or distributed consensus. Two-process journal append, lock recovery, lease rejection, and second-server refusal tests have been added; CI verification is pending.

Residual limits: local filesystem only, no network/distributed filesystem guarantees, transactional DB, external tamper-resistant anchor, backup/restore, OIDC/MFA, beacon verifier, unbiased selection, or production security. Official draw remains NO-GO; roulette remains SIMULATION ONLY.
