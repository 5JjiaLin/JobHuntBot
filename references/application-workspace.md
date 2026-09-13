# Application Workspace｜投递工作区与 Dashboard 对接

本文件负责阶段 5。阶段 4 找到岗位之后，不要把结果只留在聊天或 Markdown 里。

目标是让用户每天能持续推进：**今天先投什么、哪些已经投、哪些在测评/面试、哪些卡住、下一步是什么。**

## 1. 数据原则

- `workspace/<target-role-slug>/` 是求职数据工作区。
- 目标状态下，`jobs.csv` 是岗位唯一真源。
- Web Dashboard 负责读取和轻量写回状态。
- 飞书多维表格是可选协作镜像，不是第二真源。
- 同一个岗位必须有稳定 `job_id`，禁止用 CSV 行号做长期主键。

每个目标岗位使用：

```text
workspace/<target-role-slug>/
├── jobs.csv
├── application_log.csv
├── follow_up.csv
├── blockers.csv
└── config.json
```

完整求职产物同目录还包含 `01_role_market.md`、证据矩阵、简历、审计和优先级清单。

## 2. 与已有 Dashboard 的关系

本 Core 包不包含 Dashboard 源码。

如果目标仓库已经有 `dashboard/`：
- 现有 Dashboard 的 UI/交互实现优先保留；
- 先读取实际代码和实际 CSV，再决定最小改动；
- 不允许因为 Core 的参考字段与现有字段不同就重写前端；
- 不允许长期保留 `dashboard/job_pool.csv` 和 `workspace/.../jobs.csv` 两个都会被修改的真源。

具体迁移 / 兼容策略见 `../docs/dashboard-integration.md`。

## 3. Canonical `jobs.csv`

新工作区推荐字段：

```csv
job_id,date_found,company_tier,company,job_title,role_family,job_type,convert_track,location,source,job_url,posted_date,deadline,match_score,submission_tier,status,resume_variant,hard_gate,verification_status,current_stage,next_action,applied_date,notes
```

字段只在真实有值时写入。不要为了 Dashboard 或飞书填一个不存在的数据。

关键字段：
- `job_id`：稳定唯一键；已有岗位更新而不是重复新增。
- `submission_tier`：S / A / B / blocked。
- `status`：至少支持 Pending / Needs user / Submitted / Assessment / Interview / Offer / Rejected / Closed；若现有 Dashboard 的状态模型更简洁，可通过兼容映射展示，不必为了本 Skill 破坏已运行的数据。
- `current_stage`：笔试/测评、一面、二面、终面、HR 面、谈薪等更细阶段。
- `next_action`：下一步明确动作。
- `verification_status`：已验证 / 需登录复核 / 第三方待官网复核 / 已失效等。

## 4. 稳定 `job_id`

优先使用官方稳定岗位 ID；若官方没有可复用 ID，可基于规范化：

`company + job_title + canonical job_url`

生成稳定哈希。

要求：
- 同一官方岗位再次命中时保持相同；
- URL 只有跟踪参数变化时不应生成新 ID；
- 不要使用 CSV 行号。

## 5. 其他日志

### `application_log.csv`
至少记录：

```csv
timestamp,job_id,event,stage,evidence,notes
```

### `follow_up.csv`
至少记录：

```csv
event_id,job_id,date,time,event_type,notes,status
```

### `blockers.csv`
至少记录：

```csv
blocker_id,job_id,type,reason,next_action,status,created_at,resolved_at
```

若现有 Dashboard 使用不同表头，优先做一次兼容映射 / 迁移，不要无备份强改。

## 6. 状态推进

用户点击“已投递”：
- 更新岗位 status；
- 记录 applied_date；
- 追加 application log。

新增笔试 / 面试日程：
- 写 follow_up；
- 更新 current_stage；
- 必要时将 status 映射到 Assessment / Interview。

结束：
- Offer / Rejected / Closed 如实更新。

## 7. Phase 5 完成条件

- 阶段 4 的正式岗位已经进入工作区；
- 重复运行不会重复新增同一岗位；
- 用户能持续追踪投递、日程、面试与阻塞；
- 若有 Dashboard，Dashboard 与工作区之间只有一个数据真源；
- 页面操作真实写回，不只改前端内存；
- 飞书若启用，不改变上述数据所有权。
