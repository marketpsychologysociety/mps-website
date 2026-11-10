# MPS v4.8 — Announcement Center, Winner Board & Lucky Roulette
**Status:** Technical specification / design proposal — workbench only  
**Date:** 2026-11-11  
**Production boundary:** This document does not authorize production deployment, Apps Script edits, database creation/migration, member-data access, or live draws.

## 1. Product objective

Build one coherent MPS Announcement Center with three connected areas:
1. **Announcements** — maintenance, incidents, service updates, feature releases, community events, and important notices.
2. **Winner Board** — official winner announcements, prize details, claim instructions/status, and an archive.
3. **MPS Lucky Roulette** — an administrator-operated, auditable participant draw. The roulette animation visualizes a backend-determined result; it never selects the winner in browser JavaScript.

The experience should feel premium, energetic, trustworthy, and comfortable on Android. It must remain readable, responsive, lightweight, and accessible.

## 2. Repository and integration context

The inspected workbench repository uses static HTML/CSS/JavaScript for the public GitHub Pages website. The README states that member services and administration run in a separate Google Apps Script Web App. The public website currently has a shared stylesheet at `css/style.css`, shared client script `js/main.js`, PWA manifest, and service worker.

Integration constraints:
- Add a dedicated public route, proposed `announcements.html`, and navigation entry only after route/nav regression review.
- Use existing MPS shared styles and navigation conventions; do not create a second incompatible design system.
- Keep public page data limited to explicitly public records.
- The public GitHub Pages app must not receive admin credentials, private participant lists, private member IDs, draw seeds, or private winner contact data.
- Admin workflows belong in the authenticated Apps Script admin experience, not in public static JavaScript.
- Routine announcement publishing should be CMS/data-driven; ordinary content changes must not require editing `Code.gs` or `Index.html`.
- Exact backend candidate provenance and the active Apps Script deployment are not yet verified. API names and physical sheet headers in this document are logical contracts, not claims about existing deployed implementation.
- Preserve the service-worker public asset allowlist. Do not cache private API responses, member/admin HTML, session-bound data, draw preparation data, or participant records.

## 3. Visual design system

### 3.1 Brand direction
- Base: deep charcoal / near-black with layered graphite panels.
- MPS signature: restrained gold/yellow for primary emphasis and bull identity; electric blue for bear/market status.
- Accent: magenta and green only for meaningful states or small details.
- Typography: strong display heading, comfortable body size, clear line-height, high contrast.
- Cards: subtle border, soft depth, restrained glow; avoid excessive neon outlines.
- Status colors must always be paired with text/icon, never color alone.

### 3.2 Motion and animation
Motion should feel polished rather than noisy:
- Page entry: short opacity + translate transition, staggered only for a small number of visible cards.
- Announcement cards: gentle hover/focus lift on pointer devices; no hover-only information on touch.
- Live maintenance: compact pulse on the status indicator, not the entire card.
- Countdown: update once per second only while visible; use an absolute server-provided target timestamp and recompute after tab visibility changes. Never let a client countdown determine system authorization.
- Roulette: smooth wheel spin with easing and deceleration, pointer tick feedback if supported, confetti/glow only after the result is confirmed, and a reduced-motion alternative that displays the confirmed result immediately.
- Avoid continuous animation on every card, flashing text, large parallax, autoplay sound, and layout-shifting effects.
- Respect `prefers-reduced-motion`; provide a no-motion mode and preserve all information without animation.
- Honor Android low-power and narrow-screen performance: animate transforms/opacity, avoid expensive blur/filter layers, avoid large canvas loops, and stop animation when offscreen or tab-hidden.
- No audio unless a user explicitly initiates it; default sound off.

### 3.3 Responsive behavior
- Mobile-first, tested at 360/390/412 px widths and desktop.
- Single-column cards on phones; two/three-column layouts only when content width supports them.
- Minimum comfortable touch targets, clear spacing, no horizontal overflow.
- Keep primary actions visible without requiring precise hover.
- Use skeleton/loading states that do not imply a successful fetch.
- Empty, loading, offline, error, and stale-data states must be visually distinct.
- Show timezone explicitly; default display timezone: Asia/Jakarta (WIB), with stored timestamps in UTC.

