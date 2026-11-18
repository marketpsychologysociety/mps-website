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


## 2.12 Member self-service account recovery (forgot PIN / forgot Member ID)

**Product objective:** let a legitimate member recover access in a short, understandable flow without contacting Admin when the member still controls the Telegram account previously linked and verified with MPS. Keep the member-facing experience to one MT5 account-number field, one recovery choice, and one Telegram confirmation. Do not ask the member to remember or re-enter their Member ID when choosing “Forgot Member ID.”

### Member experience
1. From the member login screen, show two clear links: **Lupa PIN** and **Lupa ID Member**.
2. The member enters the MT5 account number already registered to the MPS member record and selects the required recovery action.
3. The backend normalizes and matches the MT5 account number against the canonical member record. It must use the Telegram Chat ID already linked and verified in that same record; a typed Telegram username, display name, phone number, or newly supplied Chat ID is never accepted as proof or as a replacement link.
4. Return a generic acknowledgement that does not reveal whether the MT5 number exists or whether Telegram is linked. If an eligible record exists, send a private Telegram message to its previously verified Chat ID with a one-time confirmation button that clearly names the requested action.
5. After the member confirms in Telegram:
   - **Forgot PIN:** issue a short-lived, single-use recovery capability bound to that member and the PIN-reset purpose. The member returns to the MPS recovery page and sets a new PIN. Do not send the permanent PIN in Telegram or expose it in logs.
   - **Forgot Member ID:** send the Member ID privately to the same verified Telegram chat after confirmation. Do not display the ID on an unverified browser response.
6. Show a short completion message and a clear route back to login. The normal member login and authorization rules remain unchanged.

### Security and recovery controls
- Match MT5 only against the canonical, existing member record and require the record's previously verified Telegram Chat ID. Never use MT5 alone, Telegram username alone, or caller-supplied identity fields as authentication.
- Use an unpredictable, purpose-bound, single-use token/callback with a short expiry. Store only a cryptographic verifier/hash server-side where practical; bind it to the member, MT5 record/version, action, and verified Telegram chat. Reject expired, replayed, mismatched, or superseded tokens.
- For PIN reset, apply the same server-side PIN policy and secure verifier/hash storage as normal PIN issuance. Commit the new PIN only after the recovery challenge is valid; then revoke existing member sessions, invalidate outstanding recovery challenges, and require a fresh login. Never return the old PIN.
- For Member ID recovery, disclose the ID only in the already verified private Telegram chat after explicit confirmation. Never include it in public logs, analytics, URLs, or a generic web response.
- Rate-limit by recovery target and action, and apply an additional global abuse limit. Use generic browser acknowledgements and bounded timing/response behavior to reduce account enumeration. Avoid relying solely on IP-based controls where the platform cannot reliably identify the caller.
- Make challenge issuance, confirmation, PIN reset, and ID disclosure replay-safe and idempotent. Handle Telegram delivery timeouts as an uncertain outcome; do not create unlimited replacement challenges or silently claim delivery.
- Record minimal audit events for request, challenge sent/confirmed/expired/rejected, PIN reset, ID disclosure, and Admin-assisted recovery. Audit actor, target reference, action, result, timestamp, and correlation ID; never log PINs, raw tokens, Telegram Chat IDs, or unnecessary MT5/member personal data.
- If Telegram is no longer accessible, is not linked, or the record cannot be matched safely, do not fall back to a new Telegram account automatically. Route the member to a concise **Hubungi Admin** recovery path. Admin must perform identity checks against existing registration/deposit evidence; sensitive reassignment or recovery requires the defined privileged approval and an audit record.
- Recovery must not change deposit status, VIP entitlement, membership approval, MT5 ownership, or other profile fields. It only restores the member's login identifier or PIN.
- Keep the flow mobile-friendly and short: no long questionnaire, no requirement to remember Member ID for PIN recovery, and no repeated entry of information already held in the verified member record.

**Acceptance tests (synthetic accounts/data only):**
- Correct MT5 + previously verified Telegram: only that linked chat receives the requested confirmation.
- Wrong/unknown MT5, no linked Telegram, or mismatched chat: generic browser acknowledgement; no identity or account-existence disclosure.
- Attacker supplies another Telegram username/Chat ID: ignored/rejected; no challenge sent to that destination.
- Forgot PIN challenge: correct purpose/member/chat works once; wrong purpose, wrong member, expired token, replay, stale record, or concurrent redemption fails closed.
- Successful PIN reset: new PIN verifier is stored using the approved secure method; old PIN no longer authenticates; existing sessions and other recovery tokens are revoked; member status/deposit/VIP data remain unchanged.
- Forgot Member ID: ID is disclosed only to the previously verified private Telegram chat after explicit confirmation, never in an unverified browser response or public log.
- Telegram send timeout/ambiguous acknowledgement: state is reconciled safely without issuing multiple active challenges or falsely reporting success.
- Rate limits, enumeration resistance, audit failure handling, Admin fallback, and Android/mobile usability are tested.
- No live member data, production Telegram bot, production credentials, or production deployment is used for acceptance testing.

