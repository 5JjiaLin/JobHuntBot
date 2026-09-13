# JobHuntBot Core

把“找工作”从一次聊天，变成一个可持续推进的求职系统。

**目标岗位 → 真实 JD 能力建模 → 经历事实库 → 定制简历 → 当前岗位匹配 → 本地投递工作区 → Web Dashboard → 可选飞书同步**

> 本包是 **Core v3.2.0**，故意不包含 Web Dashboard 源码。用途是：把它交给 Codex，与用户当前已经修改完成的 `dashboard/` 源码合并，再一起上传 GitHub。

## 最简单的使用方式

把本 Core 包和现有 JobHuntBot 项目一起交给 Codex，并让它：

```text
保留当前已经修改完成的 dashboard/ 源码，不要重做 UI。
把 Core 包合并到仓库根目录，先读 AGENTS.md 和 SKILL.md，再按 docs/dashboard-integration.md 对齐 Dashboard 与 workspace 数据契约。
检查完成后再上传 GitHub。
```

完整合并 Prompt 见 `docs/codex-usage.md`。

## 它做什么

1. 根据目标岗位建立行业大厂 / 中厂 / 小厂公司池。
2. 使用真实完整 JD 提炼 Core 能力、Hard Gates、Common Skills、Plus。
3. 没有经历文件时，提供苏格拉底式经历深挖 Prompt，生成《个人经历.md》。
4. 用证据矩阵 + STAR / 反向 STAR 生成定制简历并审计真实性。
5. 使用 **Control the in-app browser** 回到公司池找当前真实岗位。
6. Hard Gate 先判断，再做 0–100 匹配评分和 S/A/B 排序。
7. 把岗位写入本地 Workspace，并与现有 Web Dashboard 对接。
8. 可选把本地岗位池单向同步到飞书多维表格。

## 为什么优先使用浏览器

很多招聘站是 SPA / JavaScript 动态列表，需要搜索、点击、登录态才能看到完整 JD。`Control the in-app browser` 可以像正常用户一样操作浏览器，提高当前岗位核验成功率。

边界：登录、验证码、权限限制不绕过，统一标记 `Needs user`。

## 与现有 Web Dashboard 合并

本包没有 `dashboard/` 目录。

Codex 必须把用户当前已经改好的 Dashboard 当作 UI 真源：
- 不覆盖；
- 不回滚；
- 不重新生成；
- 不用旧 UI 说明替换当前实现。

真正要解决的是：

```text
Skill 找到岗位
→ workspace/<role>/jobs.csv
→ 当前 Dashboard 读取同一份数据
→ 用户在 Dashboard 更新状态
→ 状态写回同一工作区
→ 可选同步飞书
```

详细规则：[`docs/dashboard-integration.md`](docs/dashboard-integration.md)。

## 飞书同步

本地数据始终是唯一真源。飞书只作为手机查看 / 分享协作镜像。

飞书接入使用官方 [`larksuite/cli`](https://github.com/larksuite/cli)，不要求用户手工把 App ID / App Secret 填进项目。

流程：

```text
检测 / 安装 lark-cli
→ 检查已有登录态
→ 必要时执行官方 config init
→ 发起 Base 域 OAuth 授权
→ 用户只在浏览器确认一次
→ Codex 完成 device-code 登录
→ 创建或连接飞书多维表格
→ 按 job_id 单向 Upsert
```

详细规则：[`references/feishu-sync.md`](references/feishu-sync.md)。

## 初始化工作区

```bash
npm run init:workspace -- "AI 产品经理"
```

会创建：

```text
workspace/ai-产品经理/
├── 01_role_market.md
├── 02_evidence_matrix.md
├── 03_resume.md
├── 04_resume_audit.md
├── jobs.csv
├── 06_application_priority.md
├── application_log.csv
├── follow_up.csv
├── blockers.csv
└── config.json
```

脚本不会创建或覆盖 Dashboard 源码。

## Core 包结构

```text
.
├── AGENTS.md
├── SKILL.md
├── README.md
├── manifest.json
├── package.json
├── .gitignore
├── agents/
│   └── interface.yaml
├── assets/
│   └── experience-miner-prompt.md
├── references/
│   ├── role-research.md
│   ├── experience-input.md
│   ├── resume-engine.md
│   ├── job-matching.md
│   ├── evidence-rules.md
│   ├── application-workspace.md
│   └── feishu-sync.md
├── docs/
│   ├── codex-usage.md
│   └── dashboard-integration.md
├── evals/
└── scripts/
    └── init-workspace.js
```

## 本地运行（合并后）

本仓库合并后已经包含 `dashboard/`。本地启动看板：

```bash
# 1) 初始化工作区（首次，会把空表写入 workspace/<目标岗位>/）
npm run init:workspace -- "你的目标岗位"

# 2) 启动零依赖静态服务
node dashboard/server.js
# 打开 http://localhost:8420/dashboard.html
```

- 看板只读取 `workspace/<目标岗位>/jobs.csv` 作为唯一真源；
- 首次启动若工作区不存在，`server.js` 会自动创建空表，不会写坏已有数据；
- 服务仅绑定 `127.0.0.1`，不上网、不暴露 token，本地优先。

推荐流程：先跑完整 Skill（研究岗位 → 简历 → 找岗），岗位写入工作区后，
打开看板做持续投递与状态推进；飞书为可选镜像。

## 数据与隐私

- 用户真实 `workspace/` 默认不提交 Git。
- 飞书凭据由官方 `lark-cli` 管理，JobHuntBot 不保存 App Secret / OAuth token。
- 不要把内部 JD、未公开公司资料或用户私有求职数据提交到公开仓库。
- 合并 GitHub 前必须检查 Dashboard 目录是否包含真实投递数据、日志、备份和凭据。

## 适用范围

优先适用于产品、AI 产品、运营、市场/增长、商务/销售、电商、数据/商业分析、工程、咨询/策略、项目管理等多数结果型岗位。

科研、医疗、法律、纯艺术等强资质/作品集岗位可以使用通用流程，但需要额外专业规则。
