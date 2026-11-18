# MPS v4.8.1 Clean Rebuild — Isolated Runbook

## Scope and safety

This rebuild lives on branch `rebuild/v4.8-clean-architecture` under `rebuild/v4.8.1/`.
It is not deployed and is not connected to a production spreadsheet, Drive folder, bot, or webhook.

Use only a brand-new standalone Apps Script project and synthetic spreadsheet/folder.
Do not paste this source into the old MPS project. Do not set a production spreadsheet ID.
Do not deploy, create triggers, or register a Telegram webhook during source acceptance.

## Files

- `Code.gs`: backend source.
- `Index.html`: responsive frontend source.

## Required Script Properties for isolated tests

- `MPS_REBUILD_OWNER_EMAIL`: exact Google account email of the project owner. Provisioning and TOTP initialization verify the active editor account against this value and reject anonymous web-app calls.
- `MPS_SPREADSHEET_ID`: ID of a synthetic test spreadsheet only.
- `MPS_PROOF_FOLDER_ID`: ID of a private synthetic Drive folder only.
- `MPS_REBUILD_ALLOW_PROVISION`: exact string `true`, only while provisioning the synthetic spreadsheet.
- `MPS_REBUILD_ADMIN_PASSWORD_SALT` and `MPS_REBUILD_ADMIN_PASSWORD_HASH`: salted SHA-256 admin credential.
- `MPS_REBUILD_SUPER_ADMIN_PASSWORD_SALT` and `MPS_REBUILD_SUPER_ADMIN_PASSWORD_HASH`: salted SHA-256 super-admin credential.
- `MPS_REBUILD_ADMIN_TOTP_SECRET` and `MPS_REBUILD_SUPER_ADMIN_TOTP_SECRET`: created once by the isolated TOTP initializer.
- `MPS_TELEGRAM_BOT_USERNAME`: bot username without `@`, used to build the post-deposit verification link.
- Optional Telegram integration: `MPS_TELEGRAM_BOT_TOKEN`, `MPS_TELEGRAM_CHAT_ID` (private admin backup destination), `MPS_TELEGRAM_WEBHOOK_SECRET` (unguessable webhook path secret), and `MPS_VIP_GROUP_ID` (VIP group/channel chat ID).
- Optional: `MPS_MARKET_PULSE_JSON` for synthetic Pulse payload.
- Optional backup destination: `MPS_BACKUP_FOLDER_ID`, a separate private Drive folder used only by the owner-run manual snapshot function.

Never paste plaintext passwords, PINs, bot tokens, or webhook secrets into source files or chat.

## Provisioning

1. Create a new standalone Apps Script project.
2. Add `Code.gs` and `Index.html` from this folder.
3. Set `MPS_REBUILD_OWNER_EMAIL` to the Google account that owns the isolated Apps Script project.
4. Create a new empty synthetic spreadsheet and a new private synthetic Drive folder.
5. Set the spreadsheet and folder properties to those synthetic resources.
6. Set `MPS_REBUILD_ALLOW_PROVISION=true`.
7. Run `provisionMpsRebuildStorage()` manually once from the owner account.
8. Run `validateMpsRebuildConfig()` and inspect the returned booleans.
9. Remove or set `MPS_REBUILD_ALLOW_PROVISION` to anything other than `true` after provisioning.

Provisioning creates the legacy 18-column sheet only if absent and creates auxiliary sheets only when absent. It accepts either the exact 18-column legacy header or the exact recognized 30-column v4.8 header (18 core + 12 technical columns). It rejects any other header layout. It does not clear, delete, or rewrite existing member rows or technical-column values; new member rows write only the 18 core values.

## Important implementation gaps — NOT ACCEPTED FOR PRODUCTION

This is an initial clean architecture baseline, not a production-ready release.

