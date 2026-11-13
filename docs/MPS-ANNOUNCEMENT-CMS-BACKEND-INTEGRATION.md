# MPS Announcement Center — CMS & Backend Integration Design

**Status:** Design and source-review findings only — workbench documentation; no backend implementation or production action.
**Date:** 2026-11-11
**Related specification:** `MPS-ANNOUNCEMENT-CENTER-ROULETTE-SPEC.md`
**Source reviewed:** Library artifact `Code.gs` (213,686 bytes; header identifies it as reconstructed v4.8.0) and `MPS_Final_Index.html` (132,406 bytes). These are candidate artifacts, not proof of the active Apps Script deployment.

## 1. Executive decision

Use the existing authenticated Apps Script Admin area as the management surface and the public static GitHub Pages site as a read-only presentation surface. Reuse the existing content storage patterns only after the candidate source is versioned and reviewed as a complete, consistent pair. Do not add public write endpoints, admin credentials, participant lists, or draw secrets to the static website.

The candidate already contains useful building blocks:
- Learning PDF catalog/upload/delete and metadata editing.
- Market Pulse upload pre-validation, explicit publish confirmation, schema validation, and private backup behavior.
- Announcement records with audience, priority, scheduling window, display type, frequency, theme, animation, and status.
- A public-center read API and an authenticated Admin content view.
- Separate Admin and Super Admin sessions, with content-management operations generally guarded by `requireSuperAdmin_`.
- Audit logging for privileged content actions.

The new work is therefore an integration and controlled extension, not a reason to rebuild all CMS infrastructure.

## 2. Final ticker identity policy — Member ID only

**The user's final instruction is explicit: public and Admin ticker displays must show the Member ID only. Never display a member's real name, display name, nickname, or alias.**

The existing transition ledger may retain the member name as restricted internal operational evidence where required, but the public and Admin ticker API projections must not return that field. The ticker presentation must use the canonical Member ID field, not a generic alias property.

### Required behavior
- Public VIP activity API returns only `MemberId` and sanitized `PublicText`; it must not return `Member Name`, Telegram identifiers, or unrelated member fields.
- Admin ticker history returns only Event ID, Created At, Member ID, Event Text, and Status. It must not return the stored Member Name field.
- The website renders the validated Member ID only; no name, display name, nickname, or alias fallback is permitted.
- Keep phone numbers, email addresses, Telegram usernames/IDs, MT5 logins, deposit amounts, payment details, proof documents, PINs, credentials, and internal transition identifiers out of public/Admin ticker projections.
- Legacy name-bearing rows may remain restricted in the source sheet for audit continuity, but only Member ID and approved static event text may be projected to the ticker.
- Reject stale public-center cache entries that do not use the current Member-ID-only contract.
- Test the serialized API response and the actual website renderer, not only a source-level field allowlist.

### Test lineage caution

The older Library artifact MPS_Calculator_VIP_Integration_Test.mjs contains assertions from the earlier public-name ticker policy (including an expectation that PublicAlias contains a member name). Those assertions conflict with the later privacy requirement and the current Member-ID-only candidate projection. Do not use that older test as the acceptance gate for the current privacy behavior; replace it with a privacy-specific test against the exact candidate Code.gs before release. The public website CI in this PR does not execute the private Apps Script candidate.

## 3. Existing candidate capability map

| Area | Candidate evidence | Integration decision |
|---|---|---|
| Learning | `apiAdminGetLearningList`, `apiAdminSaveLearningCatalog`, `apiAdminUploadLearningFile`, `apiAdminDeleteLearningFile`; private PDF checks and catalog status | Reuse after source provenance and runtime verification; keep Super Admin gate, private folder, PDF validation, and trash/recovery behavior |
| Market Pulse | `apiAdminValidateMarketPulseUpload` then `apiAdminUploadMarketPulse`; 1 MB limit, strict dataset validator, explicit publish confirmation, private backup | Reuse pattern; do not serve raw uploaded HTML; keep validated data extraction and member backend gate |
| Announcements | `MPS Announcement Center` schema and `apiAdminSaveAnnouncement`; public records filtered by status/audience/window | Extend with maintenance-specific fields/status timeline only if existing schema cannot express the required lifecycle; use additive migration only |
| Website ticker settings | `MPS Website Settings`, `apiAdminSaveWebsiteSettings` | Reuse visual settings (enabled/speed/theme/label); separate presentation settings from event content |
| VIP welcome ticker | `MPS VIP Ticker Events` currently stores raw member identity and public API emits member name | Do not reuse current public contract; privacy remediation is mandatory |
| Winner Board | No dedicated verified winner-record / claims workflow identified in the reviewed candidate | New isolated model and API contract required |
| Lucky Roulette | Current public prototype is presentation-only; no verified official draw engine | Keep demo presentation clearly labelled; official draw is a separate gated backend phase |

