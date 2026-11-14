# MPS v4.8 — Individual Identity & Evidence Architecture Decision

**Status:** Architecture decision proposal — isolated workbench only  
**Date:** 2026-11-11  
**Safety boundary:** No identity provider, Cloud project, bucket, Apps Script deployment, Script Property, spreadsheet, credential, trigger, production resource, or member data was created or changed.

## 1. Decision summary

**Recommended direction: a separate, individually authenticated privileged draw service using a standards-based OIDC identity provider, while retaining the existing Apps Script Admin login for ordinary MPS content administration.**

Do not retrofit the existing shared Admin/Super Admin role tokens into person-level identity. Do not rely on browser-supplied actor names/emails, role labels, or Session.getActiveUser().getEmail() under the current owner-executed web-app model.

The draw service must verify signed identity tokens server-side, map stable provider subjects to a server-managed allowlist, enforce step-up authentication and separation of duties, and write draw operations to a separately permissioned durable journal. The existing Apps Script backend may remain the CMS/content system, but it must not be treated as the identity authority or immutable draw journal.

**Official draw remains blocked** until individually authenticated operators, an independent second human, verified entropy, durable evidence, and full recovery tests exist. The current roulette remains a clearly labelled visual simulation.

## 2. Identity options compared

### Option A — Google Workspace identity through Apps Script

Apps Script web apps can execute as the deploying user or as the user accessing the web app. Google documents that Session.getActiveUser().getEmail() can return a blank string where security policy does not expose identity; web apps executing as the developer are specifically listed as a context where the active user's email is generally unavailable. Same-domain circumstances can change availability, but this must be demonstrated in the exact deployment configuration.

A deployment that executes as the accessing user changes the authorization model: users authorize the app, and backend service calls execute under the user's authority. That may require access to underlying Sheets/Drive resources, additional OAuth scopes and user consent, and a change to the current service-owner model.

**Advantages**
- Familiar Google account login; potentially low additional identity-provider administration if MPS already has a managed Workspace domain.
- Google controls account lifecycle and MFA policy when the organization manages the accounts.
- A verified Google OIDC ID token contains a stable subject identifier.

**Risks / constraints**
- Not suitable to assume that the current Apps Script execute-as-owner deployment can identify each visitor.
- Execute-as-user can change data-access permissions and expose OAuth consent prompts to operators.
- A consumer Gmail account is not equivalent to a centrally managed Workspace organization with enforceable domain membership and account offboarding.
- A Google email address is not proof of a distinct human if accounts are shared.
- Identity behavior, authorization scopes, and sheet access must be tested in a non-production deployment before adoption.

**Decision:** Keep as a conditional alternative only if MPS confirms all privileged operators have individually managed accounts in one controlled Workspace domain, and an isolated proof of concept confirms reliable subject identity and least-privilege data access. Do not change the current Apps Script deployment to execute-as-user as an exploratory shortcut.

### Option B — External standards-based OIDC provider (recommended)

Use an established OIDC provider that supports individually assigned accounts, MFA/step-up, account disablement, stable subject identifiers, and signed ID tokens. Provider selection is intentionally open; no vendor, paid plan, or tenant is assumed.

The privileged console authenticates each operator through the provider. The server-side draw API validates the ID token or exchanges it for a server-side session. It must validate at least:
- cryptographic signature against trusted issuer keys/JWKS;
- exact issuer (iss);
- audience (aud) containing the registered client ID, rejecting unexpected audiences;
- expiration (exp), and reasonable issued-at/clock-skew policy;
- nonce and one-time authorization state to prevent replay;
- authorized party (azp) where applicable for multiple audiences;
- stable subject (sub) mapped to an active server-side operator record;
- required authentication assurance / MFA claim for sensitive actions, where supported.

Never accept a decoded-but-unverified JWT. Never trust a provider response that merely says “verified” without independently verifiable evidence or a strongly authenticated service contract. Do not put ID tokens, refresh tokens, client secrets, or private keys in browser local storage, public GitHub files, or Apps Script HTML.

