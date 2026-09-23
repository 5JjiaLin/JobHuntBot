# JobHuntBot

**Turn your AI coding agent into a persistent job-search system — from industry research and benchmark JDs to evidence-based resumes, live job matching, and application tracking.**

把 Codex / Claude Code 从“帮我改一次简历”，变成一个持续运行的完整求职 Agent Harness。

## What is JobHuntBot?

JobHuntBot is a job-search Agent Harness designed for AI coding agents.

It turns the job search process into a structured workflow:

1. Analyze target role requirements
2. Research industries and companies
3. Build company trees (head / growth / small-but-high-quality)
4. Extract capability models from benchmark JDs
5. Mine real experience evidence
6. Generate tailored resumes
7. Verify live jobs and track applications

The core idea is simple: **resume is not written first. It is derived from market requirements and your proven evidence.**

## How to Use

### Quick Start

Clone the repository:

```bash
git clone https://github.com/5JjiaLin/JobHuntBot.git
cd JobHuntBot
```

Then load this project into Codex / Claude Code and copy the following prompt:

```text
使用这个项目作为我的求职 Agent Harness：

https://github.com/5JjiaLin/JobHuntBot

请先读取项目中的 AGENTS.md 和 SKILL.md，理解完整工作流程。

然后严格按照项目定义的 Phase 流程引导我完成求职。

不要跳过阶段，不要直接生成简历。
从 Phase 1 开始，先询问我的目标岗位。
```

The agent should first load the workflow definition, then execute each Phase step by step.

## Workflow

| Phase | Process | Output |
|---|---|---|
| Phase 1 | Role → Industry → Company Tree → Benchmark JDs → Capability Model | 企业树、行业岗位核心能力 |
| Phase 2 | Real experience discovery and verification | 个人经历 |
| Phase 3 | Evidence matrix → STAR → Resume generation → Truth audit | 证据矩阵、简历 |
| Phase 4 | Recruitment track → Live job verification → Application priority | 投递清单 |
| Phase 5 | Workspace initialization → Dashboard | 求职 Dashboard |

## Core Features

### Industry-aware Role Intelligence

先确定岗位所在行业，再研究该行业企业和岗位要求，而不是从一份 JD 开始。

### Company Tree

企业按照目标行业和岗位划分：

- Head / benchmark companies
- Growth / mid-size companies
- Small-but-high-quality companies

### Small-but-high-quality Discovery

通过：

- 官方资质认证
- 行业榜单
- 创投/产业数据库
- 业务真实性验证

寻找低知名度但具备竞争力的企业。

### Evidence-based Resume

能力模型 → 真实经历 → 证据矩阵 → STAR → 简历。

避免 AI 编造经历，只优化真实能力表达。

### Local Workspace Dashboard

所有求职数据保存在本地 workspace，支持岗位跟踪和投递管理。

## Project Structure

```text
JobHuntBot/
├── AGENTS.md
├── SKILL.md
├── references/
├── assets/
├── dashboard/
├── templates/
├── scripts/
└── workspace/
```

## Privacy

- workspace 默认不上传 GitHub。
- 不会自动扫描用户个人文件。
- 个人经历只在用户授权后读取。
- 不绕过登录、验证码、权限限制。

## License

MIT