The source's own header and handoff identify it as a reconstruction and list missing runtime/integration verification. No claim is made here that these APIs are deployed or operational in the live Apps Script project.

## 4. Admin CMS experience

Add a dedicated **Announcement Center Manager** section inside the authenticated Admin area, visually consistent with the current MPS Admin panels and optimized for Android.

### 4.1 Management tabs
1. **Announcements** — create/edit draft, preview, schedule, publish, hide, expire, and archive.
2. **Ticker** — compose ticker messages, set priority and start/end time, preview at mobile width, pause/enable global display, and inspect history.
3. **Maintenance Status** — set service state, affected feature, start time, current update, ETA (optional), and resolution; retain a timestamped timeline rather than overwriting previous updates.
4. **Winner Board** — create a winner announcement only from a verified official result; manage public masked identity, prize summary, publication, claim status, and archive.
5. **Lucky Roulette** — separate preparation, eligibility review, frozen participant snapshot, approvals, official draw, proof, and publication workflow. This tab must not become a browser-side random-name picker.

### 4.2 Permissions
- Public visitor: read only published PUBLIC records and the public ticker feed.
- Authenticated member: read only content whose audience and membership gate permit it.
- Admin: no additional content-write privileges are assumed beyond the candidate's verified role policy.
- Super Admin: candidate's existing content-management permission boundary; retain it for publishing, withdrawal, maintenance state changes, winner publication, and draw controls unless a separately reviewed least-privilege policy is approved.
- Every backend mutation must validate the session and role at function entry. Hiding a button in HTML is not authorization.
- A public endpoint must never accept a status, audience, role, winner, member ID, or publication decision from the browser as authoritative.

## 5. Logical content model

These are proposed logical contracts, not a direction to create sheets immediately. Exact physical headers and migration scripts must be reconciled against the versioned candidate before implementation.

### 5.1 Announcement
- announcement_id (opaque ID)
- title, category, body_plain_text
- audience: PUBLIC / MEMBER / VIP
- priority: CRITICAL / IMPORTANT / NORMAL
- status: DRAFT / SCHEDULED / PUBLISHED / HIDDEN / EXPIRED / WITHDRAWN
- starts_at_utc, ends_at_utc
- display: PAGE / BANNER / BOTH
- safe_link_label, safe_https_url (optional)
- created_at, updated_at, created_by, approved_by
- version (optimistic concurrency)
- source_event_id (optional, unique when generated from a backend event)

### 5.2 Maintenance record and timeline
- maintenance_id, service_key, affected_area, severity
- state: SCHEDULED / IN_PROGRESS / MONITORING / RESOLVED / CANCELLED
- public_summary, public_detail, optional_eta_utc
- started_at_utc, resolved_at_utc
- created_by, updated_by, version
- append-only timeline entries: event_id, maintenance_id, state, message, occurred_at_utc, actor_ref

Never infer service state from a client clock. ETA is informational; actual resolution requires an explicit backend update.

### 5.3 Ticker item
- ticker_id, source_event_hash (private idempotency reference)
- kind: ANNOUNCEMENT / VIP_WELCOME / WINNER / MAINTENANCE
- public_text (sanitized plain text)
- member_id (canonical Member ID; only identity field allowed in ticker output)
- priority, audience, starts_at_utc, ends_at_utc
- status: DRAFT / APPROVED / SCHEDULED / ACTIVE / EXPIRED / WITHDRAWN
- target_announcement_id (optional)
- created_at, approved_at, updated_at, actor refs, version

The public feed returns only: ticker ID, safe text, priority, and a safe public target. It never returns the source event hash, raw member name, actor identity, or private fields; Member ID is the sole permitted member identity field. For the static GitHub Pages site, `?publicCenter=1` must use a separate strict projection: only public announcements, Member-ID-only VIP ticker activity, allowlisted ticker presentation settings, and update timestamp. Do not forward news, calendar, ads, ad packages, Admin settings, or unknown fields.

### 5.4 Winner record
- winner_event_id, event_title, prize_public_description
- result_reference (private immutable reference to verified draw result)
- public_member_id_masked (optional; generated server-side)
- public_message (no names/aliases)
- status: DRAFT / VERIFIED / APPROVED / PUBLISHED / CLAIMED / EXPIRED / WITHDRAWN
- published_at, claim_deadline, public_claim_instructions
- created_at, updated_at, version

Do not put participant lists, contact data, Telegram IDs, payment data, or full Member IDs into the public winner record. Winner identity disclosure requires explicit policy/consent; this design defaults to no name.

