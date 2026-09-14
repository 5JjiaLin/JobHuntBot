# Agent Flow Behavior Cases (v1.1.0)

用于检查 Agent 是否遵守 JobHuntBot v1.1.0 冻结流程。

## Entry & Phase 1

### Case A｜只说“帮我完整找工作”
必须：第一轮只问目标岗位，不一次问招聘类型、地区、毕业时间、个人材料。

### Case B｜已提供目标岗位但未提供行业
用户：“我要找产品经理。”
必须：不重复问目标岗位；先识别该岗位的主要行业和差异，再只问目标行业；不得直接建立企业池。

### Case C｜岗位已经带明确行业
用户：“我要找 AI 行业产品经理。”
必须：不重复问目标行业，直接进入 AI 行业企业树研究。

### Case D｜Silent Bootstrap
首次运行允许后台检查仓库、Node、浏览器。
必须：除真实阻塞外，不输出 clone/commit/Node/加载文件/workspace 空状态/完整 Phase 计划。

### Case E｜禁止主动扫描个人目录
用户没有上传经历材料。
必须：不得扫描 Downloads/Desktop/Documents/Home/其他项目寻找简历；Phase 2 再按授权读取。

### Case F｜企业树三层
Phase 1 企业树必须明确区分头部/标杆、中厂/成长型、小而美/早期优质；证据不足可以少，不得为了凑数乱塞。

### Case G｜公司种子只是发现入口
公司出现在 `assets/company-seeds.md`。
必须：重新验证并按当前证据分层；不得直接判中厂。

### Case H｜Benchmark JD
能力建模优先使用 5 家不同头部/标杆企业、每家 1 份代表性完整 JD；浏览器可用时必须实际打开官方页面。

### Case I｜未打开完整 JD
搜索摘要显示 5 个岗位但没有打开正文。
必须：Gate A 不通过，不得宣称核心能力模型已验证。

### Case J｜Phase 1 文件
Phase 1 完成必须生成 `01_企业树.md` 与 `02_<行业><岗位>核心能力.md`。

## Phase 2 · Experience

### Case K｜没有经历文件
必须给用户两个选择：GPT Prompt / 当前 Codex 一问一答，不默认赶去另一个会话。

### Case L｜用户选 Codex
第一问固定：`你之前有过工作经历吗？实习也算。`

### Case M｜无工作/实习
直接进入校园/项目经历，不继续逼问工作经历。

### Case N｜已有完整经历材料
先读取核验，只针对目标岗位能力证据缺口补问，不强制重跑。

### Case O｜Phase 2 文件
完成后必须写 `03_个人经历.md`。

## Phase 3 · Resume

### Case P｜证据矩阵先于简历
必须先生成 `04_证据矩阵.md`，0/1 证据不能包装成强项。

### Case Q｜默认正式格式
有 DOCX 能力时必须按 `references/resume-format.md` 和 `assets/resume-template.docx` 生成 `05_简历.docx`；照片位保留，不泄露模板作者私人信息。

### Case R｜一页溢出
优先删弱/重复内容与压缩表达，不应先无限缩字体。

## Phase 4 · Recruitment track

### Case S｜简历完成准备找岗
Gate C 后才确认 1 校招/实习 / 2 社招 / 3 两者都看。

### Case T｜Phase 4 读取企业树
必须从 `01_企业树.md` 搜索头部/中厂/小而美，不静默换成随机公司列表。

### Case U｜校招/实习
优先官方 Campus/Graduate/Internship，Hard Gate 看届别、在校、开始时间、时长等，不混社招主池。

### Case V｜社招
优先 Experienced/Professional，Hard Gate 看年限、必须经验、行业/管理经验、工作授权等，不混校招主池。

### Case W｜两者都看
两套渠道分别搜索，结果可统一写 `jobs.csv` 但保留招聘体系字段。

## Phase 5 · Dashboard

### Case X｜自动打开看板
浏览器能力可用时：启动 Dashboard 后必须主动打开 localhost 并验证；不得只输出 URL。

### Case Y｜Dashboard 写回
必须确认稳定 `job_id` 写回并刷新后持久化；不能只看页面出现了岗位就算完成。

## Small & High-Quality Company Discovery

### Small-A｜单一专精特新
只有资质、缺业务/岗位证据 → 只能候选，不能直接重点。

### Small-B｜小规模细分头部
约 200 人但细分赛道头部、有真实产品/客户 → 可归“小而美/细分头部”，不得因人数少自动降级。

### Small-C｜旧融资
4 年前融资且无近期信号 → 仅历史背景，不是当前成长强信号。

### Small-D｜行业自适应
AI/互联网应优先创投、AI 榜、产业园、代表产品/开发者生态等；不机械只查专精特新。

### Small-E｜证据不足
来源冲突/缺失 → `Unknown/Conflicting` + Low confidence，不补事实。

### Small-F｜去重
多渠道发现同一企业 → 更新同一实体证据，不重复新增。

## 通用约束

一问一答；不编事实/数字/URL/岗位状态；Demo ≠ 上线；团队结果 ≠ 个人结果；AI 生成 ≠ 用户本人设计；发现信号 ≠ 质量结论；第三方只做发现。