- Admin-only initial PIN issue/reset is now implemented: it generates a six-digit PIN, stores only salted SHA-256 hash + salt in Script Properties, and displays the PIN once in the authenticated admin UI. Admin must verify member identity and deliver it privately. Automated verified-Telegram delivery and member self-service recovery are not implemented.
- Telegram linking now issues a 32-hex-character, 24-hour single-use deep link after deposit; only the SHA-256 token hash is stored. `/start` validates that the Telegram username exactly matches the registration username before storing Telegram user/chat IDs. Webhook updates are journaled with payload JSON and completed updates are deduplicated. Because Apps Script ContentService cannot reliably return a non-2xx webhook status, processing failures are recorded as `FAILED` and can be retried from the Admin control panel. The webhook is not registered automatically.
- After a deposit, the configured private admin chat receives a backup summary of registration and deposit data. No admin Telegram message is sent at initial registration. Configure and verify the admin chat ID carefully because this message contains personal and account-related information.
- Approval is blocked until Telegram username verification is complete. If bot username is not configured, no link is issued and approval cannot proceed until the configuration is corrected.
- Admin can reissue a missing/expired Telegram link without asking the member to resubmit proof, using `apiAdminReissueTelegramLink`.
- Admin can retry failed/stale Telegram webhook updates from the control panel; the journal stores sanitized payload JSON for retry and must remain private. One-time `/start` tokens are redacted before storage; if that specific webhook fails, the update is marked non-retryable and Admin must issue a fresh Telegram link.
- Telegram update journal retains the inbound update JSON to support controlled Admin retries; restrict spreadsheet access because these payloads contain Telegram account metadata. Reissue expires older pending links.
- After approval, a VIP invitation task is queued. The Admin UI attempts to process it immediately: the bot creates a 48-hour invite link that requires a join request and sends it to the linked member. The webhook approves only the exact linked Telegram user ID; forwarded links are rejected for other accounts. Queue claims are protected against concurrent Admin clicks and stale processing can be retried. Failed deliveries remain in `RETRY`; Admin can run the VIP queue action again.
- Bot must be an administrator of the VIP group with permission to create invite links. Configure `MPS_VIP_GROUP_ID` and Telegram webhook updates to include `chat_member` and `chat_join_request`. Confirmed `chat_member` joins are matched to an approved member by Telegram user ID; only then is the nickname published to the public VIP ticker. A verified leave removes the prior join from public display.
- VIP invitation creation, owner-bound join-request approval, confirmed join/leave events, retryable invitation queue, and public nickname ticker are implemented in source. They still require isolated Bot API/group acceptance tests.
- Admin health summary and the latest 50 audit events are available from the Admin panel. The summary omits secrets and member proof data.
- `createMpsBackupSnapshot()` is an owner-only manual backup. It requires a separate private `MPS_BACKUP_FOLDER_ID`, refuses the proof folder, creates a timestamped spreadsheet copy, and never auto-deletes older backups.
- `installMpsWeeklyBackupTrigger()` is an owner-run opt-in that installs one Sunday ~03:00 project-timezone backup trigger. The scheduled handler checks the effective Google account against `MPS_REBUILD_OWNER_EMAIL`, rechecks the private backup folder, and creates a private copy. It does not delete old backups. Trigger installation and a real scheduled execution/restore drill remain untested in Apps Script.
- Basic temporary per-identifier throttles now cover registration, deposit submission, and login attempts. They use Apps Script cache and are not atomic/distributed controls; robust lockout, IP/edge protection, stronger super-admin privilege separation, CSRF protections, and comprehensive authorization tests remain unimplemented.
- Admin Learning/News publishing and scheduled Public/Member announcements are implemented in source. Actual premium materials and editorial news must still be supplied by Admin; no content has been fabricated. Member billing/QRIS lifecycle and Exness IB status/rebate integration are not implemented. Binance PAXGUSDT M5 fetch logic is implemented but has not been validated against the live API from Apps Script.
- Proof uploads now stop unless the parent proof folder reports PRIVATE sharing access; each created proof file is also set PRIVATE. The owner must still verify the folder's individual editor list and test direct-file access in the isolated Drive environment.
- No physical Android/PWA acceptance, Apps Script quota test, ScriptLock contention test, live Telegram webhook test, live Bot API delivery test, actual VIP-group join/leave test, real announcement/content publishing test, or live Binance feed test has been performed.
- No deployment or production migration is authorized by this runbook.

## Google Authenticator setup (isolated project only)

