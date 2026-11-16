# MPS controlled security simulation and defense assessment

**Assessment date:** 2026-11-16  
**Target:** MPS v4.8 candidate workbench / Draft PR #12  
**Test mode:** source-level checks and mocked Apps Script/Drive services only  
**Production changes:** none

## Mandatory disclaimer

No website can be guaranteed 100% secure. GitHub Pages and Google Apps Script have platform, account, quota, and deployment limits. This assessment is not a live penetration test, does not certify the production site, and does not guarantee immunity from phishing, account compromise, malware, or zero-day vulnerabilities.

All tests in this report were run against candidate source and synthetic data. No production member row, deposit proof, private file, Google account, Telegram token, or live service was attacked or modified.

## Results matrix

| Attack scenario requested | Candidate defense / evidence | Result and boundary |
|---|---|---|
| Unauthenticated visitor calls Admin APIs | Backend role checks; role-bound server-side sessions; API contract tests | **PASS in automated tests.** Admin APIs do not trust a role supplied by the browser. |
| Forge or tamper with a member/Admin session | Member sessions require an existing server-side cache record and matching current PIN hash; Admin sessions require server-side role record and current credential hash | **PASS in automated tests.** Random/forged sessions and stale credentials fail closed. |
| Escalate ordinary Admin to Super Admin | Separate role-bound credentials and MFA; server checks role from the session record | **PASS in automated tests.** Ordinary Admin cannot call Super Admin operations. |
| Steal a session from browser storage | Member/Admin session tokens remain in JavaScript memory; regression verifies they are not written to localStorage/sessionStorage | **PASS for persistence check only.** A compromised browser, malicious extension, device malware, or same-origin script execution could still expose an active in-memory bearer token. No live browser exploit was attempted. |
| Member requests another member's data | Member Intelligence derives identity from `requireMember_(session)`; no caller-supplied member ID controls the returned identity | **PASS in targeted test.** An extra attacker-supplied member ID is ignored; output remains bound to the server-side session. |
| Brute-force six-digit member PIN | Persistent global and per-member login throttles; atomic login counters; member PIN verification uses salted hashes and constant-time comparison | **PASS in automated limiter/session tests.** No high-volume live stress test was performed against production. |
| Replay or double-submit a public request | Durable request ledger reserves IDs under ScriptLock and returns replay output instead of repeating business writes | **PASS in automated fault/replay tests.** Live Sheets contention and Apps Script trigger behavior remain to be tested in isolation. |
| Upload malicious PDF | Super Admin-only upload; PDF signature/EOF checks; blocks common JavaScript, OpenAction, Launch, embedded-file, RichMedia, and XFA markers; file is required to be private | **PASS for tested malicious markers and malformed/oversized samples.** This is heuristic screening, not a complete PDF malware scanner or content-disarm service. Upload only trusted static PDFs. |
| Bypass Member Only with a direct URL or file ID | Member endpoint requires a valid session, Published catalog membership, private file, correct folder, PDF MIME and signature; proof files are delivered only through authenticated Admin API | **PASS in mocked Drive tests.** Actual Drive ACL inheritance and direct-link behavior still require isolated live acceptance. |
| Read database or private documents directly | Database/Drive access is server-side; public responses use explicit whitelists; private Learning and proof folders/files fail closed when shared | **PASS in source/contract and mocked ACL tests.** This is not evidence that the live production Drive ACL is currently correct. |
| Manipulate public ticker or expose member-sensitive data | Public ticker projection filters identifiers and does not expose phone, email, MT5 login, deposits, or proof references | **PASS in privacy regression tests.** |
| Manipulate Lucky Draw results or replay approvals | Dedicated official-draw test harness covers durable journal, nonce/replay handling, reviewer trust, provenance, crash recovery and transactional storage | **Automated candidate coverage exists and is included in CI.** No live draw or production result was changed. |
| Clone the public website / impersonate MPS | GitHub Pages source is public and can be copied; private data still depends on backend session checks and private Drive rather than copied frontend code | **Not preventable by frontend code alone.** A clone can still be used for phishing. Users need a verified official domain and anti-phishing communication. |
| Take over the owner's Google/GitHub account | Website code cannot protect an already-compromised owner identity with permission to edit Apps Script, Script Properties, Drive or repository settings | **Not tested by application CI.** Requires external account hardening and access review. |

## Automated evidence

GitHub Actions [run #2047](https://github.com/marketpsychologysociety/mps-website/actions/runs/43806197671) completed **SUCCESS, 74/74 steps, 0 failures** on candidate head `9bf41d96f3b740052b3e103f859169e570602bf1`.

The controlled red-team boundary suite passed **8/8 tests**, covering:
- Member identity injection into Member Intelligence.
- Session-token persistence in local/session browser storage.
- Public Market Pulse preview contains placeholders only, never the private dataset.
- Common hard-coded credential patterns absent from candidate source files.
- Invalid and truncated PDF rejection.
- Common PDF active-content and embedded-action markers.
- Oversized upload rejection before Drive access.
- A static PDF reaching (but not bypassing) the private Drive boundary.

The Market Pulse converter/schema/member-and-admin API suite passed **9/9 tests**, including runtime denial of direct unauthenticated member and Admin read calls before the private dataset is touched. The mocked Drive publication rollback suite passed **9/9 tests**, including ambiguous rename/create/trash responses.

Existing suites in the same CI cover Admin MFA, member/Admin session authorization, persistent login throttles, durable request replay/idempotency, Learning direct-ID bypass, deposit-proof access, API role contracts, public ticker privacy, and official-draw journal/recovery behavior.

## Owner-account and clone-site hardening checklist

These controls are outside the application test harness and must be checked by the account owner:

1. Enable Google passkeys/security keys or strong two-step verification; review recovery email/phone and signed-in devices.
2. Review Google account third-party access and revoke unknown sessions/app grants.
3. Restrict Apps Script project editors to trusted owners; review deployments and Script Properties after any suspected compromise.
4. Enable GitHub two-factor/passkey authentication; keep repository access limited to the MPS repository; protect the release branch and review personal access tokens.
5. Keep Learning, proof, database and backup Drive folders private; periodically review inherited sharing and external collaborators.
6. Store Admin, Super Admin, Telegram and future bot secrets only in Script Properties or another approved secret store; rotate them after suspected exposure.
7. Publish one official website URL and communicate it consistently. Configure domain email SPF, DKIM and DMARC where available; monitor lookalike domains and report phishing copies.

## Remaining live acceptance gates

- Execute the candidate in an isolated Google Apps Script deployment with synthetic Sheets, real ScriptLock, persistent Script Properties and a test trigger.
- Verify actual Drive parent-folder and file ACLs, including direct URL behavior, using test files only.
- Test member/Admin login, direct API calls, request replay and queue workers against the isolated backend.
- Test Telegram webhook behavior with a dedicated test bot; do not use production tokens in test messages or chat.
- Complete Android PWA/device testing and independent review.
- Only then consider a separately authorized production release. PR #12 remains Draft/unmerged; production main and production data remain untouched.
