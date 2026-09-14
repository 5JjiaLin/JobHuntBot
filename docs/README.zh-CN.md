# JobHuntBot

[English](../README.md) · 中文

**把 Codex / Claude Code 从“帮我改一次简历”，变成一个持续运行的完整求职系统。**

v1.1.0 的主流程是：**目标岗位 → 目标行业 → 企业树 → 5 份标杆 JD → 岗位核心能力 → 真实经历 → 正式简历 → 当前岗位 → Web Dashboard**。

![JobHuntBot 仪表盘](assets/dashboard-overview.png)

> 截图来自内置 demo 工作区，企业和岗位均为虚构数据。

## 它做什么

```mermaid
flowchart LR
    A[目标岗位] --> B[目标行业]
    B --> C[企业树]
    C --> D[5份标杆JD]
    D --> E[核心能力]
    E --> F[个人经历]
    F --> G[正式简历]
    G --> H[实时找岗]
    H --> I[Web看板]
```

### 1. 先定位行业，再研究岗位

“产品经理”在互联网、AI/SaaS、电商、游戏、机器人等行业的工作重点并不相同。JobHuntBot 先识别行业分叉，再让用户选择目标行业，避免拿一锅混合 JD 做能力模型。

### 2. 企业树，而不是随机公司清单

企业分为：
- 头部 / 标杆；
- 中厂 / 成长型；
- 小而美 / 早期优质。

分层相对于目标行业判断，不只看员工人数。`assets/company-seeds.md` 只是发现种子，每次必须重新验证。

### 3. 小而美发现器

通过官方资质、区域/行业榜单、创投/产业资本与行业专属来源发现低知名度企业，再验证业务质量、细分地位、成长信号、外部背书和岗位价值。单一融资、榜单或专精特新不能直接升级为“小而美”。

### 4. 5 份头部 Benchmark JD

Phase 1 选 5 家不同标杆企业，各读取 1 份代表性完整官方 JD，做语义归一后提炼 Core / Hard Gates / Common / Plus，而不是机械统计十几份混杂职位。

### 5. 正式简历

个人经历先成为事实母库，再生成证据矩阵、简历和审计。默认模板是 A4、一页优先、黑白、高信息密度、右上预留证件照位置。公共模板只有 XXX 占位，不带真实个人资料。

### 6. 回企业树找当前岗位

简历完成后才问：校招/实习、社招、还是两者都看。随后从 Phase 1 企业树出发进入正确官方入口，浏览器打开当前完整 JD，先过 Hard Gate，再给可解释匹配分。

### 7. 最后自动打开 Dashboard

Phase 5 校验全部 Workspace 数据，启动现有 Dashboard，并在浏览器能力可用时直接打开 localhost 验证岗位展示与状态写回，而不是只给一个 URL。

## 快速开始

```bash
git clone https://github.com/5JjiaLin/JobHuntBot.git
cd JobHuntBot
```

把仓库交给编码助手：

```text
先读取 AGENTS.md 和 SKILL.md，严格按照项目流程，从头带我完成完整求职流程。不要跳阶段。
```

第一轮只需要目标岗位。行业在 Phase 1 确认；招聘类型在简历完成、开始搜具体岗位前才确认。

## 阶段产物

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

其中动态 `02_...核心能力.md` 在行业确认后生成；DOCX 在当前 Agent 有可靠 Word 编辑能力时生成并检查布局。

## 浏览器规则

浏览器能力可用时：Phase 1 Benchmark JD、Phase 4 当前岗位、Phase 5 Dashboard 验证都应由 Agent 主动调用。第三方/搜索摘要只做发现，不替代官方完整页面。

## 隐私

- `workspace/` 已 gitignore；
- Silent Bootstrap 不主动扫描 Downloads/Desktop/Documents/Home；
- 只有用户上传/给路径/Phase 2 明确授权才读取外部个人文件；
- Dashboard 仅绑定 `127.0.0.1`；
- 不绕过登录、验证码、权限或付费墙；
- 公共简历模板不包含姓名、电话、邮箱、学校、照片等私人信息。

## 目录结构

```text
JobHuntBot/
├── AGENTS.md
├── SKILL.md
├── assets/
├── dashboard/
├── references/
├── scripts/
├── templates/
├── docs/
├── evals/
├── examples/
└── workspace/
```

## License

[MIT](../LICENSE)
