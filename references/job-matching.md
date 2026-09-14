# Job Matching｜企业树 → 当前岗位验证、评分与投递优先级

本阶段只在简历通过 Gate C 后执行。输入不是随机重新找公司，而是 Phase 1 的 `01_企业树.md`。

## 0. 招聘类型确认

开始具体岗位搜索前必须确认：
1. 校招 / 实习招聘
2. 社招
3. 两者都看

不在 Phase 1 问。两者都看时分开搜索两套入口，不混淆 Hard Gate。

### 校招 / 实习
优先官方 Campus / Graduate / New Grad / Internship / 实习生 / 应届入口；重点看毕业年份、在校身份、实习资格、地点、开始时间、实习时长、转正条件。

### 社招
优先 Experienced / Professional / 社会招聘入口；重点看工作年限、必须经验、行业/管理经验、地区、工作授权、硬学历/证书。

## 1. 从简历提取撞岗信号

提取 3–5 个“能力 + 场景 + 证据”信号，同时列出 Core 覆盖、弱证据、Hard Gate 风险和求职条件。

## 2. 从企业树搜索

必须读取 `01_企业树.md`，覆盖：
- 头部 / 标杆；
- 中厂 / 成长型；
- 小而美 / 早期优质。

公司池岗位过少时才扩展范围，并说明扩展原因，不静默丢掉 Phase 1 企业树重新随机搜索。

## 3. Browser-first verification

浏览器可用时必须：打开官方招聘站 → 使用站内搜索/筛选 → 打开单岗位页 → 读取完整 JD → 确认公司/标题/地点/类型/职责/要求/页面状态 → 记录当前 URL 和验证时间。

第三方/Boss/LinkedIn/Indeed/牛客/实习僧/搜索缓存只做发现；官网未确认不得标官方已验证。

URL 来源：
- A：官方单岗位详情页，可正式 S/A/B；
- B：官方 SPA/登录入口，可记录但标 `需登录复核`；
- C：第三方线索，进入 blocked/待官网复核。

## 4. Hard Gate 先判断

实习/校招/社招类型、毕业年份/年级、年限、学历/专业/证书、语言/技术硬门槛、地域/工作授权等明确不可满足 → `blocked`，不继续用软匹配高分掩盖。

## 5. 0–100 可解释评分

```text
35% Core 能力匹配
30% 简历撞岗信号强度
15% 行业/业务场景相关度
10% 硬技能匹配
10% 求职条件匹配
```

S >=80；A 65–79；B 50–64；<50 默认不进正式推荐；Hard Gate/失效/第三方未核实 = blocked。每个子分必须有理由，公司名气不参与匹配分。

同档排序：`匹配度 > 强信号 > 可转正/留用 > 紧迫度 > 入口可执行性`。

## 6. 写入 `jobs.csv`

Canonical 字段：

```csv
job_id,date_found,company_tier,company,job_title,role_family,job_type,convert_track,location,source,job_url,posted_date,deadline,match_score,submission_tier,status,resume_variant,hard_gate,verification_status,current_stage,next_action,applied_date,notes
```

规则：
- `job_id` 必须稳定；优先官方岗位 ID，没有时基于规范化 `company + job_title + canonical job_url` 生成稳定值；
- 同一岗位二次运行更新，不重复新增；
- 跟踪参数变化不应生成新岗位；
- 页面没有 posted_date/deadline 就留空，不编；
- 正式 S/A/B 默认进入可行动队列；登录/用户确认限制标 `Needs user`；
- blocked 写入 `blockers.csv` 或对应阻塞记录；
- `notes` 简要写匹配优势、风险和评分理由。

## 7. 输出 `07_投递优先级.md`

结构：S 立即投 / A 本周投 / B 同步投或保底 / blocked 待复核。每个岗位至少写：匹配度、撞岗信号、最大优势、最大风险、官方入口、验证状态与时间。

## 8. Gate D

- 企业树三层被实际覆盖或明确说明无岗；
- 正式岗位已读完整 JD 或明确 B 类限制；
- Hard Gate 在评分前；
- 分数可解释；
- S/A/B 有官方入口；
- 第三方未核实不冒充官方；
- 无虚构 URL/岗位 ID/截止日期/招聘状态；
- `jobs.csv` 可被 Dashboard 直接读取。
