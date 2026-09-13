# Demo workspace — fake data only

This directory is **sample data for screenshots, demos and tests**. It is safe
to commit because every company, role, URL and event here is fictional.

- Companies: `Acme AI`, `Northstar Labs`, `NovaTech`, `Orbit`, `Pioneer`, `Lumen Works`
- Roles: fictional postings such as *AI Product Manager Intern*
- URLs: `https://example.com/...` — they intentionally do not resolve

> **No real job postings, no real applications, no personal data.**
> Your real data always lives in `workspace/<target-role-slug>/`, which is
> gitignored and never leaves your machine.

## Try it

```bash
npm run init:workspace -- "AI Product Manager (Demo)"
cp examples/demo-workspace/*.csv workspace/ai-product-manager-demo/
node dashboard/server.js
# open http://localhost:8420/dashboard.html
```

Or, to preview without touching your real workspace, point
`dashboard/config.json` at this folder temporarily:

```json
{ "workspace_dir": "../examples/demo-workspace", "target_role": "AI Product Manager (Demo)" }
```