1. First configure both Admin and Super Admin password hash/salt properties.
2. In the Apps Script editor, run `initializeMpsTotpSecrets()` once as the project owner. Setup functions compare `Session.getActiveUser().getEmail()` with `MPS_REBUILD_OWNER_EMAIL` and reject anonymous web-app calls.
3. Add each returned `otpauth://` account to Google Authenticator on the corresponding device. The function refuses to overwrite existing secrets.
4. Keep an offline recovery copy of the secrets in an approved secure vault. Do not paste secrets or authenticator codes into chat or source files.
5. Admin and Super Admin login APIs now require password plus the current six-digit TOTP code. The HTML login screen provides separate Admin and Super Admin forms; both use separate passwords and authenticator secrets. Super Admin currently has the same review permissions as Admin; privileged Super Admin-only management actions remain to be defined.

## Telegram setup checklist (manual, isolated bot/group only)

1. Configure the bot token, bot username, private admin chat ID, webhook secret, and synthetic VIP group ID as Script Properties.
2. Add the bot to the synthetic VIP group as an administrator with invite-link permissions.
3. Deploy only the isolated project after review; set the Telegram webhook URL to the deployed `/exec/<MPS_TELEGRAM_WEBHOOK_SECRET>` path and subscribe to `message`, `chat_member`, and `chat_join_request` updates. Do not run `setWebhook` from this source; the owner must do this explicitly.
4. Test registration, deposit, matching and mismatching Telegram usernames, link expiry/reissue, approval, invite delivery, actual join, and leave using synthetic accounts only.
5. Never use the production MPS bot/group for these acceptance tests.

## Deterministic crypto self-test

Run `runMpsCryptoSelfTests()` manually in the isolated Apps Script editor. It checks SHA-256 against a known vector and six RFC 6238 HMAC-SHA1 TOTP vectors, plus Base32 decoding. This test is included in source but has not been executed in the Apps Script runtime by this audit.

## Current hardening added in source

- Admin-managed scheduled announcements support Public/Member audiences, active windows, and per-session dismissal.
- Admin-managed Learning and News records are published only through authenticated member content APIs. News source name/URL and publication time are stored; editors must provide verified sources and original summaries.
- Member Market Pulse fetches Binance Spot PAXGUSDT M5 candles when no manual JSON override exists; label explicitly states this is a gold-market proxy, not a broker Forex XAUUSD feed. Results are cached for 60 seconds.

- Public registration: temporary limit of 3 attempts per Telegram username per hour.
- Deposit submission: temporary limit of 3 attempts per Application Ref per hour.
- Member login: temporary limit of 8 attempts per Member ID per 15 minutes.
- Approved member PIN: Admin can issue/reset a six-digit PIN from the admin queue. Reset immediately invalidates the previous PIN. The PIN is returned once to the authenticated admin and is not written to Sheets or logs.
- Setup-only functions `provisionMpsRebuildStorage()` and `initializeMpsTotpSecrets()` verify `MPS_REBUILD_OWNER_EMAIL` against the active Google account; anonymous browser calls are rejected.
- Admin/Super Admin MFA: separate Google Authenticator TOTP secrets; API login requires password plus six-digit code with ±1 time-step tolerance. Each TOTP time step is accepted only once per role to block simple replay.
- Admin login: temporary limit of 8 attempts per 15 minutes; Super Admin: 5 attempts per 15 minutes.
- Cache keys contain a SHA-256 digest rather than raw usernames or member IDs.
- Duplicate deposit submission for the same Application Ref is rejected before another proof file is created.
- Registration validates Telegram username format and allowed membership goals. Deposit dates must be valid ISO dates and not future-dated. Uploaded proof bytes must match the claimed JPEG/PNG/WEBP signature.

These are baseline abuse controls only. They have not been load-tested or verified in the Apps Script runtime.

## Release gate

Domain-copy monitoring, backup restore drills and recovery validation, QRIS billing lifecycle, Exness IB status/rebate integration, verified premium Learning/News editorial content, and production-grade edge protection remain release blockers. Do not deploy until these workflows are resolved, code is independently reviewed, isolated Apps Script/Sheets/Drive tests pass, Android checks pass, and the owner explicitly approves a deployment plan.