# Using JobHuntBot with Codex / Claude Code

JobHuntBot is designed to be driven by an AI coding agent. The repository is
self-describing: `AGENTS.md` tells the agent how to behave, `SKILL.md` is the
end-to-end workflow, and `references/` holds one playbook per phase.

## 1. Full workflow (recommended)

```bash
git clone https://github.com/5JjiaLin/JobHuntBot.git
cd JobHuntBot
```

Open the folder in your agent and prompt:

```text
Read AGENTS.md and SKILL.md.
Help me run JobHuntBot for "<target role>".
```

Replace `<target role>` with a real one, e.g. `"AI Product Manager"` or
`"前端开发工程师"`.

The agent will:

1. Build a company pool and model the role from real JDs.
2. Check your experience material (or hand you a mining prompt if you have none).
3. Produce a tailored resume plus a truthfulness audit.
4. Find and verify current openings in a browser.
5. Scaffold `workspace/<target-role-slug>/` and write the jobs there.
6. Start the dashboard so you can run applications day to day.

## 2. Dashboard only

No agent required:

```bash
npm run init:workspace -- "AI Product Manager"
node dashboard/server.js
# open http://localhost:8420/dashboard.html
```

## 3. Permissions the agent may ask for

| Permission | Why |
|---|---|
| Read / write files in the repo | Workspace CSVs, resumes, notes |
| Run shell commands | `npm run init:workspace`, `node dashboard/server.js` |
| Control the browser | Open careers sites and read complete, rendered JDs |

Grant repo-scoped access only. The dashboard server binds to `127.0.0.1` and
never exposes your data to the network.

## 4. Practical tips

- One workspace per target role: `npm run init:workspace -- "<role>"` is safe to
  re-run; it never overwrites existing data.
- Let the agent finish a phase before jumping ahead — the workflow has explicit
  gates (e.g. no resume without verified experience).
- Ask the agent to re-verify any job before you apply; postings expire.
- Keep `workspace/` out of any commit. It is gitignored by default.

## 5. Common issues

| Symptom | Fix |
|---|---|
| Dashboard shows empty tables | Run `npm run init:workspace -- "<role>"`, then restart the server |
| "Workspace not initialised" on a write | Same as above — `dashboard/config.json` is missing or empty |
| Server refuses to start: port in use | Another instance is running on 8420; stop it first |
| Agent cannot open a posting (login wall) | That is by design — it marks the job `Needs user` instead of bypassing |
