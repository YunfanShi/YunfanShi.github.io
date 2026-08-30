# StudyGuide 结构与职责映射

核对版本：2026-08-30。

核心边界：TickTick等任务管理器负责What、When、Scope、Deadline、Priority和时间安排；StudyGuide负责How、诊断与修复。StudyGuide中的页面都是按需工具，不要求用户每次完整走一套SOP。

| 一级板块 | 当前结构 | 职责 |
|---|---|---|
| 执行中心 | 今日 / 本周 / 每两周 / 当前考试提醒 | 保留轻量执行摘要和周期诊断；不在这里重复解释具体方法。 |
| 学习 | 4-P / Cornell / 主动回忆与间隔 / Syllabus红绿灯 / 可选50分钟自学 | 解决怎样理解、连接、记住和独立学习。 |
| 习题 | 难题怎么拆 / 学科与题型 / 错题诊断 / 卡题怎么办 | 普通题直接做；难题才用“目标→缺口→连接”。题型库按Math、Physics、Chemistry、Biology、CS、Humanities和IELTS细分。 |
| 考试 | 学校考试 / IGCSE、AS、A-Level / 考场策略 | 用考试名称、日期、类型和可选范围生成日期驱动建议；不再要求先选2周或3周计划。 |
| 学习闭环 | 单页：理解→连接→检索→应用 | 只做总路线与失败路由，不再重复学校日、自学、复习和卡题内容。 |
| 执行与专注 | 计划 / 启动 / 专注与环境 | 计划写到可以直接开始即可：默认动作+范围，完成标准按需添加。 |
| IELTS 专项 | 总览 / Listening / Reading / Writing / Speaking / 词汇与语法 | 位于侧边栏全部学习栏目之后，负责IELTS训练的How；以Correction→Transfer为主线，不重复日程、考试计划或题库。 |

## IELTS 专项

- 总览用Listening、Reading、Writing、Speaking四条短流程说明“修复后换新材料验证”，不把当前材料练熟当成掌握。
- Listening严格区分不暂停、不回拨的Test Mode和局部重听的Repair Mode，并按声音识别、连读、处理速度、定位、干扰项、拼写等原因分别修复。
- Reading同时分析Wrong与Correct but Slow；所有错题和明显慢题都要回原文确认Evidence与paraphrase。
- Writing遵循“AI找问题→用户自己改→AI再检查→错误收敛→Language Upgrade→新作文迁移”；本篇错误至少在两篇独立新作文重复后才升级为Recurring Error。
- Speaking允许同题纠正2–4遍，但必须用新题检查语法与表达是否自动化；不把背熟机经答案当成流利度。
- 词汇与语法区分Recognition与Active Vocabulary，只收少量真实高价值项目，并回到四项新材料验证automaticity。

## 习题工具

- 难题怎么拆只用于陌生题、综合题、信息过多、不会组合或中途断掉。普通熟悉题不要求显式执行流程。
- 学科/题型库中，每一种题型回答五件事：实际在考什么、先看什么、答案怎样组织、常见错误和简短例子。
- 错题诊断继续只保留Knowledge Node、Root Cause、Retest三个必填项，以及九类通用Root Cause。
- 卡题流程为：具体卡点→最小提示→根因→小能力训练→当天新题→延迟验证。
- 卡题提示器默认不直接给答案；只有用户继续请求时才逐层增加提示。

## 日期驱动考试建议

统一阶段是Map、Diagnose、Repair、Verify、Simulate、Stabilize，但阶段长短不是固定比例：

- 剩1天：快速Map/Diagnose→关键Repair→Quick Verify→休息与风险检查。
- 约1周：快速定位，大部分时间Repair/Verify，最后少量mixed/timed practice。
- 约2–3周：Map & Diagnose→Repair & Verify→逐渐Simulate与Stabilize。
- 约2–4个月：范围地图与topic practice为主，中期cross-topic/sections，后期full papers。
- 超过4个月：长期Coverage和周期诊断为主，不提前进入高频整卷模式。

旧`activeExamPlan.kind`会被忽略；只要旧计划仍有日期，就按日期重新计算，不会报错。

## 轻量工具

- 任务写法助手：输入Subject、Action、Scope和可选完成标准，生成简短TickTick任务并支持复制。
- 卡题提示器：输入已经做到哪里和具体卡点，AI按最小提示原则逐层回应。
- 考试计划生成器：输入Exam Name、Date、Type和可选Scope，生成当前及后续阶段建议。

来源：用户提供的StudyGuide结构评审、原Google Docs及页面保留的视频来源。