This is a mandatory design requirement for the isolated workbench. It does not authorize production data access, Telegram configuration changes, credential rotation, deployment, or release.

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
- [x] Public VIP ticker privacy controls documented and implemented in isolated workbench: real approved member display names are intentionally visible (not masked); full member IDs and unrelated personal/account/payment data remain excluded; strict rendering and safe link handling.

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

The persistent API also holds an exclusive process lease for its journal directory, preventing a second server process from starting against the same state. This is a deliberate single-writer safety fence, not active-active service or distributed consensus. Two-process journal append, lock recovery, lease rejection, and second-server refusal tests have been added; Clean-checkout GitHub Actions run #218 on commit 788ab5cb18d4b027c9edc870808bee846346f8d8 passed the full workflow. The journal lock suite passed 13/13 and persistent API integration passed 6/6; Chromium browser checks passed. Run: https://github.com/marketpsychologysociety/mps-website/actions/runs/42938105450.

Residual limits: local filesystem only, no network/distributed filesystem guarantees, transactional DB, external tamper-resistant anchor, backup/restore, OIDC/MFA, beacon verifier, unbiased selection, or production security. Official draw remains NO-GO; roulette remains SIMULATION ONLY.


## P1.4 synthetic journal-lock crash recovery evidence — 2026-11-11

Added a real child-process crash test for the narrow failure window where a writer dies after writing an INTENT record but before fsync/acknowledgement, while still holding the journal lock. Recovery must verify the dead same-host PID, atomically quarantine the stale lock, replay the complete record if present, and reject a duplicate intent through the existing idempotency scope. The test is synthetic and runs only in a disposable local directory. It is evidence for this specific process-crash path, not power-loss guarantees, cross-host coordination, network filesystem semantics, or production security. GitHub Actions run #231 is the required clean-checkout verification for this addition; record its final outcome before marking the test complete.


## P1.5 — synthetic external-anchor contract (2026-11-11)

Added `tests/official-draw/synthetic-external-anchor.mjs` and its test suite. The contract models monotonically ordered journal checkpoints, create-only anchor objects, previous-receipt chaining, deterministic receipt hashes, idempotent retry for the same checkpoint, conflict rejection for a changed checkpoint, and fail-closed detection of missing, tampered, reordered, or unknown-field anchors. Five synthetic tests are wired into the clean-checkout workflow.

**Trust boundary:** provider is deliberately in-memory and exists only to test the contract. This is not an external anchor, immutable storage, cloud service, independent account boundary, or production security control. No external resource, bucket, retention policy, credentials, or project has been created. Before selecting a real provider, governance must decide ownership, separate IAM principals/projects, create-only semantics, retention duration, deletion/policy-change monitoring, backup/export, independent verification, recovery, cost, and privacy minimization. Irreversible retention locking remains prohibited without explicit approval. Official draw stays BLOCKED / NO-GO; roulette remains SIMULATION ONLY.


## 2.13 Exness Partnership API integration — Rebate Dashboard (design approved; access not yet verified)

**Decision:** Exness publishes an official Partnership API suitable as a potential source for MPS partner reporting and rebate reconciliation. The intended integration is the **Partnership API**, not the separate Exness Trading API. This is a documented integration design, not evidence that MPS currently has partner eligibility, credentials, client attribution, or a working connection.

### Official capability and relevant read endpoints

- Partner reports:
  - `GET /v1/partnership/reports/clients` — referred-client level report.
  - `GET /v1/partnership/reports/clients/accounts` — account-level activity, including trading volume and partner reward figures.
  - `GET /v1/partnership/reports/rewards` — credited partner reward history.
  - `GET /v1/partnership/reports/orders` — closed-order detail associated with partner rewards, subject to the endpoint's date-range limits.
  - `GET /v1/partnership/reports/orders/pending` — pending reward-calculation activity; do not present as final credited reward.
