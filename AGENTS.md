# AGENTS.md — Codex 操作指南

你正在操作 JobHuntBot，一个“目标岗位 → 行业 → 企业树/JD 能力模型 → 真实经历 → 正式简历 → 当前岗位 → Web Dashboard”的本地优先求职系统。

## Start here

1. 先读 `SKILL.md`。
2. 只按当前阶段加载对应 `references/`，不要一次吞掉所有资料。
3. 第一次用户可见交互只确认**目标岗位**；用户已经给过就不要重复问。
4. 目标岗位明确后先识别其主要行业，让用户确认目标行业；若用户已明确行业则直接继续。
5. 本地 `workspace/<target-role-slug>/` 是唯一数据真源；Dashboard 是操作界面；飞书是可选镜像。
6. 现有 `dashboard/` 是产品的一部分：只修 bug，不重做 UI。先读 `docs/dashboard-integration.md`。

## Silent bootstrap

允许在后台完成：打开/clone 仓库、读取 `AGENTS.md`/`SKILL.md`、检查 Node、检查浏览器能力、读取当前阶段 reference。

除非发生真实阻塞，**不要向用户输出**：clone 成功、commit SHA、Node 版本、浏览器状态、加载了哪些文件、workspace 是否为空、完整 Phase 计划或工具日志。

首次可见回复：
- 未知目标岗位 → 只问：`你目前想找什么岗位？`
- 已知目标岗位 → 直接进入行业识别，不重复确认。

### 文件隐私边界

默认操作范围是当前 JobHuntBot 仓库。首次启动和 Phase 1 **不得主动扫描**：
- `~/Downloads`
- `~/Desktop`
- `~/Documents`
- Home 目录
- 其他项目目录

寻找简历、经历、岗位材料。只有用户主动上传/提供明确路径，或 Phase 2 明确授权后才能读取外部个人材料。

## Browser policy

当 **Control the in-app browser** 可用时：
- **Phase 1 Benchmark JD：MUST** 用浏览器打开官方招聘站/官方 ATS 的完整 JD 做验证；
- **Phase 4 当前岗位：MUST** 用浏览器打开具体岗位页验证；
- **Phase 5：MUST** 打开 localhost Dashboard 并验证当前 workspace 已加载、岗位可读、状态写回正常。

Agent 不等待用户逐次提醒调用浏览器。搜索引擎/第三方页面可以做发现，但不能替代官方浏览器验证。

边界：不绕过登录、验证码、权限、付费墙；遇到限制标 `Needs user`。浏览器不可用时继续做可做部分，但不得声称“官方当前 JD / 岗位已验证”。

## Repository shape

```text
Skill + Workspace + Dashboard (+ optional Feishu mirror)
```

- `dashboard/`：现有 UI/交互优先保留。
- `workspace/<slug>/jobs.csv`：岗位唯一真源。
- 所有岗位写操作必须使用稳定 `job_id`，不得使用 CSV 行号。
- CSV / Dashboard 契约见 `docs/dashboard-integration.md`。

## End-to-end behavior

### Entry → industry

先确认目标岗位。随后读取 `references/role-research.md`，识别该岗位存在的主要行业，并给每个行业一句岗位侧重点差异。只问用户选择哪个目标行业；已明确行业则跳过。

行业确认后静默运行：

```bash
npm run init:workspace -- "<目标岗位>"
```

Phase 1 后续文件直接落到该工作区。

### Phase 1 · 行业企业树 + Benchmark JD + 核心能力

读取：
- `references/role-research.md`
- `references/company-tiering.md`
- 小而美分支按需读取 `references/small-company-discovery.md`
- 中厂候选发现可读取 `assets/company-seeds.md`

必须产出：
- `01_企业树.md`
- `02_<行业><岗位>核心能力.md`

企业树包含：头部/标杆、中厂/成长型、小而美/早期优质。种子名单只用于发现，必须实时验证。

能力建模以 **5 家头部/标杆企业 × 各 1 份当前代表性完整官方 JD** 为 Benchmark；未实际打开完整 JD，Gate A 不通过。

### Phase 2 · 个人经历

读取 `references/experience-input.md`。

用户已有完整经历材料：读取核验，只补岗位能力证据缺口。

事实不足时给两个选择：
1. GPT：把 `assets/experience-miner-prompt.md` 完整交给用户，一问一答完成后带回结果；
2. Codex：当前会话苏格拉底式一问一答。

Codex 路径第一问固定：`你之前有过工作经历吗？实习也算。`

必须产出：`03_个人经历.md`。

### Phase 3 · 正式简历

读取：
- `references/resume-engine.md`
- `references/resume-format.md`
- `references/evidence-rules.md`

先做能力 × 经历证据矩阵，再筛经历、组织 STAR/反向 STAR、生成简历并审计。

默认使用 `assets/resume-template.docx` 的版式规范，照片位置留空；不得把模板作者的真实身份信息写入公共模板。

产出：
- `04_证据矩阵.md`
- `05_简历.md`
- `05_简历.docx`（当前环境具备可靠 DOCX 编辑能力时必须生成并做单页/布局检查）
- `06_简历审计.md`

### Phase 4 · 当前具体岗位

简历 Gate C 通过后，才确认招聘类型：

> 接下来开始搜具体可投岗位。你这次主要看哪一类招聘？
> 1. 校招 / 实习招聘
> 2. 社招
> 3. 两者都看
> 回复 1 / 2 / 3 即可。

读取 `references/job-matching.md`，并**从 `01_企业树.md` 开始搜索**，覆盖头部、中厂、小而美。

Hard Gate 先于匹配分。第三方只做发现，官网未确认不得升级为“官方已验证可投”。

产出：
- `jobs.csv`
- `07_投递优先级.md`

### Phase 5 · Workspace + Dashboard

读取 `references/application-workspace.md`。

Phase 5 不是第一次创建资料，而是做最终收口：
1. 确认 Phase 1–4 产物已落盘；
2. 确认 `jobs.csv` / logs / blockers 数据完整；
3. 确认 `dashboard/config.json` 指向当前 workspace；
4. 启动 `node dashboard/server.js`；
5. 浏览器打开 localhost Dashboard；
6. 验证当前岗位展示、稳定 `job_id` 状态更新、刷新后不丢数据；
7. 保持 Dashboard 运行供用户使用。

如果浏览器能力可用，不要只打印 URL 让用户自己打开。

完成本地看板后，再处理可选飞书同步。

## Feishu / Lark CLI branch

只有用户选择飞书同步时读取 `references/feishu-sync.md`。默认使用官方 `lark-cli`；不要求用户把 App Secret / OAuth token 发到聊天，不自行实现 OAuth，不把飞书变成第二真源。认证失败不得阻塞本地流程。

## Data ownership

`workspace/<slug>/jobs.csv` 是唯一岗位真源。若 Dashboard 存在旧岗位池，按 `docs/dashboard-integration.md` 做最小迁移/适配，不长期双写。

## Do the work

能自动创建文件、修改配置、启动服务、打开浏览器就直接完成。每个 Gate 通过后再进入下一阶段；事实不足时标清阻塞点，不补数字、不脑补结果。

## User-facing outputs

用户最终应拿到：企业树、岗位核心能力、个人经历事实母库、证据矩阵、正式简历（Markdown + 可用时 DOCX）、简历审计、当前岗位池、投递优先级、可持续更新且已经打开验证的 Web Dashboard，以及用户主动选择时的飞书镜像。
