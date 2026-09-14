---
name: complete-job-search-pipeline
version: "1.0.0"
description: >
  完整求职流水线：围绕目标岗位研究真实 JD、提炼岗位核心能力、从真实经历生成并审计定制简历、
  搜索当前可投岗位并建立持续投递工作区。覆盖多数实习、校招和社招岗位，也用于“帮我完整找工作”
  “研究岗位后做简历再找职位”“建立求职投递看板”一类请求。不用于只润色现成简历、只解释单个 JD、
  单纯面试模拟或泛泛职业规划。
user_invocable: true
metadata:
  maturity: production
---

# Complete Job Search Pipeline

## Owns

把求职变成一个可持续推进的 5 阶段闭环：

`目标岗位 → 市场/JD 建模 → 真实经历 → 定制简历 → 当前岗位匹配 → 投递工作台`

核心原则：**岗位要求来自当前真实 JD，简历内容来自真实经历，岗位推荐来自当前可验证页面，投递状态落在一个持续更新的工作区。**

## Required browser capability

阶段 1 和阶段 4 优先使用 **Control the in-app browser**。

原因：招聘官网大量使用 SPA、JavaScript 动态加载、登录态、交互式岗位搜索和浏览器访问校验。真实浏览器能像用户一样打开、点击、搜索和读取渲染后的 JD，通常比只做 HTTP 抓取更可靠。

规则：
- 搜索摘要只用于发现线索，不能代替完整 JD；
- 优先公司官方招聘站 / 官方 ATS；
- 遇到登录、验证码、权限或访问限制时标记 `Needs user`，不得绕过限制；
- 浏览器能力不可用时，不得用旧知识冒充“当前岗位已验证”。

具体研究规则见 [role-research.md](references/role-research.md) 与 [job-matching.md](references/job-matching.md)。

## Entry

先确认唯一核心输入：**目标岗位**。

若用户已提供，直接开始，不重复询问。求职类型、地区、毕业时间等仅在会改变搜索与资格判断时再问一个必要问题。

## Workflow

### Phase 1 · Role market model

读取 [role-research.md](references/role-research.md)。

必须：
- 建立目标行业大厂 / 中厂 / 小厂公司池；
- 跨公司、跨梯队读取多个同类完整 JD；
- 输出岗位定义、5–8 项 Core 能力、Hard Gates、Common Skills、Plus 与梯队差异；
- 所有关键结论保留 JD 证据和链接。

**Gate A：**能力模型没有足够真实 JD 证据，不进入确定版简历。

### Phase 2 · Experience source

读取 [experience-input.md](references/experience-input.md)。

- 用户已有《个人经历.md》、旧简历、项目材料：读取并核验。
- 用户没有足够经历事实：读取 [experience-miner-prompt.md](assets/experience-miner-prompt.md)，把 Prompt 完整交给用户，让其在 GPT 中完成经历深挖并带回 MD 文件。

**Gate B：**没有可核验经历事实，不生成简历。

### Phase 3 · Resume build

读取 [resume-engine.md](references/resume-engine.md) 与 [evidence-rules.md](references/evidence-rules.md)。

必须先建立“岗位能力 × 经历证据矩阵”，再筛项目、组织 STAR / 反向 STAR、生成简历并做事实/数字/权责/AI 贡献审计。

**Gate C：**高风险真实性问题未处理，不进入实时找岗。

### Phase 4 · Live job matching

读取 [job-matching.md](references/job-matching.md)。

回到 Phase 1 公司池逐家查当前岗位：

`官方站搜索 → 浏览器打开完整 JD → Hard Gate → 0–100 可解释评分 → S/A/B/blocked → 写入工作区`

**Gate D：**未打开岗位详情或无法确认来源时，不得标“官方已验证可投”。

### Phase 5 · Application workspace

读取 [application-workspace.md](references/application-workspace.md)。

把阶段 4 的岗位写入 `workspace/<target-role-slug>/`，持续记录：
- 今日行动；
- 岗位池；
- 投递状态；
- 面试/测评日程；
- 阻塞项；
- Offer / Rejected / Closed。

本地工作区数据是唯一真源。

启动仓库自带的本地看板：`node dashboard/server.js`。看板读取 `dashboard/config.json` 指向的工作区，
若未初始化会提示先运行 `npm run init:workspace -- "<目标岗位>"`。
看板 UI 与交互是产品的一部分：只修 bug，不重做。数据契约定义见 [dashboard-integration.md](docs/dashboard-integration.md)。

完成本地工作台后，只问一个可选分支：**是否需要同步到飞书多维表格用于手机查看/共享？（可选，由 AI Agent 调用官方 lark-cli 完成，Dashboard 无内置飞书按钮）**

若需要，读取 [feishu-sync.md](references/feishu-sync.md)。飞书默认通过官方 `larksuite/cli` 连接：先复用已有登录态，未授权时由 Agent 发起 `base` 域 OAuth split-flow，让用户只在浏览器完成一次授权，再由 Agent 完成 device-code 登录。飞书仅做 Local → Feishu 单向 Upsert 镜像，不作为第二真源；JobHuntBot 不接收或保存 App Secret / OAuth token。

## Workspace contract

每个目标岗位使用一个目录：

```text
workspace/<target-role-slug>/
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

初始化工作区优先运行：

```bash
npm run init:workspace -- "<目标岗位>"
```

本包附带零依赖初始化脚本。若仓库已存在 `dashboard/config.json`，脚本会在不覆盖其他配置的前提下尝试写入 `workspace_dir` 与 `target_role`；若 Dashboard 使用别的配置方式，则按 [dashboard-integration.md](docs/dashboard-integration.md) 对接。

## Global rules

始终遵守 [evidence-rules.md](references/evidence-rules.md)：
- 不编经历、技能、数字、岗位、URL、岗位 ID、截止日期或招聘状态；
- Demo ≠ 上线；团队结果 ≠ 个人结果；AI 生成 ≠ 用户本人设计；
- Hard Gate 先于匹配分；
- 公司名气不参与匹配分；
- 第三方页面只做发现，官网未确认不得升级为“官方已验证”。

## Dashboard contract

The repository ships its own dashboard (`dashboard/`). When working on it:

- the existing UI and interactions are the product — fix bugs in place, do not redesign;
- reads and writes go through `workspace/<target-role-slug>/` only; never create a second writable job pool;
- every write identifies the job by its stable `job_id`, never by row position;
- after any change, verify the flow in a real browser before declaring it done.

The full data contract is in [dashboard-integration.md](docs/dashboard-integration.md).

## Completion

完整流程只有同时满足以下条件才算完成：
1. Core 能力模型有跨公司真实 JD 证据；
2. 简历核心能力词都有真实经历证据或明确缺口；
3. 简历审计不存在未处理的高风险夸大；
4. 最终岗位逐条有来源、验证状态、匹配理由和风险；
5. S/A/B 有官方单岗页或明确标注的官方登录/SPA 入口；
6. 当前岗位已经写入工作区；若仓库有 Dashboard，则 Dashboard 能读取并推进这些岗位；
7. 飞书若启用，使用官方 `lark-cli` 用户授权，同一 `job_id` 二次同步不产生重复记录，且本地不保存 OAuth token / App Secret。

## Near-neighbor exclusions

- 单纯简历润色：不强制跑完整流程。
- 单个 JD 解读：直接解释该 JD。
- 面试模拟、谈薪、内推话术：不属于主流程。
- 医疗、法律、科研、纯艺术等强资质/作品集岗位：只做通用部分，并明确需要额外专业规则。
