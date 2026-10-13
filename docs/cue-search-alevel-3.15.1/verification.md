# 3.15.1 验证记录

日期：2026-10-13。开始前 main 的本机和 origin/main 均为 96f9607，fetch 后没有提交差异。工作区既有未提交的界面适配修改保留，本次只提交 CUE 搜索、A Level 配时和相应文档。

- 132 项领域测试通过，0 失败。输出：verification/domain-tests.log。
- TypeScript 通过，Next.js 16.3.8 webpack 生产构建通过，94 个页面生成完成。
- 全项目 ESLint 0 错误，2 项既有测试未使用变量警告（cue-practice.test.mts 与 workspace-sync-recovery.test.mts）。
- Edge 浏览器在 1440×1000 与 390×1000 验证 CUE 搜索：标题优先级、答案与 MS、文本高亮、mass 不匹配 biomass、无直接命中时近似拼写、全部关键词要求、清空恢复。结果：verification/cue-search-results.json。
- 两种尺寸均通过完整练习计时流程；新增检查旧默认预设实际保存为 Edexcel 数学配时、保留用户自定义时间、未识别科目禁止猜测限时，以及从未识别科目返回已识别科目可继续创建。原有全屏、暂停、键盘、超时、恢复、报告、Schedule 统计和复测去重验证通过。结果：verification/results.json。
- 12 页 DOCX 逐页检查，表格和正文没有越界。当前主机没有 LibreOffice，使用已有 docx-preview 和 Edge 渲染；不声称完成 Word/LibreOffice 认证。渲染截图在忽略的 docx-render 中，仓库保留可复现脚本。

配时依据：数学采用 [Pearson Edexcel IAL 官方说明](https://qualifications.pearson.com/en/qualifications/edexcel-international-advanced-levels/mathematics-2018/switch-to-pearson-mathematics.html)，物理采用 [CAIE 9702 考纲](https://www.cambridgeinternational.org/Images/664565-2025-2027-syllabus.pdf)，计算机采用 [CAIE 9618 考纲](https://www.cambridgeinternational.org/Images/697372-2026-syllabus.pdf)。其余已核对科目的官方来源及逐项预设在 DOCX 中列出。逐题时间是按卷面分值和时长推算的训练预设，代表分值与普通 ×1.2、宽松 ×1.5 属于工具设计。

浏览器验证使用隔离的本地测试上下文，没有修改真实用户数据或云端记录。
