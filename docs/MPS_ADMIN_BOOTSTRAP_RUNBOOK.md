# MPS v4.8 — Owner-only Admin Bootstrap

## Purpose

The candidate backend contains separate Admin and Super Admin roles. Both require distinct passwords and distinct TOTP MFA secrets. The one-time `initializeMPSAdmin_()` function provisions the first Super Admin credential and both MFA secrets without changing the existing `MPS_ADMIN_TOKEN`.

## Safety boundaries

- This is a manual Apps Script editor operation only. The function name ends with an underscore so it is not callable through `google.script.run`.
- It verifies that the executing account is the owner of the Apps Script project. If the owner identity cannot be verified, it stops.
- It refuses to run if any bootstrap/MFA properties already exist or if the existing Admin password is weak.
- It creates a one-time text handoff file in Drive, sets sharing to PRIVATE, and verifies that access before writing credentials to Script Properties.
- It does not create or edit spreadsheet tabs, member records, proof files, Learning files, Telegram settings, web-app deployments, or public feature flags.
- It is not a replacement for reconciling the candidate source with the actual Apps Script deployment.

## Owner procedure — only after the candidate source is reviewed and approved

1. Confirm the exact backend source intended for the TEST Apps Script project. Do not paste this candidate over an unverified or newer backend.
2. From the Apps Script editor while signed in as the project owner, run `initializeMPSAdmin_()` manually. Do not expose it through an HTML button, `google.script.run`, web endpoint, or trigger.
3. If the function stops with an error, stop. Do not repeatedly retry or manually clear bootstrap properties.
4. Open the private Drive file named `MPS-ADMIN-BOOTSTRAP-ONE-TIME-...`. The execution log contains only the private file URL, never the generated secrets.
5. Save the Super Admin password in a password manager. Add each of the two Base32 MFA secrets to a trusted Authenticator app under separate MPS Admin and MPS Super Admin entries.
6. Verify the Super Admin login and MFA before removing the handoff file from Drive. Keep the existing Admin password unchanged.
7. After successful verification, delete the one-time handoff file. Do not delete the bootstrap completion marker from Script Properties; it prevents accidental reinitialization.

## Recovery and failure handling

If the owner-only check fails, use the actual project owner account. If the private Drive file cannot be made PRIVATE, the function rolls back the newly written properties and trashes the handoff file. If rollback itself is incomplete, stop and audit Script Properties and Drive manually before any retry. A partial or completed bootstrap must never be bypassed by adding a public initialization endpoint.

## What this does not authorize

Merging this change does not authorize deployment, changing Script Properties in the live project, migrating the member database, provisioning sheets, enabling public features, or changing production/member data. Those remain separate owner-approved steps.
