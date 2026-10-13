# 练习计时器 3.15.0 验证记录

日期：2026-10-13（Asia/Shanghai）。

- 任务开始 `git fetch origin` 后，HEAD 与 origin/main 均为 `b7f775b`，提交差异 `0 0`。
- 新增功能版本从 3.14.2 更新为 3.15.0。只提交本次修改，保留工作区已有其他改动。
- `node --test tests/study-concurrency.test.mts tests/learning-domain.test.mts tests/study-insights.test.mts tests/mobile-cue-study.test.mts tests/learning-roadmap.test.mts tests/sync-v2.test.mts tests/timed-practice.test.mts tests/practice-timer.test.mts`：125/125 通过。
- `node node_modules/typescript/bin/tsc --noEmit`：通过。
- `node node_modules/eslint/bin/eslint.js .`：0 错误，2 条原有测试未使用参数警告。
- `node node_modules/next/dist/bin/next build --webpack`：成功，94 个静态页面生成完毕，包含 `/practice-timer` 动态入口。
- `tests/practice-timer.browser.mts`：Edge 1440×1000 与 390×1000，所有断言通过。截图与机器结果在 `verification/`。
- 浏览器覆盖计时器专用全屏、隐藏填写区、左上角题型菜单、数字键、Space 与 Esc、独立题时、暂停总时、比例背景、超时、刷新草稿恢复、Schedule 摘要、复测任务去重、自定义科目设置与登录页无横向溢出。
- 动效验证黄色外围环缓慢转动、红色细弧以 2.2 秒一圈旋转，独立动画与音效开关及音量设置可持久化。真实进度环与数字保持稳定；系统减少动态效果时不播放视觉动效。音频为本地 Web Audio 短音合成，不依赖下载素材，不连续播放警报。
- 原有 Schedule 同步、账号权限和数据库结构保持复用；没有向真实用户账号创建测试训练。真实跨设备云同步由既有链路处理，当前验证包括本机保存、三方合并和同步安全边界。
- 默认预设由浏览器初始化到 `practiceTimerConfig`，随着现有 Schedule 账号文档同步进入账户数据库。数据库保存每种题型三档秒数及颜色百分比，旧报告保存原限时快照。
- 文档首先尝试技能的 `render_docx.py`，本机缺少 `soffice.exe`，已记录诊断。随后用 docx-preview 在 Edge 渲染并逐页检查；这是浏览器版式预览，不是 Microsoft Word 或 LibreOffice 的渲染结果。

复现浏览器测试时设置 `JACKYUN_PLAYWRIGHT_PATH` 为可用 Playwright 包路径，`JACKYUN_TEST_URL` 为运行中的站点地址。文档脚本使用 `load_workspace_dependencies` 返回的 Node 与依赖路径；可通过 `JACKYUN_ARTIFACT_PACKAGES` 和 `JACKYUN_DOCX_PREVIEW` 覆盖。