**Advantages**
- Keeps identity and individual accountability separate from the existing Apps Script role-token implementation.
- Does not require every operator to receive access to the MPS member spreadsheet or Drive.
- Supports a dedicated least-privilege draw console and distinct service identity.
- Can be tested with synthetic actors without changing the public site or member backend.

**Risks / constraints**
- Adds an external identity dependency, configuration and possible cost.
- Provider tenant ownership, account recovery, MFA policy, offboarding, and emergency access must be governed.
- Token validation and session handling must be implemented and independently tested correctly.
- A provider account is not proof of two distinct humans unless accounts are individually controlled and sharing is prohibited.

**Decision:** Preferred architecture, subject to provider and ownership/cost approval before provisioning. No provider has been selected or connected.

### Option C — Custom passwords or existing shared role tokens

**Rejected.** Shared role passwords, two sessions under one role token, client-entered names/emails, and home-grown password storage cannot establish person-level dual control. Do not create per-person passwords in Script Properties or invent a custom identity protocol.

## 3. Proposed logical architecture

    Individual operator A       Independent reviewer B
              |                           |
              +--------- OIDC login ------+
                          |
                Privileged Draw Console
                          |
                   HTTPS / short session
                          |
              Draw API + identity verifier
                |          |           |
                |          |           +--> Policy / role allowlist
                |          |
                |          +--------------> Durable draw journal
                |
                +-------------------------> Draw state machine
                |                               |
                |                               +--> Frozen private roster
                |                               +--> Beacon proof verifier
                |                               +--> Independent result verifier
                |
                +--> Narrow public projection after approval
                              |
                       Public Winner Board

    Existing Apps Script Admin/CMS remains separate.
    It may publish ordinary announcements but cannot bypass draw verification.

The diagram is logical only. It does not mean any of these services or resources currently exist.

### Trust boundaries

1. **Browser:** untrusted. It may request actions but cannot set actor identity, role, draw state, selected winner, snapshot hash, or approval result.
2. **OIDC provider:** trusted only as configured issuer. Tokens must be validated server-side.
3. **Draw API:** authoritative for authorization, state transitions, idempotency, roster freeze, and public projection.
4. **Roster store:** private, least-privilege, no public/static-site access.
5. **Beacon verifier:** independently validates the exact precommitted drand chain and round; no trust in an unverified relay response.
6. **Journal store:** separate permission boundary from the member spreadsheet and normal CMS editor group.
7. **Public GitHub Pages:** receives only a strict, approved public projection; never receives private roster or proof secrets.

## 4. Identity and role model

### 4.1 Operator registry

A server-managed registry should contain only:
- immutable issuer;
- immutable provider subject (sub);
- internal operator reference;
- active/disabled status;
- allowed role set;
- allowed action scope;
- created/updated timestamps and who approved the grant.

Email and display name may be optional administrative metadata, but must not be the primary key. Never derive a subject from a mutable email address.

Role grants and revocations require a separately audited administrative action. The person who grants a privileged role cannot silently approve their own role grant.

### 4.2 Session policy

- Use short-lived server sessions bound to the verified issuer/subject and authentication time.
- Store only a session identifier hash in the journal.
- Rotate session identifiers after login and privilege elevation.
- Enforce CSRF protection on state-changing browser requests.
- Set secure, HttpOnly, SameSite cookies when the hosting model supports them.
- Do not store bearer ID/refresh tokens in localStorage or sessionStorage.
- Re-check role, account active status, MFA freshness, event state, and approval independence at every privileged endpoint.
- Revoke sessions on account disablement, role removal, suspected compromise, or operator departure.
- Apply rate limits and alert on repeated login failures, invalid token signatures, replay, and privilege escalation attempts.

### 4.3 Step-up actions

Require fresh MFA/step-up authentication for:
- approving published rules and eligibility cutoff;
- freezing the roster;
- approving the frozen snapshot;
- executing the draw;
- cancelling or voiding a draw;
- verifying the result;
- publishing a winner;
- confirming prize handover or changing claim status.

The accepted assurance level and maximum authentication age must be fixed in configuration and tested; do not infer MFA from a browser checkbox.

## 5. Dual-control policy

