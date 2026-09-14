# Application Workspace｜Workspace 与 Dashboard 收口

Workspace 从 Phase 1 开始承载阶段产物；Phase 5 负责最终校验、启动 Dashboard 并把它真正交到用户手上，而不是只打印 localhost URL。

## 1. 数据原则

- `workspace/<target-role-slug>/` 是当前求职工作区；
- `jobs.csv` 是岗位唯一真源；
- Dashboard 读取并轻量写回状态；
- 飞书只做可选镜像；
- 稳定 `job_id` 是写操作主键，不使用 CSV 行号。

完整结构：

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

动态 `02_...核心能力.md` 在行业确认后由 Agent 创建；DOCX 在环境支持时生成。

## 2. 初始化时点

目标岗位 + 行业确认后即可运行：

```bash
npm run init:workspace -- "<目标岗位>"
```

脚本幂等，不覆盖真实已有数据。Phase 1–4 逐步把产物写进同一目录。

## 3. Canonical jobs.csv

使用 Dashboard 当前 schema。关键要求：稳定 `job_id`、可追踪 `submission_tier/status/current_stage/next_action/verification_status`，字段没有真实值时留空。

## 4. 日志

`application_log.csv` 记录状态事件；`follow_up.csv` 记录测评/面试/跟进；`blockers.csv` 是阻塞历史与当前状态真源。不要为 Dashboard 再建第二份可写岗位池。

## 5. Phase 5 completion sequence

1. 检查 `01_企业树.md` 至 `07_投递优先级.md` 的应有产物；
2. 检查 Phase 4 正式岗位已进入 `jobs.csv`；
3. 检查 logs/blockers 文件存在且 schema 可读；
4. 确认 `dashboard/config.json` 指向当前 workspace；
5. 启动：`node dashboard/server.js`；
6. 浏览器打开 `http://localhost:8420/dashboard.html`；
7. 验证当前 workspace/目标岗位被正确读取；
8. 验证岗位列表存在；
9. 用一个安全测试岗位/现有状态做写回验证，确认通过稳定 `job_id` 更新并且刷新后不丢；
10. 保持 Dashboard 运行。

浏览器能力可用时，不允许只说“请自行打开 URL”。

## 6. 与现有 Dashboard 的关系

现有 Dashboard 的 UI/交互是产品资产：只做最小兼容，不用模板覆盖，不为了新文件命名重做前端。完整数据契约见 `../docs/dashboard-integration.md`。

## 7. 完成条件

- 阶段产物在同一 workspace；
- 同岗位重复运行不重复新增；
- 页面读取和写回真实持久化；
- Dashboard 已实际打开验证；
- 飞书失败不影响本地流程。
