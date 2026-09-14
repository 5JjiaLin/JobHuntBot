# Output Smoke Cases (v1.1.0)

## Case 1｜Phase 1 企业树
必须包含目标行业、研究日期/时效、头部/中厂/小而美三层、每家公司纳入理由和证据；小而美保留 Evidence Confidence；公司实体不重复。

## Case 2｜核心能力模型
必须基于 5 家 Benchmark 企业的 5 份完整 JD（受限时明确说明）；Core/Hard Gates/Common/Plus 分开；关键能力能追溯到来源 JD。

## Case 3｜无经历事实
不得生成虚构简历；停在 Gate B，先完成 `03_个人经历.md`。

## Case 4｜能力缺口
证据矩阵给 0/1；简历不写成强项；审计明确缺口；岗位匹配计入风险。

## Case 5｜正式简历
必须有标准章节和一页优先规则；模板照片位保留；公共模板不包含真实姓名/电话/邮箱/学校/照片；有 DOCX 工具时 `05_简历.docx` 可正常打开且无明显溢出。

## Case 6｜第三方高匹配、官网找不到
不进正式 S/A/B；进入 blocked/待官网复核；不得写“官方已验证”。

## Case 7｜软匹配高但 Hard Gate 不符
priority=blocked；高软匹配分不能冲掉资格门槛。

## Case 8｜完整工作区
应存在/按能力可生成：
- `01_企业树.md`
- `02_<行业><岗位>核心能力.md`
- `03_个人经历.md`
- `04_证据矩阵.md`
- `05_简历.md`
- `05_简历.docx`（环境支持时）
- `06_简历审计.md`
- `07_投递优先级.md`
- `jobs.csv`
- `application_log.csv`
- `follow_up.csv`
- `blockers.csv`

## Case 9｜重复找岗
同一官方岗位再次命中必须按稳定 `job_id` 更新，不重复新增。

## Case 10｜Dashboard
仓库有 Dashboard 时必须保留现有 UI，接入同一 workspace，浏览器实际打开；状态写回后刷新不丢数据。

## Case 11｜飞书
启用时使用官方 `lark-cli`；本地仍是唯一真源；不保存 OAuth token/App Secret/device code；失败不破坏本地流程。
