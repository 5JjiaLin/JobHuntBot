# Feishu Sync｜通过官方 lark-cli 连接飞书多维表格

飞书是 **可选协作镜像**。默认数据流始终是：

`Local CSV → Web Dashboard →（可选）Feishu Base`

本地 `workspace/<target-role-slug>/jobs.csv` 是唯一真源；飞书用于手机查看、分享、筛选和协作，不做第一版双向回写。

本集成优先使用飞书 / Lark 官方开源 CLI：`larksuite/cli`。**不要再要求用户手动提供 App ID / App Secret，也不要自行实现 OAuth 或把飞书 HTTP API 作为主路径。**

---

## 1. 什么时候启用

只有用户明确希望以下任一能力时才启用：
- 手机查看岗位池；
- 与导师、朋友或团队共享；
- 使用飞书多维表格的筛选、视图或自动化；
- 希望本地看板之外保留一个云端镜像。

不需要云端时保持本地即可。飞书失败不得阻塞继续投递。

---

## 2. 核心原则

1. **官方 CLI 优先**：使用 `lark-cli` 完成配置、用户授权和 Base 操作。
2. **用户身份优先**：Base 操作默认显式使用 `--as user`。
3. **复用现有登录**：先检查状态，已有有效授权时不要为了“保险”重新登录。
4. **最小权限**：求职同步优先只授权 `base` 域；若 CLI 返回缺失 scope，按错误信息补最小 scope。
5. **Split-flow 授权**：Agent 发起授权后把 `verification_url` 交给用户，本轮停止；用户确认完成后，Agent 再用 `device_code` 完成登录。
6. **凭据由 CLI 管理**：JobHuntBot 不保存 access token、refresh token、App Secret。
7. **单向 Upsert**：本地 → 飞书，使用稳定 `job_id` 识别同一岗位。
8. **不破坏用户 Base**：只创建/更新 JobHuntBot 管理的字段与记录；不删除用户额外字段、视图或记录。

---

## 3. Agent 连接流程

### Step 0｜检查 CLI

先检测：

```bash
command -v lark-cli
```

若不存在，安装官方 CLI：

```bash
npx @larksuite/cli@latest install
```

安装失败时停止飞书分支并报告原因；不要影响本地 Dashboard。

### Step 1｜检查当前配置与登录态

先执行：

```bash
lark-cli auth status --json --verify
```

如果已经存在有效 `user` 身份且 Base 所需权限可用，直接进入 Step 4，不重复授权。

若 CLI 尚未完成应用配置，执行：

```bash
lark-cli config init --new
```

这是官方 CLI 的引导配置流程。Agent 需要捕获其输出中的浏览器授权 / 配置 URL，并交给用户完成；不要要求用户把 App Secret 发到聊天里。

### Step 2｜发起 Base 用户授权

使用非阻塞 split-flow：

```bash
lark-cli auth login --domain base --no-wait --json
```

从 JSON 中提取：
- `verification_url`
- `device_code`

给用户展示 `verification_url`，并明确告诉用户：完成飞书授权后回来回复“已授权”。

**此时停止当前轮。不要立刻阻塞轮询 device_code。**

### Step 3｜用户确认后完成登录

用户回复“已授权”后，由 Agent 执行：

```bash
lark-cli auth login --device-code <device_code>
```

随后验证：

```bash
lark-cli auth status --json --verify
```

如果登录失败或 device code 已过期，重新从 Step 2 生成新的授权链接；不要复用过期 code。

### Step 4｜选择“新建 Base”还是“连接已有 Base”

#### A. 用户没有指定现有 Base

默认创建一个新的求职 Base，减少配置成本：

```bash
lark-cli base +base-create \
  --name "JobHuntBot · <目标岗位>" \
  --table-name "岗位池" \
  --fields '<field-array>' \
  --as user
```

具体 `--fields` JSON 结构以当前安装版本 `lark-cli base --help` 和 `lark-base` Skill 为准，不凭记忆硬写不兼容 schema。

#### B. 用户提供已有多维表格链接

先解析：

```bash
lark-cli base +url-resolve --url '<飞书 Base URL>' --as user
```

取得真实 `base_token`、`table_id` 等坐标。不要从 URL 字符串自行猜 token。

如果一个 Base 有多个表，读取 table 列表后让用户选择，或在能唯一识别“岗位池”时直接使用。

---

## 4. 推荐字段

飞书表至少包含：