### 5.5 Roulette draw record
- draw_id, event_id, rules_version
- eligibility_cutoff_utc
- participant_snapshot_hash, participant_count
- snapshot_storage_ref (private)
- entropy_source, entropy_commitment, entropy_reveal/proof reference
- prepared_by, approved_by, executed_by
- result_index, winner_ref (private)
- draw_status: DRAFT / FROZEN / APPROVED / EXECUTED / VERIFIED / PUBLISHED / VOID
- idempotency_key, created_at, executed_at, verification_status

The browser receives only the approved visual parameters and final verified public result. It never receives the participant snapshot, secret entropy, or authority to choose a winner. A failed verification means no winner publication.

## 6. Backend API boundaries

Proposed logical API names; do not implement until exact candidate source and active deployment are reconciled.

### Public read-only
- `getPublicAnnouncementFeed(cursor)` — published PUBLIC only.
- `getPublicTickerFeed(cursor)` — active, approved PUBLIC ticker items only.
- `getPublicMaintenanceStatus()` — public service state and timeline only.
- `getPublicWinnerBoard(cursor)` — verified, approved, published winner records only.

### Authenticated admin
- `adminSaveAnnouncement(session, payload, expectedVersion)`
- `adminSetAnnouncementStatus(session, id, status, expectedVersion)`
- `adminSaveMaintenanceUpdate(session, payload, expectedVersion)`
- `adminSaveTickerItem(session, payload, expectedVersion)`
- `adminApproveTickerItem(session, id, expectedVersion)`
- `adminWithdrawTickerItem(session, id, reason, idempotencyKey)`
- `adminSaveWinnerDraft(session, payload)`
- `adminApproveWinnerPublication(session, id, expectedVersion)`

### Roulette — separate privileged surface
- `adminPrepareDraw(session, eventId, rulesVersion)`
- `adminFreezeDrawSnapshot(session, drawId, idempotencyKey)`
- `adminApproveDraw(session, drawId, snapshotHash)`
- `adminExecuteDraw(session, drawId, idempotencyKey)`
- `adminVerifyDraw(session, drawId)`
- `adminPublishDrawResult(session, drawId, expectedVersion)`

Each mutation must use backend session validation, role validation, input validation, rate limiting, ScriptLock or equivalent concurrency control, idempotency, audit logging, and compensating recovery. Version checks must prevent stale Admin pages from overwriting newer content.

## 7. Security, privacy, and resilience rules

- Sanitize content and render user-authored text with text nodes; never inject arbitrary HTML/JS.
- Permit only HTTPS links on an allowlist or validated safe URL policy; block javascript:, data:, file:, and embedded active content.
- Uploaded images/documents must be type/size/signature checked and stored with private ACL where appropriate. Never publish private Drive URLs.
- Public APIs must explicitly map an allowlisted response shape; never serialize whole sheet rows.
- Public API tests must assert absence of raw identity and private fields.
- Do not cache private/admin/member API responses in the service worker. Public cache entries must have bounded TTL and be invalidated after publish/hide/withdraw.
- Ticker items must be generated only from authoritative backend state transitions. Browser form submission must never generate a VIP welcome.
- Use a unique source-event hash for idempotency; repeated Telegram updates, retries, and concurrent executions must produce at most one welcome event.
- Keep correction/withdrawal history; never silently rewrite an already published winner or maintenance event.
- The roulette must fail closed on unavailable entropy, mismatched snapshot, concurrent/replayed requests, or failed independent verification.
- Never log secrets, PINs, participant data, raw winner identifiers, or proof contents.

## 8. Required tests before implementation is considered complete

### Privacy regression
- Existing public-center response does not contain any name/alias fields from VIP ticker history.
- Public API contains no full Member ID, phone, email, Telegram username/ID, MT5 login, deposit/payment data, proof URL/file ID, PIN, or credential.
- Masking is performed server-side. If the ID format is short, sequential, or otherwise re-identifiable, output generic text and no identifier.
- Pending, rejected, expired, unverified, or inactive VIP records never create a welcome event.
- A valid VIP activation creates no more than one event under webhook replay and concurrency.
- Existing legacy name-bearing ticker rows are hidden and never included in public feed.

### Authorization
- Direct endpoint calls without a session fail for every admin mutation.
- Member sessions and regular Admin sessions cannot call Super Admin-only publication/draw operations.
- Public endpoints cannot read drafts, scheduled future content, hidden items, VIP/member-only notices, private winner fields, or participant snapshots.
- Guessing an ID or calling a detail endpoint directly does not bypass audience/status checks.

### Content lifecycle
- Draft/schedule/publish/hide/withdraw/expiry works and updates the public feed only at the correct state.
- Critical maintenance notices take precedence and always have a full detail page.
- Maintenance timeline is append-only and preserves previous ETAs/statuses.
- Invalid URL, stored XSS, oversized upload, malformed media, and stale-version writes are rejected.
- Every privileged action creates an audit event.

