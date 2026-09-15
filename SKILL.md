---
name: complete-job-search-pipeline
version: "1.1.3"
description: >
  完整求职流水线：从目标岗位与行业定位开始，建立企业树和标杆 JD 能力模型，基于真实经历生成正式简历，
  再验证当前具体岗位并进入持续投递 Dashboard。适用于“帮我完整找工作”“研究岗位后做简历再找职位”
  “建立求职投递看板”等端到端请求。不用于只润色现成简历、只解释单个 JD、单纯面试模拟或泛泛职业规划。
user_invocable: true
metadata:
  maturity: production
---

# Complete Job Search Pipeline

## Owns

把求职变成一个可持续的 5 阶段闭环：

`目标岗位 → 目标行业 → 企业树/JD 能力模型 → 真实经历 → 正式简历 → 当前岗位匹配 → Web Dashboard`

核心原则：**岗位标准来自当前真实 JD；简历内容来自真实经历；岗位推荐来自当前可验证页面；所有状态落在本地 Workspace。**

## Entry

唯一首问是**目标岗位**。用户已给出则直接进入行业识别，不重复询问招聘类型、地区、毕业时间、经历材料等。

接着识别该岗位存在的主要行业，给出简短差异，让用户确认目标行业；已明确行业则跳过。行业确认后即可静默初始化 workspace。

## Browser contract

浏览器可用时：
- Phase 1 的 5 份 Benchmark JD 必须打开官方完整页面验证；
- Phase 4 的具体岗位必须打开当前岗位详情验证；
- Phase 5 必须打开 localhost Dashboard 验证。

搜索摘要/第三方页面只做发现。登录、验证码、权限限制标 `Needs user`，不绕过。

## Workflow

### Phase 1 · Industry, company tree & capability model

读取 [role-research.md](references/role-research.md) 和 [company-tiering.md](references/company-tiering.md)。构建“小而美 / 早期优质”分支时必须读取 [small-company-discovery.md](references/small-company-discovery.md)；中厂候选可参考 [company-seeds.md](assets/company-seeds.md)。

流程：

`目标岗位 → 行业识别 → 用户确认行业 → 三层企业独立发现 → 合并/去重/分层 → 企业树完成 → 5 家头部 Benchmark JD → 核心能力模型`

企业树三层必须分别执行 discovery，不得用一次综合搜索后直接让 Agent 自行分类：
- 头部 / 标杆；
- 中厂 / 成长型；
- 小而美 / 早期优质。

三层企业发现全部执行并写入 `01_企业树.md` 后，才能从头部/标杆层选择 5 家 Benchmark 企业。不得因为已经找到 5 家头部企业或 5 份 JD，就跳过中厂或小而美。

小而美不是“搜小公司”：必须按 `small-company-discovery.md` 完成候选发现、业务真实性核验、公司质量验证、目标岗位价值验证、证据状态/时效判断和 Quality Gate。融资、资质、榜单、VC、媒体报道等单一信号只能用于发现，不能直接升级为“小而美”。

Benchmark：5 家不同头部/标杆企业，各 1 份当前代表性完整官方 JD。能力结论保留来源，不机械数关键词。

输出：
- `01_企业树.md`
- `02_<行业><岗位>核心能力.md`

**企业树完成门槛：**三层均已执行独立发现；候选合并去重；每层有可解释证据；小而美已完成 Quality Gate；数量不足时记录搜索覆盖、排除原因和样本限制。未满足时不得开始 Benchmark JD。

**Gate A：**行业已确认；企业树完成门槛已通过；5 份 Benchmark JD 已实际打开（或明确记录不可得限制）；Core/Hard Gates/Common/Plus 可追溯。否则不进入确定版简历。

### Phase 2 · Experience source & capability-guided mining

读取 [experience-input.md](references/experience-input.md) 和当前 `02_<行业><岗位>核心能力.md`。

Phase 2 使用两层结构：

`通用事实骨架 + 岗位能力定向追问`

- 通用事实骨架负责真实性与跨岗位复用；
- 岗位能力决定哪些经历、哪些证据值得问深一点；
- 岗位能力不得暗示答案，不得为了“补齐 Core”制造经历。

先按当前材料成熟度分流：