```text
岗位ID          ← job_id
公司            ← company
岗位            ← job_title
方向            ← role_family
岗位类型        ← job_type / level
城市            ← location
匹配度          ← match_score
投递梯队        ← submission_tier
状态            ← status
当前阶段        ← current_stage
下一步          ← next_action
截止日期        ← deadline（若本地有）
官网            ← job_url
简历版本        ← resume_variant
验证状态        ← verification_status
来源            ← source
发现时间        ← date_found
备注            ← notes
```

如果本地没有某字段，不为了飞书同步编造值。

`岗位ID` 必须稳定且非空，用于业务层 Upsert。飞书自身 `record_id` 只作为远端记录坐标，不代替本地 `job_id`。

---

## 5. 首次同步与 Upsert

岗位池通常少于 500 条，默认采用简单可靠方案：

1. 读取本地 `jobs.csv`；
2. 读取飞书表字段，确认字段 schema；
3. 读取飞书当前记录的 `岗位ID`，建立 `job_id → record_id` 索引；
4. 本地 `job_id` 不存在于飞书：加入 create 批次；
5. 已存在：只更新 JobHuntBot 管理字段；
6. 单批最多 200 条，同一 Table 串行写入；
7. 同步完成后报告新增 / 更新 / 跳过 / 失败数量。

推荐命令形态：

```bash
# 读取字段
lark-cli base +field-list \
  --base-token <base_token> \
  --table-id <table_id> \
  --as user

# 读取记录
lark-cli base +record-list \
  --base-token <base_token> \
  --table-id <table_id> \
  --field-id 岗位ID \
  --format ndjson \
  --output <temp-file>.ndjson \
  --as user

# 批量新增
lark-cli base +record-batch-create \
  --base-token <base_token> \
  --table-id <table_id> \
  --json @<create-payload>.json \
  --as user

# 批量更新
lark-cli base +record-batch-update \
  --base-token <base_token> \
  --table-id <table_id> \
  --json @<update-payload>.json \
  --as user
```

若当前 CLI 版本的命令参数不同，以 `lark-cli base --help` / 对应 Skill 为准，先读取再执行。

---

## 6. 本地只保存非敏感映射

连接成功后可在：

`workspace/<target-role-slug>/config.json`

保存：

```json
{
  "feishu": {
    "enabled": true,
    "base_token": "<base_token>",
    "table_id": "<table_id>",
    "base_url": "<base_url>"
  }
}
```

允许保存：
- Base URL；
- `base_token`；
- `table_id`；
- 最近同步时间；
- 最近同步摘要。

不要保存：
- App Secret；
- access token；
- refresh token；
- device code（授权完成或失败后立即丢弃）；
- CLI 私有凭据文件副本。

---

## 7. 后续同步

后续运行先检查：

```bash
lark-cli auth status --json --verify
```

有效则直接同步。

若授权失效：
- 重新发起 Base 域授权；
- 不删除本地配置；
- 不让用户重新手工配置 App Secret。

第一版同步方向保持：

`Local → Feishu`

不要实现：

`Feishu → Local`

除非未来单独设计冲突策略和审计机制。

---

## 8. 错误处理

### CLI 未安装

安装 `@larksuite/cli`。安装失败则停用飞书镜像，本地照常工作。

### 未配置应用

运行 `lark-cli config init --new`，把官方引导 URL 提供给用户。

### 用户未登录 / token 失效

发起：

```bash
lark-cli auth login --domain base --no-wait --json
```

按 split-flow 完成授权。

### missing_scope

优先使用错误返回的 `missing_scopes` / `hint` 补最小权限；不要无脑申请全部权限。

### Base 无法访问

保持 `--as user`，先检查用户是否真的有该 Base 权限；不要偷偷切换 bot 身份冒充解决。

### 找不到表 / URL 无法解析

使用 `+url-resolve` / `+table-list` 重新定位，不猜 token。

### 某批写入失败

记录失败项与错误；继续保留本地工作区。不得因为飞书失败回滚本地投递状态。

---

## 9. 完成条件

飞书分支只有在以下条件满足时算完成：

- 官方 `lark-cli` 可用；
- `auth status --json --verify` 确认用户身份有效；
- 已创建或解析目标 Base / Table；
- 至少一次 Local → Feishu 同步成功；
- 同一个 `job_id` 二次同步不会新增重复记录；
- 本地 CSV 仍是唯一真源；
- JobHuntBot 未保存 OAuth token / App Secret；
- 飞书失败不会破坏本地 Dashboard 或阻塞求职主流程。
