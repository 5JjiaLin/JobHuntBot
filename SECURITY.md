# Security Policy

JobHuntBot is a **local-first** tool: your job-search data stays in
`workspace/` on your machine, and the dashboard server binds to `127.0.0.1`
only. There is no cloud component, no account system and no telemetry.

## Security model

| Boundary | Detail |
|---|---|
| Network | The dashboard listens on `127.0.0.1:8420` only and rejects requests whose `Host` is not a loopback variant. |
| Browser origin | State-changing `POST /api/*` requests with a foreign `Origin` are rejected with 403; no CORS wildcard is ever emitted. |
| Filesystem | Every file the server reads must resolve inside `dashboard/` or the configured workspace; path traversal returns 403. |
| Request size | Bodies over 1 MB are rejected with `413 Payload Too Large`. |
| Job identity | Writes address a job by its stable `job_id`, never by row position. |
| Data at rest | Your workspace is plain CSV on your own disk; nothing is uploaded. |
| Feishu credentials | Owned entirely by the official `lark-cli`; JobHuntBot never stores App Secrets or OAuth tokens. |
| Agent boundaries | The workflow must not bypass logins, CAPTCHAs or paywalls; restricted pages are marked `Needs user`. |

## What is out of scope

- Multi-user or hosted deployments — JobHuntBot is a single-user, local tool.
- Hardening beyond localhost (auth, TLS, rate limiting) — there is no attack
  surface once the server is not reachable from other devices.

## Reporting a vulnerability

Please open a [GitHub Security Advisory](https://github.com/5JjiaLin/JobHuntBot/security/advisories/new)
rather than a public issue.

When reporting, **do not attach**:

- tokens, `.env` files, auth state or cookies;
- real resumes, job pools, application records or any personal data.

A description of the affected boundary (host check, path containment, origin
check, data handling) and a minimal reproduction is enough.

## Data hygiene

If you accidentally committed real job-search data, rotate/retract what you
can and treat it as exposed — rewriting public Git history does not reliably
remove it from caches and forks.