- Rebate and payment reconciliation:
  - `GET /v1/partnership/autorebates` — generated rebate batches and batch-level amounts/status.
  - `GET /v1/partnership/autorebates/history` — rebate processing history/rows.
  - `GET /v1/partnership/autorebates/payments` — payment records and payment-level status/amounts.
  - `GET /v1/partnership/autorebates/payments/{payment_id}/rebate-rows` — rows included in a payment.
  - `GET /v1/partnership/autorebates/{rebate_id}/clients` and `/aggregates` — client-account rows and batch aggregates.

Use the current official API reference for exact request parameters and response schemas before implementation. Reports and rebate resources are partner-scoped; only data available to the partner associated with the API key can be returned. Client attribution and trading-account attribution are distinct and must not be conflated.

### Eligibility and credentials gate

1. MPS must have an eligible Exness partner relationship (such as an approved IB or Digital Affiliate relationship) and access to its Partner Personal Area.
2. An authorized partner operator must create an active Partnership API key and private signing key with the minimum required scope.
3. Initial integration must request **read-only** scope `partnership.all:read`. Do not request `partnership.all` (write/full access) for the Rebate Dashboard.
4. Confirm the API key's permitted partner, source-IP restrictions (if configured), and report/resource access with Exness. A public referral link alone is not proof of API eligibility or of historical client attribution.
5. Do not ask the member or MPS operator to paste API keys/signing keys into chat, HTML, GitHub, or a spreadsheet. Store credentials only in approved backend secret storage; never expose them to browser code, member responses, logs, or public artifacts.
6. If MPS partner eligibility or access is not yet available, keep the integration in **NOT CONNECTED / WAITING FOR PARTNER ACCESS** state. Do not fabricate data or silently substitute manual estimates.

### Proposed MPS data flow

1. A backend-only scheduled/manual sync calls Exness Partnership API using fresh request signatures and the exact signed request path/query.
2. A dedicated adapter validates HTTP status, response schema, partner scope, pagination, timestamps, currency, volume and identifiers.
3. The reconciliation layer joins Exness client-account rows to MPS member records only through a verified, unique trading-account mapping already held by MPS. Do not join by display name, email, Telegram username, or fuzzy matching. Ambiguous, duplicate, missing, or changed mappings go to an Admin review queue and are not shown as confirmed member balances.
4. Store normalized raw-source snapshots and derived member projections separately, with source, period, sync time, currency, source identifiers, and reconciliation outcome. Preserve enough provenance to reproduce a displayed figure; do not overwrite historical snapshots without an audit trail.
5. Member-facing **Rebate Saya** reads only the authenticated member's own reconciled projection. Public pages and other members must never receive this data.
6. Admin tools may inspect reconciliation exceptions and source totals under server-side Admin authorization. No member-facing endpoint may proxy arbitrary Exness API paths or accept caller-supplied partner/account identifiers.

### Rebate Dashboard semantics and status rules

- Candidate member metrics: trading volume (lots), partner reward (where relevant and clearly labelled as partner-side reward), rebate allocated to the member, pending/in-process amount, processed/paid amount, rejected/error amount, and period history.
- Never equate the partner's reward with the member's rebate. They are different values and the configured MPS-to-member rebate share/rules must be established and reconciled before display.
- Keep batch, individual rebate-row, and payment statuses separate. A batch marked `PROCESSED` does not prove every row was paid; inspect row status and the corresponding payment record. A processed payment must reconcile to its included rows and amounts.
- Treat `PENDING`, `APPROVED`, `PROCESSING`, `ERROR`, `PROCESSED_PARTIAL`, `PROCESSED`, and `REJECTED` according to the specific endpoint/field. Preserve unknown or null statuses as unknown; never convert them to “Dibayar”.
- A payment date alone is not proof of successful payment. Show “Dibayar” only when the relevant payment and row evidence supports that conclusion. For ambiguous or inconsistent results, show “Perlu rekonsiliasi” or “Menunggu konfirmasi”, not a payable balance.
- Exness reports are asynchronously updated and may not share one consistent snapshot. Show the source period and last successful sync time; reconcile recent periods by repeat reads and stable pagination filters.
- Parse financial amounts using decimal-safe arithmetic, retain the source currency, and do not silently convert currencies. Volume and money fields may be represented as strings or numbers depending on the endpoint schema.
- If the official data does not establish an individual member's rebate entitlement or payment, show the source fact with a clear label or withhold the member payment claim until MPS's own allocation/payment evidence exists.

### Security, reliability, and operational controls