## 4. Public information architecture

### 4.1 Announcement Center page
Suggested page hierarchy:
1. Hero: “MPS Announcement Center” + concise subtitle.
2. Current service status strip: Normal / Planned Maintenance / Maintenance in Progress / Partial Disruption / Incident / Resolved. Show only backend-confirmed current status.
3. Featured urgent notice, if any.
4. Filter chips: Semua, Pemeliharaan, Gangguan, Update, Event, Penting.
5. Announcement list cards: category, priority, title, short summary, published time, status, optional schedule.
6. Detail view/page or accessible expandable content with full body, affected services, timeline, next update, and related links.
7. Archive with pagination; no unbounded fetch.
8. Footer/help route consistent with MPS.

Maintenance notice fields shown publicly:
- State (planned / ongoing / partial / resolved).
- Affected service(s).
- Start and expected end (if known).
- Last updated time.
- Latest verified update and next update time (if committed).
- Clear note when ETA is unknown; never fabricate restoration time.
- A completed notice should include actual completion time and a short resolution summary when safe.

### 4.2 Winner Board
- Featured latest official winners.
- Event title, event date, prize, and (only if necessary) a masked public Member ID; never display the winner's real name.
- Winner claim state shown only as safe labels: Menunggu Klaim / Klaim Diverifikasi / Hadiah Diserahkan / Kedaluwarsa (if rules allow).
- Winner history archive with filters and pagination.
- Public proof summary: draw ID, participant count, draw timestamp, published proof/verification link where available.
- Do not show personal contact details, Telegram IDs/usernames, email, phone, Member ID, MT5 login, deposit data, proof documents, or internal eligibility evidence.
- Do not publish a winner's real name or alias. If a public identifier is operationally necessary, show only a masked Member ID (for example, `MPS-****-4821`) after privacy-policy approval; otherwise show “Identitas disamarkan”. A masked ID must not be reversible or expose enough characters to identify the member.
- Never imply that a winner has claimed or received a prize until the claim workflow confirms it.

### 4.3 Lucky Roulette public presentation
- Public users can see an explanation, past published draw records, and the animated result reveal when an official event is published.
- Public users cannot start, rerun, alter, or query a live/private participant draw.
- Do not expose participant names in the wheel before the event unless event rules and consent explicitly authorize it.
- If a live stream/showcase is desired later, use a safe public display feed that contains no private participant data and cannot control the draw.
- Demo mode must be clearly labelled “SIMULASI — BUKAN HASIL RESMI”; it must never write a winner record or produce a claimable prize.

## 5. Admin experience

Admin panel should be a clear control room with separate tabs:
- Overview
- Announcements
- Maintenance status
- Winner events
- Lucky Roulette
- Published archive
- Audit history

### 5.1 Announcement workflow
1. Draft.
2. Preview as public/member audience.
3. Validate required fields, dates, links, and audience.
4. Submit for approval if priority is Critical/High or content affects service availability.
5. Schedule or publish.
6. Update with version history.
7. Resolve/archive; do not silently erase published records.

Roles:
- Super Admin: create, edit, schedule, approve, publish, resolve, archive, manage categories.
- Admin/editor (if authorized by role policy): draft and submit; cannot self-approve critical notices unless an explicit policy permits.
- Public/member: read only according to visibility.

### 5.2 Maintenance workflow
- Planned maintenance can be scheduled with start/end and affected services.
- Start transition must be explicit or driven by a verified scheduled job; do not infer from browser time alone.
- Ongoing status updates append timeline entries; prior entries remain auditable.
- Resolve action records actual restoration time, actor, and summary.
- If ETA changes, publish an update rather than silently replacing prior information.
- A maintenance banner must not be treated as an access-control switch. Protected services must enforce their own backend state and authorization.

