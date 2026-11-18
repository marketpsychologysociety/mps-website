# MPS Working SOP — Adaptive Trial, Error, and Continuous Improvement

**Status:** Active working principle  
**Applies to:** MPS v4.8 and subsequent MPS project work  
**Owner direction:** Work iteratively; do not let perfectionism or rigid process prevent measurable progress.

## 1. Core principle

MPS work must never become rigid, overly formal, or stuck waiting for a theoretically perfect state. A controlled **trial-and-error** approach is preferred to indefinite delay. Make useful progress in small, observable steps; test; learn from failures; correct; and repeat.

A known, bounded, reversible imperfection is not automatically a reason to stop. If a step is authorized, its risks are understood, and a safe recovery path exists, proceed and improve it through evidence-based iteration.

## 2. Execution loop

For each meaningful change:

1. Define the smallest useful next step and its expected result.
2. Record the current baseline and identify affected files, data, services, and users.
3. Prefer isolated, reversible changes with a clear rollback path.
4. Execute the authorized change without waiting for unrelated work to become perfect.
5. Run relevant automated tests, static checks, and independent re-checks.
6. Inspect failures and unexpected behavior; fix safe issues directly.
7. Repeat tests after fixes and compare the result with the baseline.
8. Report only what was actually changed and verified, including remaining limitations and the next concrete step.

## 3. Risk-based gates — not perfection gates

- **Low-risk, reversible work:** proceed autonomously when it is within the agreed scope. Do not ask for repeated permission for already-approved work.
- **Medium-risk changes:** use staged rollout, synthetic data, backups, monitoring, and a rollback plan. Continue when those controls are proportionate and available.
- **High-impact or irreversible actions:** obtain explicit owner authorization before execution. This includes destructive data changes, credential or access-control changes, production integrations, live financial/partner actions, and actions that may affect real members.
- A merge authorization applies to the specified pull request and merge only. It does not automatically authorize deployment, production activation, live data mutation, or enabling a feature that remains NO-GO.
- When a requested action is blocked by a mechanical repository state (for example, a Draft PR), perform the minimal administrative step needed to carry out the owner's explicit instruction, then verify the outcome.

## 4. Failure is feedback

- Do not hide, relabel, or minimize failures.
- Distinguish code defects, environment limitations, missing credentials, test-harness limitations, and genuine operational risks.
- Fix safe defects promptly; preserve logs/evidence needed to understand the failure.
- Do not blindly retry operations with ambiguous external outcomes (payments, Telegram messages, invitations, or other non-idempotent effects). Reconcile first or quarantine for review.
- If an experiment fails, keep the useful findings, revert or isolate unsafe changes, and try a smaller or better-controlled approach.

## 5. Communication and handoff

- Keep communication active and direct; raise material findings and decisions early.
- Do not ask the owner to test unfinished work that can still be checked independently.
- Perform check-and-recheck, cross-checks, self-tests, and available browser/device simulations before reporting a completed stage.
- Never claim live integration, production acceptance, security certification, or deployment success based only on mocks or CI.
- Give concise evidence-based status: completed, verified, not yet verified, risks, and next step.

## 6. Safety remains mandatory

The trial-and-error principle is not permission for careless changes. Protect member privacy and live data, preserve backups, use least privilege, keep default-deny controls, and honor explicit NO-GO states. Do not bypass a security, financial, privacy, or operational safeguard merely to make progress appear faster.

**Working maxim:** Move forward safely, learn quickly, correct continuously. Do not wait for perfection when a controlled next step is ready.