- Use a dedicated backend adapter and narrow allowlist of read endpoints; reject arbitrary URL/path, query, and method forwarding from clients.
- Generate a fresh signed request for each API call. Sign the exact path and query as transmitted; keep the signing key server-side.
- Enforce pagination, stable filters while paging, bounded date windows, request scheduling, exponential backoff, and `Retry-After` handling. The documented shared Partnership API budget is 600 requests per 60 seconds per partner across that partner's keys; do not design around burst usage or assume a separate budget per key.
- Handle 401/403 as credential/scope/partner-access failures; 429 as throttling; transport/5xx failures with bounded backoff. Do not mark a sync successful on partial pages or partial failures.
- Use idempotent snapshot ingestion keyed by documented source identifiers where available. The API documentation does not define a universal stable row key or universal idempotent-write semantics; do not invent one or deduplicate solely by display fields. Record unresolved duplicates for reconciliation.
- Minimize stored personal data. Do not copy client contact/KYC data into general logs or the member dashboard. Log sync actor, time, endpoint class, result, counts, correlation ID and sanitized error category; never log API keys, signing material, full signed headers, or unnecessary client identifiers.
- Add a backend kill switch to stop Exness sync without affecting member login, deposits, VIP status, Pulse, or other MPS services.
- This integration is read-only by design. Do not create/update/delete rebate groups, change rebate percentages, assign clients, select destination accounts, approve batches, retry payments, or trigger payouts through this integration. The documented API does not expose payment approval/rejection/retry operations.

### Implementation and acceptance gates

- First verify MPS's actual Exness partner status and Partner Personal Area access. This is a prerequisite, not an assumed fact.
- Obtain a synthetic/test partner API credential through the authorized Exness partner account where Exness provides an appropriate test facility; otherwise use sanitized approved partner samples and contract tests. Never use production member data for local fixtures.
- Verify signing, key scope, source-IP restrictions, pagination, rate limits, date filters, response schemas, null fields, currency/decimal handling, asynchronous report lag, and error/backoff behavior.
- Test exact account mapping: one valid unique match; no match; duplicate MT5 mapping; account reassignment/change; account not attributed to MPS; and cross-member isolation.
- Test reconciliation across batch, rebate row and payment statuses, including partial processed batches, rejected rows, ERROR, unknown/null status, payment mismatch, and delayed report updates.
- Test that a member can read only their own rebate projection through direct API calls as well as the UI; Admin access is separately authorized and audited.
- Verify no API key/signing key appears in frontend bundles, Git history, browser network responses, logs, or public repository artifacts.
- Keep UI in **NOT CONNECTED / WAITING FOR PARTNER ACCESS** until eligibility, credentials, attribution, mapping and end-to-end reconciliation are independently verified.
- No production credential creation, API connection, data import, schema migration, member-visible rebate figure, deployment, or payout operation is authorized by this design entry alone. Any such step requires its own explicit approval and test evidence.

**Official documentation checked (2026-11-17):**
- Exness Partnership API overview: https://www.exness-api.com/partnership/get-started
- Partnership reports: https://www.exness-api.com/partnership/guides/reports
- Partnership rebates: https://www.exness-api.com/partnership/guides/autorebates
- API reference: https://www.exness-api.com/reference/partnership/exness-partner-api
- API configuration and limits: https://www.exness-api.com/partnership/guides/api-configuration-and-limits

**Evidence boundary:** official documentation confirms that the API product and the described operations exist. It does not confirm that MPS is an eligible Exness partner, that any MPS API key exists, that MPS client accounts are attributed correctly, or that an integration has been implemented or tested. The separate Exness Trading API is not required for this partner rebate reporting design.


## 2.14 VIP membership activity and retention policy — 60-day inactivity

**Community principle:** MPS is intended for traders who genuinely want to learn, participate, and remain active in their trading development. VIP membership is a participation privilege, not a permanent entitlement independent of the published activity rules. Apply this policy consistently, transparently, and without arbitrary manual targeting.

### Inactivity definition and measurement

- A VIP member is considered inactive when the member's verified, MPS-attributed trading account has **no qualifying executed trading activity for 60 consecutive calendar days**.
- Measure from the timestamp/date of the last qualifying executed trade reported by the broker/official partner data source, using a single documented timezone for policy calculations (WIB / Asia/Jakarta). Do not treat website login, Telegram group presence, opening the trading platform, pending orders, deposits, withdrawals, or message activity as trading activity.
- Use official broker/partner reports or another approved, auditable source. A self-reported claim or screenshot alone must not silently reset the inactivity clock; it may be submitted for Admin review.
- Where multiple trading accounts are officially linked to one member, define the member's activity from any one eligible, verified, MPS-attributed account, unless the published VIP terms explicitly state otherwise. Do not infer attribution from names or fuzzy matches.
- Store the source, last-activity timestamp, sync timestamp, account-mapping status, and calculation result needed to explain an inactivity decision. Show the member the relevant last-activity date and deadline where practical.