### 5.3 Winner event workflow
1. Create event and publish/record rules before participant freeze.
2. Define eligible cohort and eligibility cutoff.
3. Preview aggregate eligibility counts; do not expose full private roster unnecessarily.
4. Freeze participant snapshot and verify duplicate/exclusion rules.
5. Generate snapshot hash and immutable draw record.
6. Obtain required approval/second-person review.
7. Execute one official draw attempt using the approved randomness protocol.
8. Verify result and proof.
9. Approve winner identity disclosure and prize claim process.
10. Publish result.
11. Record claim verification and prize handover as separate state transitions.

An official draw cannot be edited into a different winner. Corrections must append a correction record and preserve the original draw result/proof. A cancelled event must retain its cancellation reason and history.

### 5.4 Admin safety controls
- Server-side role and session verification on every action.
- Step-up verification for freeze, official draw, cancellation, winner disclosure, and prize handover.
- Prefer dual control: one authorized operator prepares/freezes, a second authorized reviewer approves the official draw or publication.
- Idempotency key per action; duplicate click/retry must not create a second draw.
- Lock event during freeze/draw; concurrent requests return the same operation state/result.
- Explicit confirmation screen summarizes event, participant count, snapshot hash prefix, rules version, and draw protocol before final action.
- No destructive delete of published event/draw/audit records.
- Rate limits and audit log for failed/unauthorized attempts.

## 6. Logical data model (proposed, additive)

These are logical entities. Physical spreadsheet names, exact headers, and migration steps must be reconciled against the verified v4.8 backend source and actual deployed database before implementation. Do not auto-create sheets from public endpoints.

### 6.1 Announcement
- announcement_id (opaque stable ID)
- slug (unique public route key)
- title, summary, body
- category, priority
- visibility (PUBLIC / MEMBER / VIP)
- status (DRAFT / PENDING_APPROVAL / SCHEDULED / PUBLISHED / RESOLVED / ARCHIVED)
- affected_services (controlled list)
- scheduled_start_utc, scheduled_end_utc
- published_at_utc, last_updated_at_utc
- created_by, updated_by, approved_by
- version, supersedes_id (optional)
- media_refs (private/public classification required)
- next_update_at_utc (optional)
- correction_note (optional)

### 6.2 Announcement timeline
- timeline_entry_id
- announcement_id
- event_type (CREATED / SCHEDULED / PUBLISHED / STATUS_CHANGED / ETA_CHANGED / UPDATE / RESOLVED / ARCHIVED / CORRECTION)
- public_message
- occurred_at_utc
- actor_ref
- version
Append-only after publication; corrections append rather than overwrite history.

### 6.3 Winner event
- event_id
- event_title, description, prize_description
- rules_version, rules_published_at_utc
- eligibility_policy_id, eligibility_cutoff_utc
- event_status (DRAFT / OPEN / FREEZE_PENDING / FROZEN / DRAW_PENDING / DRAWN / REVIEW_PENDING / PUBLISHED / CLAIMED / CLOSED / CANCELLED)
- participant_count
- participant_snapshot_hash
- snapshot_created_at_utc
- randomness_protocol_version
- randomness_commitment / public_entropy_reference / verification_metadata
- draw_id, draw_attempt_number
- selected_participant_ref (private internal reference)
- winner_public_member_id_masked (optional, public-safe; generated by a strict backend allowlist/masking function)
- identity_disclosure_consent (controlled evidence reference, not public)
- claim_status, claim_deadline_utc
- created_by, frozen_by, approved_by, drawn_by, published_by
- created_at_utc, drawn_at_utc, published_at_utc
No phone/email/Telegram ID/MT5/deposit/proof details in public event records.

### 6.4 Participant snapshot (private)
- snapshot_row_id
- event_id
- participant_ref (internal stable identity reference; never public)
- eligibility_result
- eligibility_policy_version
- inclusion/exclusion reason code
- snapshot_sequence
- snapshot_hash_component
Access restricted to the draw service and authorized reviewers. Keep only the minimum evidence needed to explain eligibility; do not duplicate sensitive member fields.

