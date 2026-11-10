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
