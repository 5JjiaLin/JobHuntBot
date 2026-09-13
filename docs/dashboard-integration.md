# Dashboard Integration｜把 Core 合并到现有 Web 看板

本文件只解决一件事：**如何把 JobHuntBot Core 与用户已经修改完成的 Web Dashboard 合并，而不回滚 UI、不制造双数据源。**

## 1. 第一原则：现有 Dashboard 源码是 UI 真源

合并时不要：
- 覆盖 `dashboard/`；
- 用旧版 dashboard HTML 替换当前版；
- 根据文档重新生成 UI；
- 为了“统一架构”重写 React/Vue/Next；
- 删除用户已经确认的交互。

Core 只提供求职流程、数据契约、工作区初始化、真实性规则和飞书同步规则。

## 2. 合并前先审计真实 Dashboard

Codex 先读：
- `dashboard/server.js`
- 当前 HTML/CSS/JS/modules
- 当前 Dashboard 配置
- 当前实际 CSV / JSON 文件
- 状态写回 API

输出一张映射：

```text
Dashboard 当前字段 / 文件
→ Core 工作区对应字段 / 文件
→ 是否需要迁移
→ 最低风险改法
```

不要根据文件名猜。

## 3. 唯一真源选择

目标状态：

```text
workspace/<target-role-slug>/jobs.csv
```

为唯一岗位真源。

如果当前 Dashboard 仍直接使用：

```text
dashboard/job_pool.csv
```

按优先级处理：

### 方案 A｜直接让 Dashboard 读取 workspace（优先）

当改动较小：
- 给 Dashboard 加 `workspace_dir` 配置；
- server 读取该目录的 jobs/log/follow-up/blockers；
- 保留 UI 与 API 行为；
- 一次性把旧数据迁移到 workspace。

### 方案 B｜兼容适配层

当 Dashboard 深度依赖旧表头：
- server 在读取时做字段映射；
- 写入仍回到唯一真源；
- 不生成长期双写副本。

### 禁止方案｜两份 CSV 长期双向复制

禁止：

```text
dashboard/job_pool.csv  ←→  workspace/.../jobs.csv
```

两个文件都允许修改。

这会产生冲突、漏更新和状态覆盖。

## 4. 迁移旧数据

任何迁移前：

```text
_backup_<timestamp>/
```

备份原数据。

迁移时：
- 不删除未知字段；
- 不修改真实 status / notes / resume_variant；
- 缺字段留空，不补造；
- 为旧岗位生成稳定 job_id；
- 验证岗位数量、已投递数量、Offer/Rejected 数量前后一致。

## 5. Dashboard 配置

如果现有 Dashboard 已有配置机制，复用它。

如果没有，可新增最小配置：

```json
{
  "workspace_dir": "../workspace/ai-产品经理",
  "target_role": "AI 产品经理"
}
```

路径解析以 `dashboard/server.js` 的位置为基准或使用绝对解析后的根目录，避免依赖用户启动 cwd。

## 6. 状态兼容

不要因为 Core 推荐更多状态就强制改 UI。

现有 Dashboard 可以通过映射显示：

```text
Pending / Needs user → 待投递/待处理
Submitted / Assessment → 已投/测评
Interview → 面试
Offer / Rejected / Closed → 已结束
```

如果当前 Dashboard 底层仍只有 `Pending / Submitted / Offer / Rejected`，先保持可用，再只在实际需要时渐进升级。

## 7. 合并后的浏览器验收

启动当前 Dashboard 后，使用 **Control the in-app browser** 实际检查：

1. 页面加载正常；
2. 用户刚修改的 UI 没被回滚；
3. 岗位数量与迁移前一致；
4. 搜索/筛选正常；
5. 打开岗位详情正常；
6. 标记已投递真实写回唯一真源；
7. 新增/编辑/删除日程正常；
8. 面试阶段正常；
9. blocker 正常；
10. 刷新后数据不丢；
11. 不存在两份可写岗位池。

测试写操作使用临时测试行或先记录原状态，测试后恢复，不污染真实数据。

## 8. GitHub 上传前

公开仓库上传前检查：
- `workspace/` 是否包含个人求职数据；
- `dashboard/` 是否包含真实 `job_pool.csv`、application log、follow-up；
- `_backup_*` 是否包含个人数据；
- 是否存在 `.env`、token、auth state、cookies；
- 是否存在真实姓名、邮箱、电话、内推信息、未公开 JD。

公开仓库只保留：
- 代码；
- 空模板；
- DEMO / fake sample；
- Skill / references / docs。