### 6.5 Draw audit (append-only)
- audit_id, event_id, draw_id
- operation_type, actor_ref, timestamp_utc
- participant_snapshot_hash, participant_count
- randomness protocol and public reference
- commitment, reveal/verification result, selected index
- request_id/idempotency_key hash
- outcome, failure_code, previous_audit_hash/current_audit_hash
Never store PINs, session tokens, raw credentials, or unnecessary personal data. Secret material must not be exposed in public audit output.

### 6.6 Prize claim
- claim_id, event_id, selected_participant_ref
- claim_status, submitted_at_utc, verified_at_utc, handed_over_at_utc
- verifier_ref, handover_reference
- private evidence reference with strict access controls
Public board receives only safe status and alias.

### 6.7 Journal and transactional recovery
Sensitive freeze/draw/publish actions must use a pre-provisioned journal and explicit state machine. Sheets/Drive are not ACID transactions. Use durable operation IDs, write-intent/read-back records, compensation, and RECONCILIATION_REQUIRED when rollback cannot be verified. CacheService is never the source of truth for idempotency.

## 7. Fairness and randomness protocol — release blocker

### 7.1 Non-negotiable rules
- Browser JavaScript, CSS animation, Math.random(), client timestamps, and client-submitted winner IDs must never determine an official winner.
- The participant list is frozen before the unpredictable entropy value used for the draw becomes available.
- Eligibility policy and rules version are fixed and published before freeze.
- Every eligible participant appears exactly once; duplicates and exclusions are explained by policy.
- Draw result is deterministic from the published snapshot commitment + approved unpredictable entropy + protocol version.
- Use unbiased index mapping (rejection sampling or another reviewed unbiased method), not naïve modulo if it introduces bias.
- No reroll to seek a preferred result. A second draw requires a separately documented event cancellation/restart policy, reason, approval, and public disclosure; the first result remains visible in audit history.
- An independent reviewer must be able to recompute/verify the result from public proof without seeing private participant data.

### 7.2 Recommended protocol shape
1. Publish event rules, eligibility cutoff, draw method, and planned draw window.
2. Build a canonical sorted participant snapshot using opaque participant references.
3. Hash the canonical snapshot and publish its commitment before the public entropy is known.
4. Freeze the snapshot and make further participant changes impossible for that draw.
5. Obtain a future public randomness value after the freeze (or another independently verifiable entropy source approved by security review).
6. Combine snapshot hash, event ID, protocol version, and entropy with a cryptographic hash to derive the selection stream.
7. Apply unbiased index selection against participant count.
8. Persist the selected index, draw proof, timestamp, actor approvals, and verification result.
9. Independently recompute and verify before publication.
10. Publish a proof package that allows verification without exposing participant identities.

The exact entropy provider, signature verification, availability/fallback behavior, and Apps Script implementation must be security-reviewed before code. If the source is unavailable or proof verification fails, the draw stops; do not silently fall back to an unverified random function. Do not claim “provably fair” until independent verification has passed.

### 7.3 Roulette animation
- Backend returns a signed/verified draw result and display-safe winner alias.
- Frontend maps that already-confirmed result to a visual wheel position.
- Animation duration/easing affects presentation only, never outcome.
- If the animation fails or user reloads, the same confirmed result is shown; no new draw is triggered.
- The result card displays event name, draw ID, winner alias, timestamp, participant count, and proof link/status.
- The wheel may use anonymized labels or numbered slots; do not reveal private participant identities to spectators.

## 8. API contracts (logical; names are provisional)

Public/read:
- getPublicAnnouncementFeed(filters, cursor)
- getPublicAnnouncementDetail(announcementIdOrSlug)
- getPublicServiceStatus()
- getPublicWinnerFeed(filters, cursor)
- getPublicWinnerDetail(eventId)
- getPublicDrawProof(drawId)

Member/read (only if member-only notices are required):
- getMemberAnnouncementFeed(session)
- getMemberAnnouncementDetail(session, announcementId)

