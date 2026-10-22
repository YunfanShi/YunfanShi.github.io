# JackYun 主站 UI 验收与合并说明 3.33.0

日期：2026-10-22

范围：当前主站在用入口的 UI 现代化成果、验收中发现的修复，以及合并 main 的版本、数据与回退保护。

关联审查：[Pull Request 143](https://github.com/YunfanShi/YunfanShi.github.io/pull/143)。最终合并状态、远程 CI 和部署状态以该 PR 及其关联记录为准。

## 1 验收结论和适用边界

本次交付统一主站基础控件、工具箱、导航、设置、学习页面常用操作及在用 iframe 的交互规范，保留 JackYun 蓝色和浅色、灰色、深色三主题。生产构建与源码逐文件核对，避免验收旧预览。验收发现并修复了语言 Provider 重挂载、导航统计存储异常和缓存计时 iframe 初始化竞态三个真实问题。

最终本机浏览器结果：31 个套件均取得通过证据。其中完整集成运行的 30 项直接通过；发现缓存 iframe 竞态的离线计时套件，在修复并重建后分别于 1440px 和 390px 定向复验通过。最终源码仍由远程 CI 全量复跑后才合并。全部 Node 单元测试、TypeScript、ESLint、错误码生成物一致性和私钥 PEM 标记扫描均进入合并前检查。远程 CI 使用相同生产构建和浏览器脚本，成功后才允许合并 main。

本报告中的“通过”限于明确注明的本机或 CI 条件。账号、权限、公告和云端接口使用 loopback fixture；双设备冲突保护有自动化契约回归，但没有真实生产账号、两台实体设备或 Android/iOS 真机验收。没有把模拟数据、页面空壳或浏览器视口模拟当作生产 Auth/RLS、真实多设备同步或真机证明。

## 2 仓库基线和版本处理

开始验收时，改造分支为 feat/ui-modernization-shell，提交 708bf4f；此前基础组件提交为 cf0ce79。已 fetch GitHub main；基线为 d8f33d5。两侧有 2 个改造提交和 23 个 main 提交需要整合。继续使用现有功能分支，先合入 main，再对集成代码验收。

main 的 package.json 为 3.32.0，而 APP_VERSION 仍为 3.30.4；旧改造快照使用 3.27.33。此次包含新的基础控件和交互能力，按用户的 minor 升级规则统一定为 3.33.0。package.json、package-lock.json 顶层及根包、src/lib/utils.ts 的 APP_VERSION 保持一致。没有升级 Next.js、React、TypeScript 或 Tailwind 大版本。

技术依赖保持 Next.js 16.3.8、React 19.2.8、TypeScript 5.9.3、Tailwind CSS 3.4.17，以及已有 Radix Dialog、Tabs、Slot；本次菜单使用锁定的 Radix DropdownMenu 2.2.1。shadcn/ui 风格组件作为项目内源码维护，没有额外引入另一套整站组件库。

产品更新历史保留 main 的已发布记录，对重复版本保留首条，整理日期顺序。旧分支中用于开发和验收的多次 3.27.x 记录合并为一条面向用户的 3.33.0 说明，详细研发历史仍保留在原实施报告和 Git 历史中。短小补丁的发布说明允许一至两条真实改进，不为满足条数而编造内容。

## 3 本轮发现和修复的问题

| 优先级 | 问题与触发条件 | 修复方法 | 验收证据 |
| --- | --- | --- | --- |
| P0 | LanguageProvider 初次挂载时由 Fragment 切换为 Context Provider，重建页面子树；生产阅读 chunk 延迟时，已显示的书架和入口消失 | 从 SSR 开始保持 Provider 结构稳定；只更新语言值，启动更新使用 startTransition；存储不可用保留服务端语言 | 延迟生产阅读 page chunk，实际点击 AI 阅读工坊，确认动作入队、书架保持、模块就绪后仅重放一次；桌面和手机正常进入、生成、查词、答题及本机保存流程 |
| P1 | 导航统计缓存被写成非数组，或 localStorage 写满时，Sidebar effect 抛错，可破坏页面导航 | 校验统计队列类型并只接受字符串；捕获统计写入失败，继续导航 | 故意注入错误队列和 QuotaExceededError，实际从工具箱进入资源目录，页面与控制台断言通过 |
| P0 | Service Worker 缓存中的计时 iframe 先完成加载，其 ready 消息早于父页面监听器，课程列表一直等待初始化 | 父页面注册监听器后主动发送一次已有 practice-state 初始化；仍响应后续 practice-ready | 故意延迟父页面生产 chunk，使 iframe 先加载；离线创建、开始、暂停、保存、刷新恢复和完成报告；单测确认初始化不触发业务写入 |
| P0 | 合入较新 main 时，旧 PWA v7 断言和旧运行代码可能覆盖新版离线与账号隔离保护 | 保留 main 的现有 Service Worker、同步引擎、API、计时引擎和云端控制权逻辑；采用当前 pages-v10 导航缓存与既有静态缓存版本 | 离线/PWA 单测、管理员页不缓存、账号缓存隔离及计时接管保护；对受保护路径检查 diff |
| P1 | 两侧错误提示改动冲突，一边提供浮层避让，另一边提供 30 分钟静默 | 同时保留标题栏下方提示、说明区点击穿透和手动关闭后的跨页面静默；从源脚本重新生成文档与运行产物 | 错误提示相关单测、构建脚本 --check、导航及旧页面全屏操作 |
| P1 | 部分测试只认识开发版 chunk 名称、旧页面标题或旧组件依赖；本机曾读取不同服务的构建目录 | 使用 JACKYUN_BUILD_DIR 指向实际测试的构建；按内容识别生产懒加载 chunk；补齐真实组件依赖的 fixture；统一可配置浏览器通道 | 同一脚本在生产 webpack 构建执行，仍断言首次不加载、点击后加载和失败重试；没有删除这些功能断言 |

相关实现位于 src/components/language-provider.tsx、src/components/layout/sidebar.tsx、src/components/modules/schedule/practice-timer-frame.tsx、scripts/build-error-system.mjs。核心回归位于 tests/reading-studio.browser.mjs、tests/ui-shell.browser.mjs、tests/offline-practice.browser.mts、tests/practice-cloud-frame.test.mts。

## 4 实际交付页面与状态保护

| 入口 | 已交付的改进 | 保留的状态与业务边界 |
| --- | --- | --- |
| /tools | 共享 Tabs、Button、Input、Textarea、Dialog；五面板按需加载；Word 导出按动作加载；懒加载失败可重试 | 页面会话草稿保存在 ToolDraftProvider；隐藏面板卸载并停止计时任务；保留输出、文件名和上传文件；剪贴板失败与过期响应不覆盖较新输入 |
| /dashboard | 工作台入口与异步统计拆分；快速任务表单统一控件 | 原请求、日期/时长 payload 和离线任务队列；统计延迟不会阻止入口使用；提交失败保留输入 |
| /settings | 搜索、分类控件和可访问分类面板按需导入；客服对话使用统一 Dialog、Button、Textarea | 保留原 query 与数据 owner；敏感字段沿用原生命周期；客服最小化暂停轮询并保留草稿，失败不清空输入 |
| /reading | 默认书架与 AI 工坊分包；启动前首击排队；语言初始化不再重建整页 | 保留小说数据格式、章节锚点、紧急书签和阅读位置；生成、查词和测验使用本机 AI fixture 验收，真实模型和云端书架仍需独立条件 |
| /schedule 和 /practice-timer | 常用入口统一触控、焦点和状态；CUE 编辑及学习往返回归；缓存 iframe 初始化恢复 | 保留 CUE、学习记录、备忘录/答题卡、计时状态和既有存储 key；不改变练习结果、首次证据或计时接管规则 |
| /quiz | React 与 HTML 两版的选择、确认、导航和输入控件统一；版本切换和移动触控 | 保留题目结构、判题时点、版本偏好和本地成绩历史；自定义科目正常显示 |
| /ielts | 目标、练习与五模块记录的触控、焦点、状态语义 | 原周期、跨轮顺延和三方合并写入器；存储失败保稿；IELTS Practice Timer 保留连续听力 30+2 分钟及既有练习分配 |
| /resources 和 /review | 搜索、筛选、清除和复习操作统一控件 | 保留资源链接、过滤规则、IndexedDB snapshot/outbox、分批确认及离线队列恢复 |
| /ai 与悬浮 AI | 共享输入与发送/停止操作样式 | 沿用模型、会话和请求接口；没有真实 AI 凭据时不声称生产消息流验收通过 |
| /admin 与子页 | 局部控件触控/焦点规范、导航和权限拒绝；公告表单保存状态 | 保留 capability、Server Action、危险操作确认与原数据模型；管理员 fixture 不等同生产 RLS |

管理员路由包括 /admin、/admin/users、/admin/content、/admin/ai、/admin/network、/admin/tickets、/admin/announcements、/admin/access、/admin/system、/admin/enforcer、/admin/update-hub。11 个入口分别验证 1440px 和 390px；普通、BETA 及游客的拒绝/登录路径也执行检查。公告创建、编辑、停用、启用、删除确认、取消与失败保稿使用有状态本机 fixture。

19 个在用 LegacyFrame 路由为 /study、/goal、/study-guide、/vocab、/answer-sheet、/answer-sheet-sync、/mock-portal、/music、/music-sync、/bilibili-sync、/relax、/help、/poem、/pomodoro、/countdown、/examcountdown、/igcountdown、/timetable-hub、/control/focus。桌面与手机共 38 个路由/视口组合检查主题、语言桥与嵌入布局；StudyGuide、答题卡、音乐和倒计时另有保存及重挂载回归。未迁移备份目录、独立旧站或无在用入口的模块，也未删除这些文件。

复杂领域组件继续保留，并不要求把每个原生控件强行改成 Radix。此次验收确认交付范围的交互和保护措施，未把“所有业务组件重写”为完成条件。

## 5 主题和交互验收

保留 data-theme 的浅色、灰色、深色三主题和 JackYun 蓝色。共享控件引用既有背景、前景、边框、品牌和状态 Token；Radix Portal 选择最近的局部主题或活动全屏容器。旧 HTML 页面继续使用既有主题/语言桥与局部 CSS，不注入另一套全局 Tailwind 规则。

按钮的正常、悬停、按压、聚焦、禁用和忙碌状态保持一致。点击 handler 立即执行；120ms 视觉反馈不推迟业务处理。导航提示使用安全区感知的居中网格和 CSS 加载环，桌面与 390px 下图标、文字、重试和关闭按钮对齐。系统或站点减少动效设置关闭相关动画。

Dialog 与菜单检查焦点限制/恢复、Escape、键盘与触屏。普通输入在手机保持至少 16px 字号和 44px 触控高度；异步提交防重复，保存失败保留输入，过期剪贴板或客服响应不覆盖新输入。提示框出现不等同于业务内容已加载完成，懒加载验收等待实际字段、文章或面板内容。

## 6 测试矩阵和可复现方法

| 层级 | 方法 | 结果与证明范围 |
| --- | --- | --- |
| 源码和生产产物 | 独立应用快照，只使用本机占位 URL/key；Next.js webpack standalone 构建；逐文件 SHA256 核对 | 616 个源码/静态文件 SHA256 一致，差异为 0；生产生成 96 个静态/动态路由条目；没有使用原预览服务的旧 .next 作为验收依据 |
| Node 单元测试 | tests 下全部 .test.mts 和 .test.mjs | 797/797 通过，0 失败；覆盖同步、旧设备恢复、晚回执、冲突、计时所有权、PWA、权限契约及学习数据 |
| 静态检查 | tsc --noEmit、eslint .、check-no-private-keys、build-error-system --check、git diff --check | 类型、lint、PEM 标记与生成物检查通过；PEM 扫描不声称代替全面安全审计 |
| 生产浏览器 | scripts/verify-ui.mjs 串行执行 31 个既有和新增流程 | 见 verification/browser-results.json 与各测试脚本；避免共享 fixture 被并行测试互相重置 |
| 离线和恢复 | 真实 Service Worker、本机断网、重新加载；云端失败和接管使用模拟接口 | 计时器可在离线开始/暂停/保存/刷新恢复并完成报告；不要求先连接云端；无例行离线横幅；真实双设备未验证 |
| 权限与保存 | 签名 loopback session；服务端 Action 和有状态 fixture | 可达性、用户/BETA 拒绝、游客 next、保存失败、重试和单次提交；不把 fixture 当作生产数据或 RLS |
| 视觉与移动 | Edge 桌面、320/390/768/1440 等视口；触屏和 reduced-motion 模拟 | 截图与交互检查；没有 Android/iOS 实体设备或软键盘实测 |

浏览器套件包含：工具箱、主站框架、认证通知退出、导航提示、管理员路由、公告失败/CRUD、QuizWise、IELTS 仪表盘、资源目录、设置、客服、阅读工坊、小说位置、快速任务、在用 iframe、StudyGuide、音乐、倒计时、答题卡、课程时间线、CUE 设置/草稿/搜索、复习队列、移动导航、云计时契约、IELTS 计时、离线计时、滴答日程和暖切换性能。

复现时先启动 tests/fixtures/ui-backend.mjs 于 127.0.0.1:54329，再使用 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329 和非真实占位 key 构建、运行应用。设定 JACKYUN_TEST_URL 为该 loopback 服务，然后执行 node scripts/verify-ui.mjs。若使用独立快照，JACKYUN_BUILD_DIR 必须指向被测服务的实际 .next。JACKYUN_BROWSER_CHANNEL 本机可选 msedge，CI 为 chromium。所有浏览器写操作只作用于本机 fixture 或隔离浏览器存储。

## 7 性能结果及限制

环境：Windows，Node 24.19.0，Edge 155，Next.js 16.3.8 webpack standalone 生产构建，1440×1000，loopback fixture，无 CPU 和网络节流。先实际切换面板并确认 React 已保存输入，再采集 50 次暖切换。

测量从 pointerdown 捕获开始，至目标时间面板的必需 DOM 出现并经过两次 requestAnimationFrame 结束。中位数 24.7 ms，P95 31.6 ms，最大值 32.2 ms；草稿保留，脚本错误为 0。原始样本和资源表位于 verification/performance.json。

该指标低于本计划轻量本地交互 200ms 的建议值，但不是 INP、实际显示时刻或公网页面加载时间。没有同版本、同环境的完整 main 对照，不能声称全站快了某个百分比。按钮首次视觉反馈 P95 100ms 未单独量化；网络等待、首次 chunk 下载和暖态本地处理需要分开解释，不能以显示空壳代替内容可用。

## 8 Git 提交和发布检查

主工作区已有 37 个跟踪文件修改，在合并前已保存本地二进制 patch、逐文件副本与 SHA256 清单，目录为 JACKYUN/.main-before-ui-3.33.0。该备份保留在本机，不上传用户未完成的无关工作。所有既有未跟踪文件保留。

使用现有 PR 143 对 main 审查；同步 main 的冲突在改造分支解决。合并前确认当前 head 的构建、类型、lint、单测与浏览器 CI 成功，再使用期望 head SHA 合并，避免远端出现新提交时误合并。若 main 前进，重新同步并复验受影响范围。没有强制重置、强制推送或大范围清理。

main 更新后核对本地与远程 Git 提交、package、lock 和 APP_VERSION。主工作区原修改通过保留的备份和可恢复方式恢复为未提交状态，不把无关修改混入 UI 发布。CI 仅拥有 contents:read，后端全部为占位 fixture；源码没有新增部署密钥或测试后门。

如 Git 集成自动触发部署，检查其关联提交及构建结果。生产账号、RLS、多设备和真机未验证的限制需继续保留，不因构建成功或 PR 合并而改写成已通过。没有实施数据库迁移、生产数据重置或同步协议升级。

## 9 回退和数据保护

若功能异常，停止继续推广；对合并提交执行可审查的 revert，生成新的 main 提交并重新构建。合并提交的 first parent 为当时 main，可用 git revert -m 1 对应合并 SHA 撤回整批 UI；若只撤回后续独立修复，按其提交边界 revert。不得 reset --hard 或强推 main。

回退代码不得清除 localStorage、sessionStorage、IndexedDB、离线 outbox、计时恢复键或云端记录；不能回退数据库版本。恢复 UI 后检查现有草稿、书签、CUE 学习记录和 Practice Timer 已用时间仍可读取，未确认同步队列仍可重试。计时器初始化补丁沿用原消息类型和 payload，不写业务数据；回退前后都不能绕过显式接管和旧 token 拒绝。

真正的生产部署回退、多设备恢复在线与实体手机行为，没有在本轮环境中执行。对应风险保留为发布后的独立验证事项，不在此次 UI 修改中重写同步协议解决。

## 10 交付文件

本目录 README.md 与 JackYun主站UI验收与合并说明3.33.0.docx 内容一致。verification 下保存精简的浏览器结果、单测摘要、生产构建、性能原始样本和源码快照摘要；screenshots 下保存本次三主题对话框、手机工具箱与导航提示截图。完整运行日志和内部 DOCX 渲染页保留在本机验收目录，避免重复生成物进入版本库。

原 docs/ui-modernization-3.25.0/ 继续作为设计与开发过程的历史记录；本报告和 PR 143 为此次 3.33.0 集成验收依据。
