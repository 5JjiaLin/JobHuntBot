# AGENTS.md — Codex 操作指南

你正在操作 JobHuntBot，一个“研究岗位 → 深挖经历 → 生成简历 → 找当前岗位 → 持续投递”的本地优先求职系统。

## Start here

1. 先读 `SKILL.md`。
2. 只按当前阶段加载对应 `references/`，不要一次吞掉所有资料。
3. 第一次和用户交互只确认目标岗位；用户已经给过就不要重复问。
4. 实时 JD 研究与找岗优先使用 **Control the in-app browser**。
5. 本地工作区是数据真源；Web Dashboard 是操作界面；飞书是流程完成后的可选镜像。
6. **如果当前仓库已经有用户修改完成的 Dashboard，绝对不要用模板或旧设计覆盖它。**先读 `docs/dashboard-integration.md` 再做衔接。

## Repository shape

JobHuntBot is a **complete project**, not a partial package:

```text
Skill + Workspace + Dashboard (+ optional Feishu mirror)
```

- `dashboard/` is a first-class part of this repository. Treat it as the product it is: fix bugs in place, never regenerate or redesign it.
- `workspace/<target-role-slug>/` is the single source of truth; the dashboard reads it and writes back to it.
- Every job carries a stable `job_id` — write operations must target it, never a row position.
- The exact CSV contract between the pipeline and the dashboard lives in `docs/dashboard-integration.md`.

## Why browser-first

招聘官网常见 SPA、JavaScript 动态加载、登录态、搜索筛选和正常浏览器访问校验。Control the in-app browser 能模拟用户打开、点击、搜索并读取渲染后的页面，比只做搜索摘要 / HTTP 抓取更适合当前职位核验。

但：
- 不绕过登录、验证码、权限、付费墙或访问限制；
- 遇到限制写 `Needs user`；
- 搜索摘要不是 JD 证据；
- 不可用浏览器时，不得假装已验证当前岗位。

## End-to-end behavior

### Phase 1
读取 `references/role-research.md`，建立公司池和真实 JD 能力模型。

### Phase 2
读取用户经历文件。没有时，完整给出 `assets/experience-miner-prompt.md`，让用户去 GPT 完成深挖并带回《个人经历.md》。不要凭聊天印象直接编简历。

### Phase 3
读取 `references/resume-engine.md` 与 `references/evidence-rules.md`，先做证据矩阵，再生成和审计简历。

### Phase 4
读取 `references/job-matching.md`，回到公司池找当前职位。Hard Gate 先于匹配分。

### Phase 5
读取 `references/application-workspace.md`：
- 优先运行 `npm run init:workspace -- "<目标岗位>"` 创建 `workspace/<slug>/`；
- 把最终岗位写入该工作区 `jobs.csv`；
- 确认 `application_log.csv`、`follow_up.csv`、`blockers.csv` 已存在；
- 如果仓库已有 Dashboard，读取 `docs/dashboard-integration.md`，把它接到当前工作区；
- 启动现有 Dashboard；
- 使用浏览器实际检查看板能读取并推进岗位。

完成本地看板后，再问一个可选分支：用户是否需要飞书多维表格同步。

## Feishu / Lark CLI branch

只有用户选择飞书同步时才读取 `references/feishu-sync.md`。

### 禁止旧方案

禁止把以下流程作为默认路径：
- 让用户手工创建飞书自建应用；
- 让用户复制 App ID / App Secret 到聊天或 `.env`；
- JobHuntBot 自己维护 access token / refresh token；
- 自己实现 OAuth；
- 自己手写飞书 HTTP API 作为主同步实现。

### 默认使用官方 lark-cli

1. 检查 `lark-cli` 是否存在；不存在时安装：

```bash
npx @larksuite/cli@latest install
```

2. 先复用当前登录态：

```bash
lark-cli auth status --json --verify
```

3. CLI 尚未配置时，执行：

```bash
lark-cli config init --new
```

把官方流程返回的浏览器 URL 交给用户完成，不要求用户把秘密值发回聊天。

4. 用户身份尚未获得 Base 权限时，使用 split-flow：

```bash
lark-cli auth login --domain base --no-wait --json
```

提取 `verification_url` 与 `device_code`。本轮把 URL 给用户并停止，等待用户回复“已授权”。

5. 用户确认后，由你亲自完成：

```bash
lark-cli auth login --device-code <device_code>
lark-cli auth status --json --verify
```

不要让用户自己执行 device-code 命令。

6. Base 操作默认显式使用 `--as user`。

7. 用户给已有 Base URL 时用 `lark-cli base +url-resolve` 解析；没有时默认创建 `JobHuntBot · <目标岗位>`。

8. 同步使用稳定 `job_id` 做 Local → Feishu Upsert；飞书只是镜像。

9. 认证凭据由 lark-cli 管理。JobHuntBot 只允许保存 `base_token`、`table_id`、Base URL 等非秘密映射，不保存 access token / refresh token / App Secret / device code。

10. 如果 CLI 报 `missing_scope`，按错误返回补最小 scope；不要无脑申请全权限。

11. 飞书失败时报告问题并保留本地流程，不得阻塞投递。

## Data ownership

目标状态是：

```text
workspace/<slug>/jobs.csv
```

作为唯一岗位真源。

如果现有 Dashboard 仍直接读 `dashboard/job_pool.csv`，不能简单复制两份后长期双写。按 `docs/dashboard-integration.md`：先备份，评估最低风险方案，再迁移或做单一适配层。

同一岗位必须用稳定 `job_id` Upsert。不要因为 Skill 重跑就重复加一条。

## Do the work

如果 Codex 能直接创建文件、修改配置、启动服务、打开浏览器，就直接做，不把可自动完成的步骤甩回用户。

每个 Gate 通过后再进入下一阶段；阻塞时把阻塞点写清楚，而不是补事实。

需要使用 CLI 时，优先读取当前安装版本的 `--help` / 已安装 Skill，再执行真实命令，不根据旧记忆猜参数。

## User-facing outputs

用户最终应该拿到：
- 岗位市场 / 能力模型；
- 证据矩阵；
- 定制简历；
- 简历审计；
- 当前岗位池 + 投递优先级；
- 可以持续更新的 Web Dashboard（若目标项目已包含看板源码）；
- 可选的飞书多维表格镜像。
