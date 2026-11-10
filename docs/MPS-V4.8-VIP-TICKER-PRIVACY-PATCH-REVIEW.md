# MPS v4.8 VIP Ticker Privacy Patch — Review Record

**Status:** Local candidate patch prepared and statically tested. Not deployed. Not a claim of Apps Script runtime verification.
**Isolated branch:** `mps-v4.8-announcement-privacy-isolated`
**Source provenance:** Reconstructed v4.8 candidate, not the lost original production baseline.

## Source integrity

The unmodified candidate files were checked against the supplied `SHA256SUMS.txt`:
- Original `Code.gs`: `c9e84512fc2ac641f59f63b9b8b7fa10d113f0256f662c25ca70555a09aea8ba`
- Original `Index.html`: `8835b2d6ba1aea0ffe6678f395fdab460af9272f6375bc346d6b58e8d5fce4a7`

Both hashes matched the manifest. The source pair is `Code.gs` + `Index.html`; `MPS_Final_Index.html` is not the manifest-matched Index artifact.

## Privacy patch prepared locally

- Removed member-name/display-name/alias generation from the VIP ticker event writer.
- New ticker rows store an empty legacy name column and fixed generic copy: `Keanggotaan Member VIP MPS berhasil diaktifkan dan diverifikasi`.
- Kept raw Member ID only as a private backend correlation key in the restricted content sheet; it is not returned by public or Super Admin ticker API projections.
- Public ticker response emits only `MaskedMemberId` and generic `PublicText`; no `PublicAlias`, `Member Name`, or raw `Member ID`.
- Mask format is `MPS-****-ABCD`, and is emitted only when the last four characters are unique across the current member database. Invalid IDs, suffix collisions, or database lookup failures result in no identifier.
- Existing historical rows with a non-empty `Member Name` are excluded from the public feed.
- Super Admin ticker history is explicitly projected to Event ID, timestamp, masked ID, generic text, and status; raw identity columns are not serialized to the Admin browser.
- The homepage renderer no longer expects or renders a public alias. It renders only an optional masked ID and generic status copy.
- Rotated the public-center cache namespace to `mps_public_center_v481_privacy` so a previously cached name-bearing payload cannot be reused under the new code.
- Public ticker settings are now an explicit allowlist (enabled/speed/theme and fixed `VIP LIVE` label); free-form Admin prefix/suffix values are not sent to visitors.
- Added a read-only `?publicCenter=1` ContentService bridge for the static site. It emits a fixed `window.MPS_PUBLIC_CENTER_DATA` assignment with a strict response projection; it does not accept a callback parameter. The response is intended only for non-sensitive public content.

## Patched candidate checksums
- Patched `Code.gs`: `6902a4956c00ad55f671da93979a8ff24a9ee027913406d8c3c67bb5339467a4`
- Patched `Index.html`: `5d8a2457744f0eaa1f45fa598674b888963055a0eea9e537ca729f9bd17329e1`

## Local verification performed

1. Node syntax check of the complete backend candidate: PASS.
2. Node syntax check of the inline JavaScript in the matching Index: PASS.
3. Synthetic backend helper tests: PASS — valid format, suffix uniqueness, collision omission, invalid ID rejection, generic event copy, idempotency.
4. Actual public API mapper serialization test with synthetic legacy and new rows: PASS — legacy name and full Member ID absent; unique masked ID only.
5. Actual Super Admin API mapper serialization test with synthetic legacy and new rows: PASS — no name or raw Member ID in the response.
6. Static search: no `PublicAlias`, ticker rendering of `Member Name`, or ticker rendering of raw `Member ID` remains in the matching Index.

## Explicitly not performed

- No Apps Script deployment or live API call.
- No real spreadsheet read/write, migration, legacy-row mutation, or Telegram webhook test.
- No member data, Drive, Script Properties, trigger, bot, DNS, hosting, or production deployment changes.
- No GitHub `main` change.
- No real Android device/browser test of the patched Apps Script UI.

## Release gates still required

1. Reconcile the candidate against the exact active Apps Script deployment source and its matching HTML file.
2. Apply the patch only to a separate test Apps Script project with a synthetic spreadsheet and test Telegram group.
3. Inject webhook replay/concurrency and database read failures; confirm the event remains idempotent and masking fails closed.
4. Inspect actual serialized public and Super Admin responses from the test deployment.
5. Verify the ContentService JavaScript response and redirected `script.googleusercontent.com` URL in a test deployment and real browsers; the local test only validates generated source text, not Google's redirect/runtime behavior.
6. Only after those pass, prepare complete reviewed `Code.gs` and `Index.html` delivery for explicit user-controlled deployment.