Admin:
- adminCreateAnnouncement(session, payload, idempotencyKey)
- adminUpdateAnnouncementDraft(session, id, payload, expectedVersion)
- adminSubmitAnnouncement(session, id, expectedVersion)
- adminApproveAnnouncement(session, id, expectedVersion)
- adminPublishAnnouncement(session, id, idempotencyKey)
- adminScheduleAnnouncement(session, id, schedule, idempotencyKey)
- adminAppendAnnouncementUpdate(session, id, update, idempotencyKey)
- adminResolveAnnouncement(session, id, resolution, idempotencyKey)
- adminCreateWinnerEvent(session, payload, idempotencyKey)
- adminFreezeWinnerParticipants(session, eventId, expectedVersion, idempotencyKey)
- adminApproveWinnerDraw(session, eventId, snapshotHash, idempotencyKey)
- adminExecuteWinnerDraw(session, eventId, approvalRef, idempotencyKey)
- adminVerifyWinnerDraw(session, drawId)
- adminPublishWinner(session, eventId, publicDisclosure, idempotencyKey)
- adminUpdatePrizeClaim(session, eventId, claimUpdate, idempotencyKey)
- adminGetAuditHistory(session, filters, cursor)

Every admin API must authorize on the server and validate object ownership, role, state transition, version, request size, and idempotency. Never trust hidden buttons or caller-supplied role/member status. Public APIs must return allowlisted fields only and bounded/paginated results.

## 9. Security, privacy, and abuse controls
- Public/member/VIP visibility enforced in backend on every request.
- Private participant snapshot and internal selected participant reference are never returned from public APIs.
- Protect against IDOR by checking authorization for the exact announcement/event/claim object.
- Sanitize rendered announcement content; allow a narrow safe formatting subset, reject executable HTML/JS and unsafe URLs.
- Validate image/media type, signature, size, dimensions where practical, and storage ACL; do not expose private Drive URLs.
- Prevent stored XSS in title/body/alias and uploaded SVG/HTML.
- Rate-limit public reads and all admin mutations; paginate.
- Protect against CSRF/replay according to session architecture; idempotency keys are server-validated and bound to actor/action.
- Audit all privileged actions, failed approvals, draw attempts, corrections, disclosure and prize handover.
- Never cache private responses in the PWA service worker or CDN.
- Avoid exposing member identifiers in analytics, URLs, error messages, or logs.
- No announcement content can override actual authorization or bypass backend maintenance policy.

## 10. Acceptance and test matrix

### UI / usability
- [ ] Looks consistent with current MPS premium dark style.
- [ ] Mobile 360/390/412 px: no horizontal overflow, readable text, usable controls.
- [ ] Desktop layout scales without oversized empty panels.
- [ ] All buttons, filters, tabs, details, pagination, and archive routes work.
- [ ] Loading, empty, offline, stale, error, and success states are distinguishable.
- [ ] Reduced-motion mode preserves meaning and all functionality.
- [ ] Countdown uses explicit WIB display and correct UTC conversion; hidden-tab resume does not drift.
- [ ] Roulette animation always ends at the backend-confirmed winner; refresh/reopen cannot trigger another draw.
- [ ] Keyboard focus, semantic headings, labels, contrast, and screen-reader status announcements are checked.

### Announcement / maintenance
- [ ] Public cannot read member/VIP notices by direct API or guessed ID.
- [ ] Draft/scheduled/unpublished content is not public.
- [ ] Critical notice requires configured approval.
- [ ] ETA update preserves previous timeline.
- [ ] Resolved status records actual resolution time.
- [ ] Public status never changes merely because client clock crosses a scheduled time.
- [ ] HTML/script injection and unsafe media are rejected or safely rendered.

### Winner / roulette
- [ ] Duplicate participants are detected and handled by published rules.
- [ ] Eligibility cutoff and snapshot are immutable after freeze.
- [ ] Any snapshot change invalidates approval and requires a new documented freeze.
- [ ] Two concurrent draw requests produce one operation/result.
- [ ] Replayed request does not create another draw.
- [ ] Public entropy unavailable/invalid => draw fails closed.
- [ ] Independent recomputation yields the exact same selected index.
- [ ] Unbiased index mapping tests cover boundary values and large participant counts.
- [ ] No reroll path can overwrite a previous result.
- [ ] Public proof reveals no private participant data.
- [ ] Winner disclosure requires valid consent/rules.
- [ ] Claim/handover statuses cannot be forged from frontend.
- [ ] Demo mode cannot write official records.

