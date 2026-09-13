# 给 Codex 的合并与使用方式

本 Core 包不包含 Web Dashboard 源码。用户会同时提供当前已经修改完成的 JobHuntBot Dashboard 项目。

推荐直接把 Core 包 + 当前项目 + 下面 Prompt 一起给 Codex：

```text
你现在要把我提供的 JobHuntBot Core 包合并进当前已经修改完成的 JobHuntBot Web Dashboard 项目，并整理成一个可以公开上传 GitHub 的完整仓库。

先读 Core 根目录 AGENTS.md、SKILL.md 和 docs/dashboard-integration.md，再审查当前 dashboard/ 源码与真实数据结构。

最重要的约束：
1. 当前 dashboard/ 的 UI 和交互已经确认，不要重做、不要回滚、不要用 Core 中的旧设计覆盖。
2. Core 包故意不包含 Web Dashboard 源码；请把它的 Skill、Agent 指令、references、assets、evals、scripts 等合并到现有项目根目录。
3. 对齐 workspace 与 Dashboard 数据契约，最终只保留一个岗位数据真源；如果当前仍使用 dashboard/job_pool.csv，先备份，再按 docs/dashboard-integration.md 选择最低风险的迁移或适配方案。
4. 实时招聘研究与岗位核验优先使用 Control the in-app browser。
5. 飞书使用 references/feishu-sync.md 中的官方 lark-cli OAuth split-flow，不要恢复 App Secret/.env/自建 OAuth 旧方案。
6. 不要把真实求职数据、日志、备份、密钥、token 上传公开 GitHub。
7. 合并后启动现有 Web Dashboard，并使用浏览器实际验收核心流程。
8. 通过后再整理 .gitignore、README、目录结构并上传 GitHub。

不要只给我合并建议，直接在当前项目里完成文件合并、兼容、测试和 GitHub-ready 清理。遇到会破坏真实数据或需要决定公开/私有仓库的地方再停下来问我。
```

合并完成后，日常使用只需要：

```text
按 AGENTS.md 开始我的求职流程。
```