### Roulette
- Eligibility rules and cutoff are deterministic and versioned.
- Snapshot is immutable after freeze; any change invalidates approval.
- Concurrency/replay yields one draw and one immutable result.
- Independent verifier recomputes the result from the published proof.
- Failed or missing entropy/proof prevents publication.
- Demo animation cannot write official records.

## 9. Work plan and gates

1. **Privacy remediation design:** replace the name-bearing ticker contract and public response; retain legacy history hidden.
2. **Candidate provenance:** intentionally version the complete reconstructed v4.8 candidate source and its matching Index/Calculator files on an isolated workbench. Verify checksums and feature parity; do not assume the Library artifact is the active deployment.
3. **Source reconciliation:** map the logical models/API above to the exact candidate functions, sheets, roles, and UI. Resolve conflicts before editing.
4. **CMS UI extension:** add Admin Manager screens, public ticker/feed rendering, maintenance timeline, and Winner Board with synthetic fixtures only.

### Additional security gate — data-only public feed transport

The first isolated loader prototype injected the Apps Script response as an executable script. That design was rejected because remote JavaScript would run with the public website's origin privileges. The current workbench loader now uses a CORS fetch with credentials omitted, no-store caching, a timeout, strict response-envelope validation, and JSON.parse; it does not inject or execute a remote script.

The feature flag remains false until CORS and redirect behavior are verified against a separate Apps Script deployment. If the data-only fetch is blocked or its response envelope differs, the page must stay in clearly labelled demo fallback mode. Do not restore script-tag/JSONP execution as a workaround. The browser regression test asserts that the feature remains disabled and no remote Apps Script executable is injected.

### Static public feed integration status (isolated workbench)
- Added a consistent ticker and `js/public-center.js` loader to 11 public-facing routes: homepage, Announcement Center, About, Membership, System, Education, Rewards, Rebate, Contact, Market Pulse landing page, and Member Portal. The loader calls the read-only Apps Script `?publicCenter=1` bridge only when `MPS_CONFIG.publicCenter.enabled === true`.
- The feature flag is intentionally `false` in `config.js`; the repository's currently configured endpoint is a live endpoint, and the new bridge has not been deployed or runtime-tested there. This prevents accidental calls to an endpoint that does not yet implement the bridge.
- Frontend renders announcement text through DOM `textContent`, validates links, accepts only a strict canonical MPS Member ID format, and uses a generic VIP activation message when masking is absent. Ticker announcement items are limited to important/maintenance/winner categories; no names or raw IDs are rendered.
- Winner Board now shows no-result state rather than a sample winner. Service status now states that no status has been published rather than claiming normal operation. Roulette remains clearly labelled visual simulation.
- `sw.js` cache namespace advanced to v6 and the new controller was added to the explicit public asset allowlist.
- Route audit: all 11 public-facing routes contain exactly one ticker, one shared feed loader, config, and pause controller.
- Local Node syntax check and synthetic DOM tests: PASS (feature-flag fail-closed behavior, Member-ID-only acceptance, generic VIP fallback, generic winner ticker copy, no JSONP callback, and textContent-only ticker rendering).
- GitHub Actions runs Chromium against a local static server and a mocked CORS endpoint, including malformed/executable-response rejection. This is not a live Apps Script CORS/redirect test, live-data test, Apps Script runtime test, or physical Android test.
5. **Backend isolated implementation:** additive schema only in a separate test Apps Script project and separate test resources; no production migration.
6. **Failure injection and security tests:** duplicate events, concurrent publish, rollback, invalid roles, direct API access, cache leakage, and draw replay.
7. **Runtime + Android validation:** separate test Apps Script deployment, test spreadsheet/folders, test bot/group, and real Android device.
8. **Release gate:** explicit user approval required before touching production Apps Script, production Drive/Sheets, live Telegram settings, active deployment, or GitHub `main`.

## 10. Current conclusion

- The current workbench frontend prototype includes a read-only feed renderer behind a disabled feature flag; the roulette remains UI-only and is not an official draw.
- The reviewed reconstructed v4.8 candidate has an existing Announcement CMS foundation and Super Admin role checks.
- Learning and Market Pulse management already have candidate APIs and UI; they should be reused rather than duplicated.
- The original candidate VIP ticker was not privacy-compliant. A local reconstructed-v4.8 candidate patch now removes names/aliases from public and Super Admin ticker projections, projects only the canonical Member ID and never projects names, excludes legacy name-bearing events, rotates the public cache namespace, and adds a strict read-only static-site bridge. This patch has only synthetic/static verification and is not deployed or Apps Script-runtime verified.
- A verified winner workflow and official roulette engine remain new work, not existing functionality.
- No backend implementation, spreadsheet creation, deployment, production data change, or live draw was performed by this design review.
