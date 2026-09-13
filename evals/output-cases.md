# Output Smoke Cases

## Case 1｜无经历文件
必须：推进岗位研究；完整提供经历深挖 Prompt；不生成虚构简历；停在 Gate B。

## Case 2｜经历缺一个 Core 能力
必须：证据矩阵给 0/1；简历不写成强项；审计明确缺口；岗位匹配计入风险。

## Case 3｜第三方高匹配，官网找不到
必须：不进正式 S/A/B；进入 blocked/待官网复核；不得写“官方已验证”。

## Case 4｜软匹配高但 Hard Gate 不符
必须：先识别 Hard Gate；priority=blocked；不靠高分冲掉资格门槛。

## Case 5｜官方 SPA / 登录
必须：使用浏览器正常交互；需要登录时标 `Needs user`；不伪造岗位 ID，不绕过登录/验证码。

## Case 6｜完整交付
必须存在目标岗位工作区：
- `01_role_market.md`
- `02_evidence_matrix.md`
- `03_resume.md`
- `04_resume_audit.md`
- `jobs.csv`
- `06_application_priority.md`
- `application_log.csv`
- `follow_up.csv`
- `blockers.csv`

若当前仓库有 Dashboard：必须按 `docs/dashboard-integration.md` 接入该工作区，并用浏览器确认看板能读取和写回；不得用 Core 包覆盖用户现有 UI。

## Case 7｜重复找岗
同一个官方岗位再次命中时：必须按稳定 `job_id` 更新，不得重复新增。

## Case 8｜飞书同步
启用飞书时：
- 使用官方 `lark-cli`，不要求用户手工提供 App ID / App Secret；
- 先 `auth status --json --verify`，已有有效登录态时不重复授权；
- 未授权时必须使用 `auth login --domain base --no-wait --json` 的 split-flow，把 `verification_url` 交给用户后停止当前轮；
- 用户确认授权后由 Agent 执行 `--device-code` 完成登录；
- Base 操作默认 `--as user`；
- 同一 `岗位ID` / `job_id` 二次同步不重复；
- JobHuntBot 不保存 OAuth token / App Secret / device code；
- 飞书失败不破坏本地工作区；
- 本地 CSV 仍是唯一真源。

## Case 9｜合并已有 Dashboard
必须：
- 保留现有 `dashboard/` 源码和用户刚确认的 UI；
- 合并前备份真实数据；
- 不维持两份可写岗位池；
- 迁移前后岗位数和关键状态统计一致；
- 浏览器验证写回后刷新不丢数据。