### PWA / security / regression
- [ ] Service worker does not cache private announcement/member/admin/draw responses.
- [ ] Public static page remains usable when API is offline and clearly labels stale data.
- [ ] Existing routes, navigation, portal, ticker, and PWA behavior regressions pass.
- [ ] Backend authorization tests cover public, pending, member, VIP, admin, and Super Admin.
- [ ] Journal recovery and failure injection cover freeze/draw/publish and partial writes.
- [ ] Real Apps Script runtime and Android tests are recorded separately from static/browser emulation.

## 11. Delivery phases and gates

**Phase A — UX and design prototype:** public page shell, responsive cards, filters, maintenance timeline, winner card, roulette presentation using clearly labelled synthetic demo data only. No live API or member data.

**Phase B — backend/data contract:** verify complete v4.8 candidate source and actual deployed architecture; map logical entities to an additive schema; preflight ACLs, quotas, storage, journal, and API authorization. No production migration.

**Phase C — announcement CMS:** draft/review/schedule/publish/resolve/archive with audit and role tests.

**Phase D — winner event and claim workflow:** event rules, eligibility engine, consent, participant snapshot, private records, dual approval.

**Phase E — randomness and official roulette:** implement only after entropy provider and proof verification are independently reviewed. Failure to verify means no official draw.

**Phase F — regression and release readiness:** UI/browser tests, Apps Script isolated failure injection, security tests, Android real-device validation, PWA cache audit, complete Code.gs/Index.html cross-review. Production deployment requires separate explicit approval.

## 12. Current status and known unknowns

- [x] Public repository structure inspected on `mps-v4.8-workbench`.
- [x] Confirmed static public site + separate Apps Script portal from repository README.
- [x] Identified shared stylesheet, main client script, manifest, and service worker.
- [x] Defined public/admin separation, mobile-first visual direction, animation behavior, logical entities, API contracts, draw fairness controls, and acceptance matrix.
- [ ] Exact v4.8 backend candidate must be versioned and reviewed as a whole before API implementation.
- [ ] Actual deployed Apps Script version, database headers, sheet ACLs, Drive ACLs, and quotas remain unverified.
- [ ] Entropy provider and independent proof-verification implementation remain a release blocker.
- [ ] No page, API, sheet, production setting, live draw, or deployment has been implemented by this specification.

**Release rule:** this document is a design specification, not evidence that the feature exists or is secure. Do not publish a real winner or run an official draw until all fairness, authorization, privacy, recovery, and runtime acceptance gates pass.

## 13. Explicit product requirement — VIP welcome and running text

The user has explicitly confirmed that the experience must include a prominent **running text / ticker** for important MPS updates, not only a dedicated announcement page. Treat this as a first-class feature in the UI and CMS.

### 13.1 Running text placement and behavior
- Show a compact, polished ticker in a clearly visible position on the public MPS website and Announcement Center; keep it consistent across relevant pages without obscuring navigation or content.
- Use a smooth continuous horizontal marquee on larger screens. On narrow/mobile screens, use a readable one-line ticker with pause/next controls or a swipeable notice strip; avoid forcing users to chase fast-moving text.
- Provide pause/stop controls, keyboard accessibility, readable contrast, and reduced-motion behavior. Do not auto-scroll critical text so quickly that it cannot be read.
- Support pinned priority notices and a controlled display order: Critical, Important, VIP welcome, General. Critical maintenance notices may temporarily take precedence.
- Each ticker item should be clickable and open the matching announcement detail when a public detail exists.
- Never let a ticker be the only place a critical notice appears; the full announcement page remains the source of detail.
- Use only backend-published, approved records. Do not fabricate member activity or create fake social-proof entries.

