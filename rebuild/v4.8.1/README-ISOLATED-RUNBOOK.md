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

- `MPS_SPREADSHEET_ID`: ID of a synthetic test spreadsheet only.
- `MPS_PROOF_FOLDER_ID`: ID of a private synthetic Drive folder only.
- `MPS_REBUILD_ALLOW_PROVISION`: exact string `true`, only while provisioning the synthetic spreadsheet.
- `MPS_REBUILD_ADMIN_PASSWORD_SALT` and `MPS_REBUILD_ADMIN_PASSWORD_HASH`: salted SHA-256 admin credential.
- `MPS_REBUILD_SUPER_ADMIN_PASSWORD_SALT` and `MPS_REBUILD_SUPER_ADMIN_PASSWORD_HASH`: salted SHA-256 super-admin credential.
- Optional: `MPS_MARKET_PULSE_JSON` for synthetic Pulse payload.

Never paste plaintext passwords, PINs, bot tokens, or webhook secrets into source files or chat.

## Provisioning

1. Create a new standalone Apps Script project.
2. Add `Code.gs` and `Index.html` from this folder.
3. Create a new empty synthetic spreadsheet and a new private synthetic Drive folder.
4. Set the spreadsheet and folder properties to those synthetic resources.
5. Set `MPS_REBUILD_ALLOW_PROVISION=true`.
6. Run `provisionMpsRebuildStorage()` manually once.
7. Run `validateMpsRebuildConfig()` and inspect the returned booleans.
8. Remove or set `MPS_REBUILD_ALLOW_PROVISION` to anything other than `true` after provisioning.

Provisioning creates the legacy 18-column sheet only if absent and creates auxiliary sheets only when absent. It rejects mismatched headers. It does not clear or rewrite existing member rows.

## Important implementation gaps — NOT ACCEPTED FOR PRODUCTION

This is an initial clean architecture baseline, not a production-ready release.

- Initial PIN creation and secure member PIN enrollment/recovery are not implemented.
- Telegram linking-token issue/consume flow, Telegram bot command handling, webhook replay processing, and notification delivery are not implemented; the webhook currently journals inbound updates only.
- VIP invitation creation, join verification, follow-up worker, and public ticker publication are not implemented; the queue/event sheets are schema foundations only.
- Admin MFA/TOTP, super-admin privilege separation beyond credential/session role, lockout/rate limiting, CSRF protections, and comprehensive authorization tests remain to be implemented.
- Learning/news content management, announcement management, member billing/QRIS lifecycle, Exness IB status verification/rebate integration, and real Pulse feed validation are not implemented.
- Proof file storage uses a private file setting, but folder ACL inheritance and direct-file access must be independently verified in the isolated Drive environment.
- No physical Android/PWA acceptance, Apps Script quota test, ScriptLock contention test, or live Telegram test has been performed.
- No deployment or production migration is authorized by this runbook.

## Release gate

Do not deploy until all missing workflows are implemented, code is independently reviewed, isolated Apps Script/Sheets/Drive tests pass, Android checks pass, and the owner explicitly approves a deployment plan.