For every official draw:
1. Operator A creates the event and proposes rules, cutoff, eligibility policy, and prize.
2. Reviewer B independently reviews and approves the exact rules hash. Issuer + subject must differ from A.
3. Backend freezes the roster and creates the private snapshot commitment.
4. Reviewer B or another authorized reviewer approves the exact snapshot hash, count, and protocol version. The roster preparer cannot approve their own snapshot.
5. Backend records the future drand chain and round before the round is generated.
6. Operator A requests execution. The draw service validates approvals and verifies the beacon signature.
7. An independent reviewer who did not execute the draw recomputes the result from the private snapshot and proof.
8. A separately authorized publisher approves the public projection.
9. Only then may the public Winner Board display a generic winner notice and optional privacy-safe masked Member ID.

All approvals bind to event ID, event version, rules hash, cutoff, eligibility-policy version, snapshot hash, participant count, draw-protocol version, chain hash, and round. Any change invalidates approvals and requires a new preserved attempt.

If MPS has only one actual human operator/reviewer, the official draw stays disabled. Two accounts controlled by one person are not dual control.

## 6. Evidence journal options

### Option 1 — Separate append-only journal service with independent storage (recommended logical pattern)

Use a small server-side journal API and storage account/project separate from the Apps Script spreadsheet and ordinary CMS editor group. Each write is authenticated as a service identity, create-only for new operation records, and independently readable by reviewers.

Each record should include:
- schema version, event ID, draw ID, operation ID;
- idempotency-key hash and expected state version;
- action, prior/current state, outcome/failure code;
- verified actor issuer/subject, role-at-action, authentication assurance and timestamp;
- rules hash, snapshot hash, participant count;
- beacon chain hash, round and proof artifact digest;
- verifier version/build digest and independent verification outcome;
- previous record hash and current record hash;
- external anchor reference and reconciliation reference.

Use canonical serialization and a versioned hash-chain format. Export periodic signed/checkpointed roots to an independent trust boundary. A hash chain stored only in one editable spreadsheet is not tamper-proof.

### Option 2 — Google Cloud Storage retention-locked evidence

Cloud Storage with a retention policy and Bucket Lock may provide stronger retention guarantees for finalized evidence objects. Google documents that locking a retention policy is irreversible: the policy cannot be removed or shortened, and the bucket cannot be deleted until retained objects expire.

**Do not create or lock a bucket now.** Before any irreversible retention setting, MPS must approve:
- retention duration and legal/privacy basis;
- exact fields/files retained;
- whether private roster data is excluded or separately encrypted;
- Cloud project/account owner and recovery administrators;
- expected storage and operation costs;
- deletion and access-review policy;
- incident response and key-loss plan.

A locked bucket is not automatically a complete audit system: write authorization, object versioning, independent verification, monitoring, and proof completeness still need design.

### Option 3 — Existing MPS spreadsheet audit sheet

**Not acceptable as the sole official journal.** The candidate's normal audit writer suppresses errors and prunes old rows; spreadsheet editors can change stored rows. Keep it for ordinary CMS history and optionally record a reference to the separate draw journal.

## 7. Failure handling and idempotency

- Every command has a durable unique operation ID and idempotency key.
- Browser retry returns the existing operation state/result; it never triggers another draw.
- The API re-reads durable state under a bounded lock before each transition.
- Write intent, read back, perform one logical action, read back, append completion, verify completion.
- A timeout or ambiguous partial write enters RECONCILIATION_REQUIRED; no new draw, reroll, or publication is allowed.
- Journal write failure blocks freeze, draw, verification, and publication.
- Invalid token, revoked subject, stale MFA, same-person approval, stale event version, invalid beacon signature, wrong chain/round, or mismatch in recomputed index fails closed.
- Never fall back to Math.random(), Utilities.getUuid(), client-generated randomness, or a different beacon round.
- Preserve cancelled/failed attempts and their evidence. Never overwrite an earlier result.

## 8. Public privacy contract

The public Winner Board and ticker may expose only:
- event title and public prize description;
- generic verified-result message;
- optional masked Member ID generated server-side only if the uniqueness/re-identification gate passes;
- publication timestamp and verification status;
- public proof digest/reference that contains no private participant data.