### Notice and removal

- Send a private notice around day 45 and a final reminder around day 55, explaining the last recorded activity date and the day-60 consequence. Notices must not reveal another member's account or activity.
- At 60 consecutive days of verified inactivity, revoke the member's **VIP group membership** and **VIP-only website entitlements/resources** through authorized server-side controls. Remove or disable the relevant VIP group access through the approved administrative process; do not rely only on hiding a frontend menu.
- Do not delete the member's MPS account, historical records, audit trail, learning progress, financial/rebate records, deposit history, or other data merely because VIP access is revoked. This policy changes VIP eligibility/access only; it does not cancel a legitimate financial obligation or alter deposit/payment records.
- If broker reporting is unavailable, stale, incomplete, the account mapping is disputed, or an integration outage could have hidden activity, do not automatically classify the member as inactive. Mark the case **ACTIVITY DATA UNVERIFIED / REVIEW REQUIRED**, pause the automatic removal decision, and reconcile the source before acting.
- Any Admin override, reinstatement, disputed activity correction, or exception must require an authorized role, a reason, timestamp, evidence reference, and audit event. Do not allow a member-facing request or browser parameter to change the inactivity state directly.

### Rejoining after removal

- A member whose VIP access was revoked for 60-day inactivity and who wants to return must **apply/join again from the beginning of the VIP onboarding process**. This includes the currently required identity/account verification and acceptance of the then-current VIP rules.
- Rejoining is a new eligibility decision, not an automatic restoration of the previous VIP entitlement. The member must meet the current entry requirements; prior VIP status does not guarantee reapproval.
- Preserve the original member identity and historical records. Do not create duplicate member records or erase the prior history to simulate a new person. Link the new application/review to the existing canonical member record after identity verification.
- On successful reapproval, issue fresh VIP entitlements and group access. Old sessions, invitations, and access grants must not be revived automatically.

### Fairness, transparency, and acceptance tests

- Publish the 60-day rule, what counts as activity, the timezone, notice schedule, and rejoining requirement in the VIP terms/member-facing policy before enforcement.
- Provide a concise member status such as **AKTIF**, **MENDEKATI BATAS INAKTIF**, **DITINJAU**, or **AKSES VIP DICABUT**, with the last verified trading activity date and a clear explanation. Do not expose raw broker credentials or another member's data.
- Test synthetic cases: activity on day 59 resets the clock; exactly 60 consecutive days without qualifying activity triggers the policy; website/Telegram login alone does not reset it; pending orders/deposits do not count; multiple verified attributed accounts are evaluated consistently; broker outage/stale data pauses enforcement; disputed mappings require review; revoked VIP member cannot access VIP-only pages or APIs directly; historical member/financial records remain unchanged; and rejoining requires fresh verification and approval.
- This is a policy and implementation requirement only. It does not authorize immediate removal of any existing VIP member, changes to live Telegram groups, member records, access entitlements, or production deployment. Enforcement requires a separately approved rollout after the activity source, member notice, backend revocation paths, audit trail, and test evidence are verified.

**Default rule adopted for the MPS workbench design:** 60 consecutive days without verified executed trading activity; notice on approximately days 45 and 55; VIP group and VIP-only website access revoked at day 60; rejoining requires fresh VIP onboarding and approval.


## 2.15 Owner-approved Exness IB referral route and QR destination

The MPS owner confirmed these official referral assets for MPS member registration:

- **Official registration link (mobile):** https://one.toexness.com/a/bdthbxwb2q?platform=mobile
- **Official QR destination:** https://one.toexness.com/a/bdthbxwb2q?method=qrcode
- **Referral code:** `bdthbxwb2q`

Both routes use the same referral code and differ only by entry method. The direct link is the registration CTA destination; the QR code must resolve to the exact QR destination above. Do not substitute another referral URL or infer attribution from a click.

**Security and transparency requirements**
- Present the referral route consistently for MPS member registrations and disclose that it is an Exness IB/referral route.
- Do not describe a registration as successfully attributed until confirmed by authorized Exness partner data.
- Referral registration does not itself establish partner API eligibility, client-account attribution, trading activity, rebate entitlement, or payment.
- Keep the Rebate Dashboard in **NOT CONNECTED / WAITING FOR PARTNER API ACCESS** until the separate 2.13 gates are satisfied.
- Never expose partner API keys, Ed25519 signing material, or privileged partner account data in the browser, public repository, chat, or member-facing responses.
- The referral link/QR decision is documentation and routing approval only. It does not authorize live API calls, account changes, rebate configuration changes, payout actions, or production deployment.
