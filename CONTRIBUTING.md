# Contributing

Thanks for considering a contribution. JobHuntBot is intentionally small and
local-first — please keep changes in that spirit.

## Ground rules

- **Never commit real job-search data.** No real job pools, applications,
  resumes, notes, company contacts or personal details. Demo content belongs in
  `examples/demo-workspace/` and must use fictional companies.
- **Never commit secrets** — tokens, `.env` files, auth state, cookies.
- **Do not add heavy dependencies.** The dashboard server is deliberately
  zero-dependency Node; the workflow is deliberately plain CSV.
- **Do not redesign the dashboard UI.** Fix bugs and improve copy; if a change
  is visible, include a screenshot in the PR.
- **Do not bypass site restrictions.** Logins, CAPTCHAs and paywalls are marked
  `Needs user` by design.

## Workflow

1. Fork the repository and create a branch from `main`.
2. Keep the change focused; one logical change per PR.
3. Run the checks below before opening the PR.

## Checks

| Change type | Required |
|---|---|
| Any | `npm run test:security` passes |
| Dashboard UI | Screenshot before/after, verified in a real browser |
| Skill / workflow behaviour | Update the matching playbook in `references/` and the cases in `evals/` |
| CSV schema | Update `dashboard/workspace-schema.js` **and** `templates/workspace/*.csv` together |
| Documentation | All relative links still resolve |

## Commit messages

Short imperative subject line, e.g. `Fix blocker card binding by job_id`.
