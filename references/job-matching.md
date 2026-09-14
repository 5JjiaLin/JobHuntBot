# Job Matching｜当前岗位验证、评分与投递优先级

本阶段只在简历通过 Gate C 后执行。

目标：回到 Phase 1 公司池，查找**当前真实可投岗位**，用同一套能力模型和简历证据做可解释匹配，并直接写入投递工作区。

---

## 0. 招聘类型确认（Recruitment Track Selection）

在开始任何具体岗位搜索之前，**必须先确认招聘类型**。不要在 Phase 1 问这个问题——它主要影响具体岗位入口、资格 Hard Gate 与官方渠道，应放在“简历完成 → 具体岗位搜索”之间。

向用户确认：

> “接下来开始搜具体可投岗位。你这次主要看哪一类招聘？
> 1. 校招 / 实习招聘
> 2. 社招
> 3. 两者都看
> 回复 1 / 2 / 3 即可。”

根据回答进入对应官方招聘渠道。公司同时有校招站与社招站时，必须按招聘类型进入正确入口；第三方页面（Boss / LinkedIn / Indeed / 牛客 / 实习僧 / 搜索引擎缓存）只做发现，官网未确认不得升级为“官方已验证可投”。

### 0.1 校招 / 实习招聘（Campus / Internship）

公司池搜索时优先官方入口关键词：

- 校园招聘 / Campus / Graduate / New Grad / Early Career / Internship / 实习生 / 应届生

重点 Hard Gate：

- 毕业年份 / 届别；
- 在校身份 / 学籍；
- 实习资格；
- 工作地点；
- 开始时间；
- 实习时长；
- 转正条件（若 JD 明确）。

不要把社招职位混进主推荐池。

### 0.2 社招（Experienced）

优先官方入口关键词：

- 社会招聘 / Experienced Hire / Professional / Experienced / General Careers

重点 Hard Gate：

- 工作年限；
- 必须经验 / 岗位硬要求；
- 行业经验；
- 管理经验；
- 地区；
- 工作授权；
- 学历 / 证书（若为硬要求）。

不要因为标题相似就推荐校招岗位。

### 0.3 两者都看（Both）

必须**分别搜索**两套渠道：

- 校招 / 实习渠道；
- 社招渠道。

不得混成一个搜索过程。结果可以统一写入 `jobs.csv`，但必须保留以下字段以区分招聘体系：

```text
job_type          # campus / internship / experienced
convert_track     # 校招/实习 或 社招
source            # 官方入口来源
verification_status
hard_gate
```

让用户始终清楚每个岗位属于哪个招聘体系。

---

## 1. 从简历提取 3–5 个撞岗信号

每个信号必须是“能力 + 场景 + 证据”，例如：

```text
AI 内容生产 Workflow + 一致性/效率结果
跨境电商场景 + 用户/业务理解
Agent / AI Coding 原型 + 验收闭环
```

同时列出：Core 已覆盖项、弱证据项、Hard Gate 风险、求职条件。

## 2. Browser-first 搜索

优先使用 **Control the in-app browser**，严格覆盖 `01_role_market.md` 的大厂 / 中厂 / 小厂公司池。

逐家公司：
1. 打开官方招聘站；
2. 使用站内搜索框或筛选器搜索目标岗位及同义词；
3. 打开单岗位页面；
4. 读取渲染后的完整 JD；
5. 确认公司、岗位、地点、类型、职责、要求、页面状态；
6. 获取当前浏览器 URL；
7. 记录验证时间。

浏览器优先的理由：招聘官网经常由 SPA / JS 动态加载岗位，纯 HTTP 抓取可能只拿到空壳 HTML；有些岗位还依赖正常登录态或交互式搜索。

边界：遇到登录、验证码、权限、地区跳转等限制，不绕过，标 `Needs user`。

公司池岗位过少时才建议扩展范围，不静默扩张。

## 3. URL / 来源分级

### A｜官方单岗位详情页
官方招聘域名/ATS + 一个具体岗位 + 能读到足够完整 JD。可进入正式 S/A/B。

### B｜官方 SPA / 登录入口
官方站存在岗位线索，但单岗 URL 不公开或必须登录。可进入 S/A/B，但必须标：`官方入口，需登录/交互确认`，verification_status=`需登录复核`。

### C｜第三方岗位线索
只用于发现。官网无法确认时进入 blocked / 待官网复核，不得冒充官方岗位。

## 4. Hard Gate 先判断

在算匹配分之前检查：
- 实习 / 校招 / 社招类型；
- 毕业年份 / 年级；
- 明确年限；
- 学历 / 专业 / 资格证；
- 语言 / 技术硬门槛；
- 地域 / 工作授权等明确限制。

明确且不可满足 → `blocked`，不继续用高软匹配分掩盖。

## 5. 0–100 匹配评分

对无 Hard Gate 阻塞的岗位：

```text
35% Core 能力匹配
30% 简历撞岗信号强度
15% 行业 / 业务场景相关度
10% 硬技能匹配
10% 求职条件匹配
```

`score = 0.35*core + 0.30*signal + 0.15*domain + 0.10*skills + 0.10*conditions`

每个子分都要有理由。

基线：
- S：>=80，强对口、无 Hard Gate、有当前可执行入口；
- A：65–79；
- B：50–64；
- <50：默认不进正式推荐；
- blocked：Hard Gate、失效页面、仅第三方未核实等。

同档排序：`匹配度 > 强信号 > 可转正/留用 > 紧迫度 > 入口可执行性`。

## 6. 写入 `workspace/<slug>/jobs.csv`

固定字段：

```csv
job_id,date_found,company_tier,company,job_title,role_family,job_type,convert_track,location,source,job_url,posted_date,deadline,match_score,submission_tier,status,resume_variant,hard_gate,verification_status,current_stage,next_action,applied_date,notes
```

规则：
- `job_id` 必须稳定；同一岗位二次运行更新，不重复新增；
- 新的正式 S/A/B 默认 `status=Ready`；
- 需要用户登录/确认的 B 类可 `status=Needs user`；
- blocked 岗位记录在 `blockers.csv`，不混进普通投递队列；
- 页面未写 deadline 就留空；
- 不编 posted_date / deadline；
- `notes` 写匹配优势、风险和评分理由的简明摘要。

## 7. 输出 `06_application_priority.md`

```md
# <目标岗位> 投递优先级

## S｜立即投
1. 公司｜岗位｜匹配度
   - 撞岗信号：
   - 最大优势：
   - 最大风险：
   - 转正/留用/紧迫度：
   - 官方入口：
   - 验证状态与时间：

## A｜本周投
...
## B｜同步投 / 保底
...
## 阻塞 / 待官网复核
...
```

## 8. Gate D

- 覆盖公司池，不只搜大厂；
- 正式推荐岗位读过完整 JD 或明确 B 类限制；
- Hard Gate 在评分前处理；
- 分数可解释；
- S/A/B 绑定官方入口；
- 第三方未核实只进 blocked；
- 没有虚构 URL、ID、截止日期或招聘状态；
- `jobs.csv` 可直接被 Dashboard 读取。
