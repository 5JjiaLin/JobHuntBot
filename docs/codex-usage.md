# Using JobHuntBot with Codex / Claude Code

JobHuntBot is self-describing: `AGENTS.md` defines operating behavior, `SKILL.md` defines the end-to-end contract, and `references/` contains on-demand playbooks.

## 1. Full workflow

```bash
git clone https://github.com/5JjiaLin/JobHuntBot.git
cd JobHuntBot
```

Prompt:

```text
Read AGENTS.md and SKILL.md.
Run JobHuntBot from the beginning. Do not skip phases.
```

Do not pre-fill a giant questionnaire. The first visible question should only ask for the target role. The agent then identifies relevant industries and asks for one industry choice. Recruitment track is asked only after the resume is ready and live job matching is about to start.

The agent should:
1. identify the role's major industries and confirm one;
2. build a head / growth / small-but-high-quality company tree;
3. open five benchmark official JDs and build the capability model;
4. verify or mine experience into `03_个人经历.md`;
5. build the evidence matrix and standard resume, including DOCX when tooling supports it;
6. ask campus/intern vs experienced vs both;
7. return to the company tree and verify live openings;
8. write jobs to the workspace;
9. start and open the existing dashboard, then verify persistence.

## 2. Silent bootstrap

The agent may inspect repo files, Node and browser availability in the background. Unless blocked, it should not narrate clone status, SHAs, Node versions, loaded files, empty workspaces, or the entire plan.

It must not scan `~/Downloads`, `~/Desktop`, `~/Documents`, Home, or unrelated projects for personal resumes/experience without explicit user input/authorization.

## 3. Browser capability

When browser control is available, the agent should proactively use it for:
- Phase 1: five benchmark official JDs;
- Phase 4: current official job details;
- Phase 5: localhost dashboard verification.

Login/CAPTCHA/permission barriers become `Needs user`; do not bypass them.

## 4. Dashboard only

```bash
npm run init:workspace -- "AI Product Manager"
node dashboard/server.js
# http://localhost:8420/dashboard.html
```

`init:workspace` is idempotent and intentionally does not create the dynamic `02_<行业><岗位>核心能力.md`; the agent creates it after industry confirmation.

## 5. Permissions

Repo read/write, shell execution and browser control are enough for the full flow. Grant repo-scoped access only. The dashboard binds to `127.0.0.1`.

## 6. Common issues

| Symptom | Fix |
|---|---|
| Dashboard empty | Ensure current workspace has `jobs.csv` and `dashboard/config.json` points to it |
| Agent asks a long questionnaire at start | Re-read Silent Bootstrap / Entry rules in `AGENTS.md` |
| Agent searches companies before industry choice | Re-run Phase 1 from `references/role-research.md` |
| Job marked official from search result only | Gate D failed; open the official page or mark it unverified |
| Dashboard URL printed but not opened | With browser capability, Phase 5 is incomplete until it is opened and verified |