1. **无材料**：当前轮只让用户选择 GPT / Codex，然后停止。只有明确选择 Codex 后，下一轮第一问才是 `你之前有过工作经历吗？实习也算。`
2. **部分材料**：先读取，不让用户从头重讲；建立岗位能力证据覆盖图，再一次只补一个高价值事实缺口。
3. **完整事实母库**：不重跑访谈；先做岗位能力 × 已有经历覆盖分析。证据足够则直接通过；仍有高价值缺口才定向补问。

内部可维护：`能力 / 重要性 / 对应经历 / 证据强度0-3 / 缺口 / 风险 / 下一问价值`。明确没有证据的能力记为 `0`，不继续诱导。

GPT 路径需把目标岗位、行业、Core 能力和必要 Hard Gates/Common 填入 [experience-miner-prompt.md](assets/experience-miner-prompt.md) 的岗位定向上下文后再交付。

输出：`03_个人经历.md`。它是跨岗位复用的事实母库，应增量更新，不因切换目标岗位整份改写成 JD 镜像。

**Gate B：**最可能进入简历的重点经历有真实事实闭环；强结果的证据边界和 ownership 已知；当前岗位的强证据、弱证据、明确空白已识别。不是所有 Core 都必须被凑齐。

### Phase 3 · Resume build

读取 [resume-engine.md](references/resume-engine.md)、[resume-format.md](references/resume-format.md)、[evidence-rules.md](references/evidence-rules.md)。

流程：

`核心能力 × 个人经历 → 证据矩阵 → 经历筛选 → STAR/反向 STAR → 标准简历格式 → DOCX → 真实性审计`

默认版式基于 `assets/resume-template.docx`：A4、一页优先、黑白、高信息密度、右上照片位预留。

输出：
- `04_证据矩阵.md`
- `05_简历.md`
- `05_简历.docx`（环境具备可靠 DOCX 能力时）
- `06_简历审计.md`

**Gate C：**高风险事实/数字/权责/AI 贡献问题未处理，不进入实时找岗。

### Phase 4 · Live job matching

简历 Gate C 通过后才确认招聘类型：
1. 校招 / 实习招聘
2. 社招
3. 两者都看

然后读取 [job-matching.md](references/job-matching.md)，从 `01_企业树.md` 出发覆盖三层企业，进入正确的官方招聘入口。

`招聘类型 → 企业树 → 官方岗位搜索 → 完整 JD → Hard Gate → 可解释 0–100 → S/A/B/blocked`

输出：
- `jobs.csv`
- `07_投递优先级.md`

**Gate D：**未打开岗位详情/无法确认来源时，不得标“官方已验证可投”。

### Phase 5 · Workspace & Dashboard

读取 [application-workspace.md](references/application-workspace.md)。Workspace 在 Phase 1 已开始承载产物；Phase 5 负责最终校验、启动并打开 Dashboard。

完成条件：
- Phase 1–4 产物落盘；
- `jobs.csv` 为唯一岗位真源，稳定 `job_id`；
- Dashboard 指向当前 workspace；
- `node dashboard/server.js` 已启动；
- 浏览器已打开 localhost 并验证岗位读取/状态写回/刷新持久化。

之后才处理可选飞书同步。飞书只做 Local → Feishu 镜像。

## Workspace contract

```text
workspace/<target-role-slug>/
├── 01_企业树.md
├── 02_<行业><岗位>核心能力.md
├── 03_个人经历.md
├── 04_证据矩阵.md
├── 05_简历.md
├── 05_简历.docx
├── 06_简历审计.md
├── 07_投递优先级.md
├── jobs.csv
├── application_log.csv
├── follow_up.csv
├── blockers.csv
└── config.json
```

`npm run init:workspace -- "<目标岗位>"` 创建稳定基础文件；动态的 `02_<行业><岗位>核心能力.md` 在行业确认后由 Agent 创建。

## Global rules

始终遵守 [evidence-rules.md](references/evidence-rules.md)：
- 不编经历、技能、数字、岗位、URL、岗位 ID、截止日期或招聘状态；
- Demo ≠ 上线；团队结果 ≠ 个人结果；AI 生成 ≠ 用户本人设计；
- Hard Gate 先于匹配分；
- 企业种子/融资/资质/榜单只是发现信号，不是质量结论；
- 第三方页面只做发现，官网未确认不得升级为官方验证。

## Near-neighbor exclusions

单纯简历润色、单个 JD 解读、面试模拟、谈薪、内推话术不强制跑完整流程。强资质/作品集岗位只执行通用部分并显式说明额外专业规则。