### 13.2 Required ticker message types
1. **Official winner announcement:** e.g. “Selamat kepada pemenang event [nama event] MPS — hasil resmi telah diverifikasi.” Do not display a real name, display name, or alias. A masked Member ID may be included only if backend-generated and independently assessed as non-identifying; otherwise omit the identifier. Publish only after the official draw has passed verification and publication approval.
2. **VIP registration welcome:** e.g. “Member VIP baru berhasil diaktifkan — ID MPS-****-4821.” Do not include the member's name or alias. Trigger only after backend confirms the member's final successful/active VIP registration state; never trigger from a submitted form, pending application, or unverified payment.
3. **Important announcements:** maintenance schedule/status, service disruptions, system repairs, feature updates, event openings/closing dates, policy notices, and urgent operational updates.
4. **Optional community milestones:** only genuine, backend-verifiable events and only if the publication policy permits them.

### 13.3 VIP welcome event integrity and privacy
- Generate the ticker item from a real state transition in the authoritative backend, not from frontend form submission.
- Make event creation idempotent so retries, refreshes, or duplicate triggers cannot produce repeated welcome messages.
- Never display a member's real name, display name, or alias in the ticker, including VIP welcomes and winner announcements.
- If the product genuinely needs a member identifier, show only a masked Member ID (e.g. `MPS-****-4821`) generated server-side from the authoritative member record. Prefer masking all but the final 3–4 characters; never accept a pre-masked value supplied by the browser.
- If the Member ID format is short, sequential, guessable, or cannot be masked without re-identification risk, omit it entirely and use generic wording such as “Member VIP baru berhasil diaktifkan”.
- Never expose the full Member ID, phone number, email, Telegram username/ID, MT5 login, deposit amount, payment details, proof documents, PIN, credentials, or internal participant references.
- Do not fall back to a name or alias when a masked ID cannot safely be shown; use generic wording instead.
- The ticker must not imply “VIP aktif” while the account is pending, rejected, expired, or otherwise inactive.
- Provide an admin correction/withdrawal workflow with an audit trail if a welcome item was published incorrectly; do not silently rewrite history.

### 13.4 CMS fields and APIs
Add logical fields to announcement/ticker content:
- ticker_enabled
- ticker_priority
- ticker_start_utc / ticker_end_utc
- ticker_message (sanitized plain text or constrained safe formatting)
- ticker_target (announcement detail route or event detail)
- ticker_audience (PUBLIC / MEMBER / VIP)
- ticker_dismissible
- ticker_source_event_id (unique source event reference for idempotency)
- ticker_status (DRAFT / APPROVED / SCHEDULED / ACTIVE / EXPIRED / WITHDRAWN)

Logical API contracts:
- getPublicTickerFeed(cursor)
- getMemberTickerFeed(session, cursor)
- adminCreateTickerItem(session, payload, idempotencyKey)
- adminApproveTickerItem(session, tickerId, expectedVersion)
- adminWithdrawTickerItem(session, tickerId, reason, idempotencyKey)

The VIP welcome ticker should preferably be emitted by a backend domain event/outbox after the successful VIP activation transaction, then published through the normal moderation/policy path. Do not add ticker creation as a fragile post-commit cache write that can cause a committed activation to be reported as failed.

### 13.5 Additional acceptance tests
- [ ] Ticker is visible and readable on public pages and mobile layouts without covering navigation/content.
- [ ] Pause control, keyboard focus, reduced-motion mode, and screen-reader announcement behavior work.
- [ ] Critical ticker can take priority and links to full detail.
- [ ] A pending/rejected member never triggers a VIP welcome.
- [ ] A successful VIP activation produces at most one ticker event, including under retries/concurrency.
- [ ] Ticker never contains member names/aliases; any Member ID shown is backend-masked and passes re-identification review, otherwise the identifier is omitted.
- [ ] No contact/payment/member credentials or private identifiers appear in HTML, API responses, caches, logs, or URLs.
- [ ] Withdrawn/expired ticker items stop displaying while historical audit remains.
- [ ] Synthetic/fake activity cannot be inserted through public endpoints.