Never expose:
- names, nicknames, aliases, raw or full Member IDs;
- phone, email, Telegram identity, MT5 login;
- deposit/payment amount or status details;
- PINs, credentials, ID documents, proof files;
- participant list, roster ordering, private salt/key, raw entropy secret;
- internal actor email or private audit metadata.

If masking is unsafe or a public proof cannot be safely projected, omit the identifier and show generic text. A public commitment alone does not prove that the private roster was complete or eligible; do not claim complete public verifiability without a proof system that establishes those properties.

## 9. Isolated proof-of-concept plan

No external identity provider or cloud resource should be provisioned until the user explicitly approves provider, owner, cost, and retention decisions. The following can later be tested in an isolated environment with synthetic actors and fake participants:

| Phase | Test scope | Exit criteria |
|---|---|---|
| P0 — Threat model | Abuse cases, operator/reviewer roles, account ownership, recovery | Approved threat model and named accountable owners |
| P1 — Identity adapter | Synthetic OIDC users A/B; invalid signature, issuer, audience, expiry, nonce, replay, disabled subject | Every invalid case rejected; stable distinct subjects recorded |
| P2 — Dual control | A prepares, B approves; same subject, shared account, stale approval, role revocation | Self-approval and same-subject approval always rejected |
| P3 — Journal | Duplicate/concurrent requests, partial writes, storage denial, tamper, recovery | Idempotent outcomes; fail-closed reconciliation; tampering detected by independent anchor |
| P4 — Draw proof | Fixed synthetic roster, protocol test vectors, future beacon round, signature verification | Independent implementation reproduces exact index and proof |
| P5 — Public projection | API and browser payload inspection for names, raw IDs, private fields | Strict allowlist; no private data; generic fallback |
| P6 — Android/browser | Login, MFA, approval, timeout/retry, accessibility and responsive review | Full flow usable on Android; no unsafe state on reload/back navigation |

Tests must distinguish source-level checks, local automated tests, provider sandbox tests, cloud integration tests, real browser tests, and real-device tests. Passing one category does not imply another has passed.

## 10. Open decisions — approval required before provisioning

These are governance decisions, not questions that block the safe design work already completed:
1. Which organization/person owns the identity-provider tenant and emergency recovery?
2. Are all privileged operators individually managed Google Workspace users in one domain, or is an external OIDC provider needed?
3. Who are the actual independent operator and reviewer humans? If only one exists, official draw remains disabled.
4. What is the approved retention duration and legal basis for draw evidence?
5. Who owns the separate cloud project and pays ongoing costs?
6. What is the public proof/disclosure policy, including whether any masked Member ID is shown?

Do not select a vendor, create a tenant, create a cloud project, create a bucket, enable retention, change Apps Script execution identity, or modify production deployment until these decisions are explicitly approved.

## 11. Final decision

- Preferred architecture: separate OIDC-authenticated draw service, with server-verified stable subjects and independent reviewer.
- Conditional alternative: Google Workspace identity only after proving domain control, deployment semantics, reliable subject identity, and least-privilege data access in an isolated test.
- Rejected: shared role passwords, client-supplied identity, or spreadsheet-only audit as proof of independent approval.
- Evidence: separate durable journal with independently anchored hash-chain records; retention lock only after explicit governance approval.
- Official draw: **BLOCKED** pending identity, dual control, independently verified beacon, durable evidence, and test exit criteria.
- Existing roulette: **SIMULATION ONLY**.
- Production main, live Apps Script, member database, Drive, Script Properties, triggers, deployment, and credentials: **untouched**.

## References

- Google Apps Script Session class: https://developers.google.com/apps-script/reference/base/session
- Google Apps Script web app deployment and execution identity: https://developers.google.com/apps-script/guides/web
- Apps Script web app manifest executeAs and access: https://developers.google.com/apps-script/manifest/web-app-api-executable
- Google OpenID Connect token validation: https://developers.google.com/identity/openid-connect/openid-connect
- OpenID Connect Core 1.0, ID Token validation: https://openid.net/specs/openid-connect-core-1_0.html
- Google Cloud Storage Bucket Lock: https://cloud.google.com/storage/docs/bucket-lock
