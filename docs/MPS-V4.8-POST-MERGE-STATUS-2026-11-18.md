# MPS v4.8 — Post-Merge Status and Next Acceptance Gates

**Assessment date:** 2026-11-18  
**Repository:** `marketpsychologysociety/mps-website`  
**Main checkpoint:** `592375851c54582346148c882279514e57fb503f`  
**Purpose:** Supersede older status snapshots that still describe PR #12 as open/unmerged. This is a repository/source review, not a production acceptance certificate.

## 1. Repository state — verified

- PR #12 (MPS v4.8 workbench) is **MERGED**. Merge commit: `5149abe5221daeb8afc78cf3572dca95a2c37600`.
- PR #14 (adaptive trial-and-error working SOP) is **MERGED**. Merge commit: `592375851c54582346148c882279514e57fb503f`.
- The `main` branch was read back after both merges and points to `592375851c54582346148c882279514e57fb503f`.
- PR #12 exact-head validation run #2947 completed successfully (82/82 workflow steps, per the recorded run evidence).
- PR #14 exact-head PWA validation run [#2949](https://github.com/marketpsychologysociety/mps-website/actions/runs/44226996245) completed successfully. It validated the documentation commit and repository PWA workflow; it is not a live Apps Script or production acceptance test.

## 2. Meaning of the merges

The two merges put the workbench and the approved working SOP into the Git `main` branch. They do **not** prove or authorize:
- GitHub Pages publication state or production hosting cutover;
- Apps Script deployment or active deployment version;
- live Google Sheets, ScriptLock, Script Properties, Drive ACL, or trigger behavior;
- Telegram webhook configuration, test-bot delivery, or production notification delivery;
- Exness API connectivity, partner account mapping, or live rebate processing;
- live member-data migration, data deletion, or other production mutation;
- enabling `publicCenter` or official winner-draw functionality.

The official winner draw remains **BLOCKED / NO-GO**. MPS Lucky Roulette remains **SIMULATION ONLY**. Public Center remains disabled/default-deny until its separate isolated runtime and operational acceptance gates pass.

## 3. Current repository configuration observations

Read-only inspection of `config.js` on `main` found:
- `previewMode: true`;
- `webApp.endpoint: ""`;
- `form.endpoint: ""`;
- `depositForm.endpoint: ""`;
- `publicCenter.enabled: false`;
- Exness referral URL is present as public routing information; rebate integration remains a separate blueprint/operational gate.

Therefore the checked-in website configuration is still in preview/disconnected-form mode. Do not describe registration or deposit forms as connected to a live backend based on this repository snapshot.

Read-only inspection also found that `google-apps-script-v2/Code.gs` documents an older Web App setup using public access and contains a public `doPost` registration/deposit handler. This is a **source-level legacy observation only**. The active Apps Script deployment/version and whether that source is currently deployed are unknown; no live endpoint was called and no deployment was inspected. Do not claim this legacy file is active or vulnerable in production without mapping it to the actual deployment. Before any future activation, independently identify the deployed script/version and verify authentication, authorization, input controls, Drive permissions, and notification reconciliation.

The newer isolated candidate lives at `candidates/Code.gs` and `candidates/Index.html`; its repository tests use synthetic/mocked services. Those tests do not substitute for isolated real Apps Script + Sheets + ScriptLock + trigger acceptance.

## 4. Remaining acceptance gates — still open

1. **Isolated Apps Script runtime:** deploy the candidate only into a new isolated project with synthetic data; verify real Sheets persistence, ScriptLock contention, interruption/replay, quotas, and trigger behavior.
2. **Drive authorization/privacy:** verify real folder/file ACL inheritance, direct file URLs, direct API routes, member/Admin session checks, and cross-member isolation.
3. **Telegram:** use a separate test bot/group to verify webhook ingress, durable journal persistence, replay, all notification classes, and ambiguous send reconciliation. Never blindly retry a send with an unknown outcome.
4. **Android/PWA:** perform actual physical Android install/navigation/cache/offline/resume checks; Chromium CI is not physical-device acceptance.
5. **Independent security/operational review:** review the complete merged diff and real dependency boundaries; record findings and remediation.
6. **Backup/restore:** produce a real off-site backup and independently verified restore drill, not only synthetic contracts.
7. **Market Pulse:** wait for the user's final replacement dataset handoff, then validate provenance, coverage, timestamps, M5 intervals, WIB mapping, and the explicit Binance Spot `PAXGUSDT` gold-proxy disclosure. Never call it a broker Forex XAUUSD feed.
8. **Exness Partner/IB and rebate:** keep referral/QR destinations documented; verify broker-side product, permissions, authentication, account mapping, and actual rebate reporting before describing live integration.
9. **Owner release decision:** complete diff review and obtain explicit release authorization before production deployment or activation.

## 5. Working method

Apply the merged MPS Adaptive Trial-and-Error SOP:
- move forward in small, observable, reversible steps;
- test, learn, correct, and repeat rather than waiting for theoretical perfection;
- proceed autonomously on approved low-risk work;
- stage and verify medium-risk work;
- obtain explicit owner approval for high-impact or irreversible actions;
- report evidence and limitations honestly.

**Current decision:** repository integration is merged; operational activation remains **NO-GO / NOT YET ACCEPTED**. No production deployment or live service mutation is recorded by this assessment.
