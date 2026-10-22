# JackYun 主站 UI 现代化实施进展与审查报告

日期：2026-10-22
实施分支：`feat/ui-modernization-shell`
当前分支工作版本：`3.27.33`（非发布版本；当前分支的 package.json、package-lock.json 与 APP_VERSION 对齐。已核实的本机 origin/main 版本信息存在差异：package.json 为 `3.32.0`，APP_VERSION 为 `3.30.4`；合并前需先同步并解决该版本不一致，再确定正式版本号。）
状态：本地功能分支已完成本轮可执行的 UI 改造与验收；尚未合并或发布。真实生产账号、双设备、实体手机、远端 CI 与部署回退仍待外部条件具备后验收。

## 1 执行摘要

本轮在现有 Next.js 主站上完成了第一批基础控件、第二批站点框架和部分第三、第四批在用页面交互。设置的 11 个用户可访问分类按需加载，AI 阅读工坊仅在选择后载入；QuizWise React 版复用共享 Button/Input/Textarea，版本切换也改用共享 Button，HTML 版补齐触控尺寸、焦点、答案状态和减少动效，并修复自定义科目不显示的问题。IELTS 五模块记录补齐手机触控/焦点/状态语义和跨轮数据回归。StudyGuide、PracticeTimer、音乐播放器与两版 QuizWise 均有本机桌面/手机回归。管理员导航与公告 CRUD 使用签名 loopback fixture 验证。改造沿用已有 shadcn/ui 风格组件、Radix UI、Tailwind CSS 3 和 JackYun 蓝色主题，没有更换整站组件库，也没有修改同步协议、数据库结构或用户数据模型。StudyGuide 考试计划和任务写法助手草稿现可跨标签与 iframe 重载恢复；本机保存失败会保留输入，已加入重试和状态回滚流程回归。日程 CUE 管理的卡片操作现为至少 44×44px，桌面/手机均通过单条编辑与学习历史保留验证。

工作分支版本由 `3.26.0` 逐步提升至 `3.27.33`；本地交付覆盖 QuizWise React/HTML 控件、StudyGuide 草稿保护、PracticeTimer/音乐移动回归、IELTS 五模块交互、后台控件、日程与 CUE 触屏焦点规范、LegacyFrame 状态与失败恢复、设置及工具箱 hydration 早期输入保留、错误提示层级、阅读工坊和跨设备同步边界回归。Next.js、React、TypeScript 与 Tailwind 均未升级。当前开发快照不是正式发布版本。合并前需同步 main；本机 origin/main 的 package.json 与 APP_VERSION 版本分别为 `3.32.0` 和 `3.30.4`，须先处理该既有不一致。

本地生产构建、TypeScript、全仓 ESLint、密钥扫描和既有离线/并发/AI/学习回归通过；本机浏览器还覆盖设置、阅读、后台、QuizWise、StudyGuide、PracticeTimer、音乐及 LegacyFrame 路由。本轮设置页 16 项、认证导航 7 项、工具箱 10 项、StudyGuide 状态流程与 19 个旧页面桌面/手机检查均已复跑通过；设置和工具箱均覆盖 hydration 延迟期间的早期输入保留。最新重跑的 65 项同步/离线恢复测试和工具页 10 项浏览器流程也通过。改造已有具体控件和交互变化，但五批计划尚未全部完成：真实 Supabase Auth/RLS 和双设备恢复、管理员生产读写、部分 Reading/CUE 深层编辑、iframe 各页保存/全屏/账号切换、当前工作树版本的远端 Actions 与预览、真机和回退演练仍待验收。GitHub 上现有 Draft PR #143 的 CI 通过只针对远程第一批提交 `cf0ce79`，不验证当前本地功能分支；PR 仍不可合并。用户目前只能安排本机验收，因此真实账号、多设备与真机门禁暂时不具备条件。

本地验收还覆盖设置搜索与工具箱文本输入在 hydration 期间的早期输入保留，以及旧页面 iframe 加载失败恢复。客户端代码延迟时，先输入的搜索词或文本会在 hydration 后同步到筛选/会话草稿；LegacyFrame 失败时显示明确错误和重试控件，加载状态具备屏幕阅读器语义。设置、StudyGuide 草稿恢复和全部 19 个在用旧页面的桌面/390px主题与语言桥回归通过。当前工作版本为 `3.27.33`，尚未合并或发布。

## 2 仓库与技术架构核实

Git worktree 根目录为 `ui-modernization/`，Next.js 应用位于其 `jackyun-portal/` 子目录。本轮构建所用实际版本如下：

| 项目 | 实际版本 | 依据 |
| --- | --- | --- |
| Next.js | 16.3.8 | `jackyun-portal/package.json`、本机生产构建输出 |
| React / React DOM | 19.2.8 | `jackyun-portal/package.json` |
| TypeScript | 5.9.3 | `jackyun-portal/package.json` |
| Tailwind CSS | 3.4.17 | `jackyun-portal/package.json` |
| Radix Dialog | 1.3.1 | `jackyun-portal/package.json` |
| Radix Dropdown Menu | 2.2.1 | `jackyun-portal/package.json` |
| Radix Tabs | 1.2.1 | `jackyun-portal/package.json` |
| 组件版本 | 3.27.33 | `package.json`、`package-lock.json`、`src/lib/utils.ts`、`src/lib/update-history.ts` 一致；当前分支工作版本 |

应用使用 Next.js App Router。主站入口与受保护页面位于 `src/app/(portal)/`；认证拦截和身份判断由 `src/proxy.ts`、服务端 layout 与页面 action 分担。管理员位于独立的 `src/app/admin/`，不能把侧栏隐藏视为服务端授权。PWA 服务工作线程位于 `public/sw.js`，当前页面缓存版本为 v7；离线工作区 API 位于 `src/app/api/offline/workspace/route.ts`。

`src/components/ui/` 已有基于 Radix 的 Dialog、Tabs、Button、Input、Textarea 等本地组件。它们是项目自己的 shadcn/ui 风格源码，不是运行时引入的另一套整站主题。新加的 DropdownMenu 直接使用已锁定的 Radix 包。项目已有 `data-theme` 三主题、Portal、LegacyFrame、离线 snapshot 与同步写入器，本轮在这些接口上做增量适配。

页面入口、权限和具体状态所有者以已提交的 [原改造计划](../migration-plan.md) 的仓库调查清单为准；本报告只列本轮实际改动与验收页面，不按仓库文件数量扩展范围。

## 3 在用入口与本轮变更范围

| 页面 / 入口 | 本轮处理 | 保留的行为与状态 | 验收 |
| --- | --- | --- | --- |
| `/tools` 工具箱 | 复用共享 Tabs、Button、Dialog；工具按需挂载 | 工具草稿、页面会话、剪贴板失败保留输入 | 生产模式 10 组流程 |
| `/dashboard` 首页 | 将异步统计与工作台入口拆开；快速任务表单用共享控件 | 原 Server Action、日期/时长 payload、离线任务队列 | 统计延迟、快速任务失败保留与重试 |
| `/settings` 设置 | 搜索输入、桌面分类导航接入共享控件；11 个可访问分类面板按需导入；移动端保留原生分类 Select | 原 query 参数、分类切换、敏感输入生命周期和各面板状态 owner | 生产 fixture 浏览器 16 项；所有分类可打开，首次访问后加载面板 chunk |
| `/settings?section=advanced` 客服对话 | 工单对话复用共享 Radix Dialog、Button、Textarea；补焦点、最小化、关闭确认、失败重试和重复提交保护 | 沿用原工单消息和远程协助 Action；草稿留在当前页面会话，最小化保留草稿并暂停轮询 | 1280px/390px 浏览器流程通过：加载失败重试、三主题、焦点、IME、失败保稿、新输入保护、最小化和关闭确认 |
| `/ielts` IELTS 工作台 | 目标/练习表单复用共享控件；五模块记录增加 aria-expanded/pressed、键盘焦点和 44px 移动触控；跨轮保留逻辑不变 | 原目标、练习、周期和历史 localStorage 格式及 three-way merge 写入器 | 7 项手机浏览器流程：目标、五模块跨轮顺延、刷新恢复、练习、存储失败保稿、三主题、输入触控 |
| `/resources` 学习资源 | 搜索、分类与清除操作使用共享控件 | 原资源数据、过滤规则和外链 | 三主题、移动触控与搜索筛选 |
| `/review` 复习队列 | 复习会话操作接入共享 Button；修复独立测试 fixture 的 CSS 注入 | 原 IndexedDB 离线记录、pending guard、云端确认规则 | 0/50/51/120 条、离线队列回灌 |
| `/schedule` 学习日程 | 顶层视图导航及 Cue 管理、添加任务、导入课表接入共享 Button；手机管理菜单增加明确的打开/关闭名称；CUE 管理卡片操作统一 44×44px | 原本地写入器、计时状态、CUE 草稿和子面板挂载方式 | 桌面/手机入口尺寸通过；CUE 搜索、手动编辑以及复习记录/备忘录保留通过；会话设置、混合学习与离开/返回恢复通过 |
| `/reading` 阅读器 | AI 阅读工坊从书架默认包拆出，选择后动态加载；新增小说滚动与翻页位置往返回归 | 原 IndexedDB 小说章节、`jackyun_novel_position_v2` 紧急书签、章节锚点与阅读模式格式保持不变 | AI 工坊 5 项；新增桌面浏览器往返测试覆盖紧急书签恢复、滚动进度持久化、翻页模式和 reader → shelf → reader；CI 已接入 |
| `/quiz` QuizWise | React 版题目控件复用共享 Button/Input/Textarea；版本切换复用共享 Button；HTML 版补触控、焦点、选中状态和减少动效；修复自定义科目列表对象渲染 | 原 `quizwise_version_preference`、HTML/React 切换、题目结构和本地历史格式 | 两版本切换桌面/手机并验证按钮状态/尺寸；React 和 HTML 均覆盖 JSON 导入、科目、作答、成绩与本地历史；HTML 覆盖设置开关和进度点触控、reduced motion |
| `/admin` 与 10 个子页 | 保留现有后台页面和局部深色主题；新增路由/权限检查及公告表单保存失败回归 | 现有 capability、Server Action、危险操作和数据 owner | 11 个导航页在 1440/390px 管理员 fixture 可访问；普通/BETA 均被重定向，游客保留 `next`；公告异步保存失败时忙碌按钮禁用、只发一个 mutation、标题和正文保留 |
| `/ai` 与全局 AI 入口 | Chat/Work 选择、消息输入/发送/停止和悬浮入口接入共享控件 | 模型选择、会话和请求逻辑不变 | 类型、构建、lint；AI 模型凭据未提供，消息流未做端到端验证 |
| 在用 LegacyFrame 入口 | 不重写旧 HTML；保留 iframe 与桥接，统一移动触控覆盖规则；StudyGuide 补触控反馈/减少动效及任务草稿恢复，答题卡、音乐和倒计日增加状态往返回归 | 原 iframe、语言/主题 `postMessage`、存储桥、PWA 与计时控制器 | 19 路由 × 桌面/390px 的主题、语言桥与触控目标通过；答题卡草稿恢复、StudyGuide 考试与任务助手草稿跨标签/重挂载、三主题/清单/移动导航、音乐偏好和倒计日事件恢复通过 |

本轮没有重写管理员数据表单、阅读器书库/阅读记录流程、Schedule/CUE 编辑器或旧 HTML 页面本体。后台验证使用签名 loopback fixture：除可达性、导航、访问拒绝和无服务错误回退外，公告 CRUD 已覆盖创建、编辑、停用、启用、取消删除和确认删除，保存失败时保留输入且只发起一次 mutation。fixture 不等同真实生产权限、RLS 或数据写入验收；真实服务端 Action 与生产数据流程仍属于第三批未完成范围。

## 4 现有组件审计与兼容策略

优先复用 `Button`、`Input`、`Textarea`、`Dialog`、`Tabs`，避免再引入同类组件库。顶栏菜单使用 Radix DropdownMenu；定时器、CUE 学习、复杂表单、后台表格和 iframe 领域逻辑不因 UI 外壳更新而整体替换。

共享 Button 提供统一聚焦、按压、禁用和异步 busy 状态。点击处理立即运行；只有 handler 返回 Promise 才显示本地忙碌态，不用按压动画延迟事件。快速任务沿用原 `useTransition` 和 `/api/offline/workspace` 请求；服务错误时不清空标题、日期及时长，重试仍提交原 payload。

`package.json` 和 lock 文件只新增/锁定当前实现所需 Radix DropdownMenu 包；没有升级 Next.js、React、Tailwind 或 TypeScript，也没有新增全局状态库。Tailwind 保持 3.4.x。不存在 Vue 或 Element Plus 架构。

## 5 主题、焦点和移动交互

保留浅色、灰色、深色及现有 `data-theme`。新共享控件引用站点变量 `--brand`、`--foreground`、`--background`、`--card-border`，不另建主题 Provider。Radix Portal 继续由 Dialog 容器选择逻辑处理；iframe 页面保留 `jackyun-theme.css` 与 `jackyun-theme.js` 的 `jackyun-theme` 消息协议。

共用输入在手机视口保持 16px 字号和 44px 最小高度；图标按钮至少 44×44。Reduced Motion 仍可通过系统媒体查询与站点设置生效。第三方旧页面样式只通过现有 `/shared/device-workspace.css` 作用于 LegacyFrame，不将 Tailwind 全局规则直接注入旧页面。

## 6 加载、状态与性能

首页入口不等待八项学习统计请求；统计仍并行读取并在 Suspense 区域显示，不能将空壳算作可用内容。路由继续使用 Next.js App Router 与 `router.prefetch`；`src/lib/navigation-prefetch.ts` 只约束可选意图预取，访客、离线、节省流量、慢网、受限页面与用户关闭预取时不触发受保护入口预取。

没有因为切换标签而永久挂载所有面板。工具箱由 `ToolDraftProvider` 保留页面会话中的草稿，并仅挂载当前工具；Schedule/CUE 的 timer 和 draft 继续归原领域组件所有。复习仍沿用本地 snapshot/outbox 和 authoritative server snapshot；同步接口、键名与用户数据模型不变。

浏览器 fixture 下，通知 Dialog 从点击到内容可见并经过两次 `requestAnimationFrame` 的暖态 P95 为 34.5ms（n=30）。配置首页统计接口延迟 1.8 秒时，首页入口在 121ms 可用。设置首屏首个面板可用时间为中位数 254ms、P95 311ms；切换到 AI 设置分类中位数 31ms、P95 41ms。n=10 下，设置首屏 JS 传输中位数 602,526 bytes、解码 2,054,557 bytes；当前记录的旧包单次样本分别为 650,475 / 2,229,079 bytes，旧值样本数仅 1，不能视为严格前后性能实验。AI 阅读工坊首屏书架中位数 180ms、P95 222ms，首次打开工坊中位数 349ms、P95 362ms；选择后才加载约 40,105 decoded bytes 的独立 chunk。以上来自本机 Edge headless、loopback fixture、无网络节流；不含公网网络、真实 Supabase、真机、冷启动或生产 CDN。改造前没有同设备、同网络和同操作的完整基线，因此不能据此声称整体 INP 或体验提升比例。

## 7 五批实施状态

| 批次 | 本轮结果 | 状态与剩余门禁 |
| --- | --- | --- |
| 一：基础控件与工具箱 | 已由 `cf0ce79` 建立基础控件、工具草稿、动态加载和工具测试；Draft PR #143 保留独立边界 | 已提交到开发分支；PR 未审查、未合并 |
| 二：主站框架 | Sidebar、Topbar、手机菜单、通知、退出、主题 Portal、首页入口与权限感知预取已实现；增加签名 Supabase fixture | 本地生产流程通过；当前改动未独立提交或远程 CI 验证 |
| 三：在用 React 业务 | 工具、首页快速任务、设置导航/11 类按需面板及客服对话、IELTS、资源、复习、Schedule 导航/CUE 手动编辑与常用入口、AI 输入、阅读工坊按需加载和 QuizWise 版本弹窗统一；后台导航、权限 fixture 和公告 CRUD 增加路由及交互验收 | 部分完成。公告 CRUD 只通过本机 fixture；管理员真实数据编辑/危险操作、Reading 生产读写状态、CUE 云端持久化/账号接续和 AI 有权限模型流程仍未端到端验收 |
| 四：在用 iframe 兼容 | 19 个 `LegacyFrame` 路由桌面/手机主题与语言桥回归；QuizWise、StudyGuide、PracticeTimer、音乐播放器和倒计日增加业务状态验收；统一移动触控规则 | 部分完成。旧页本体保留；仍需覆盖部分编辑/保存、全屏、账号切换、离线升级及真实多设备流程 |
| 五：集成、发布与回退 | 候选版本生产构建、201 项领域回归、新增后台/设置/阅读/iframe 浏览器检查、报告和 CI 步骤已更新 | 本机门禁通过；远程 Actions、预览、PR 审查、部署、双设备实测、真机和回退演练尚未完成 |

原计划全范围 41–72 人日，含缓冲约 50–94 个工作日；该估算仍覆盖未完成的管理员、阅读器与 iframe 页面。本次阶段性代码不足以重新下调总工期，待第三、第四批页面入口冻结后再调整。

## 8 Git 与发布安全

当前分支为 `feat/ui-modernization-shell`，实施基线提交为 `cf0ce79`，分支历史基线为 `b6f3078`。本机 `origin/main` 的 `package.json` 版本为 `3.32.0`，`APP_VERSION` 为 `3.30.4`，存在版本号不一致；本轮没有联网 fetch 或修改 main。合并前需要先核对最新 main、处理该版本不一致并逐文件解决冲突。本轮仅在功能分支整理和提交改造，不推送、不合并、不部署；主工作区已有用户修改未触碰。

正式继续时仍按五批保持提交/PR 边界。禁止 `git add .`、强制重置、清理未知文件或强推；每批只暂存已确认文件。合并前 fetch 当前 main，在干净 feature 工作区按文件合并，重点重新跑同步、权限、离线和 timer 回归。每批 PR 应包含 base SHA、页面清单、测试证据、部署 SHA 与回退步骤。

代码回退不执行数据库迁移，也不清除 localStorage、IndexedDB、离线 outbox 或云端记录；恢复 UI 版本后再验证用户本地草稿和同步队列可读。当前代码仍未提交/推送，审查前不会触发生产发布。

## 9 测试矩阵与结果

| 验收组 | 结果 | 边界 |
| --- | --- | --- |
| Next.js 生产构建 | 通过，Next 16.3.8 `next build --webpack` | 使用本机 fixture URL 与占位匿名 key |
| TypeScript / ESLint / diff | 通过 | ESLint 对本批涉及组件和测试定向执行 |
| 私钥扫描 / 版本 | 通过；当前 `package.json`、lock、APP_VERSION 一致为 3.27.33 | 仅是本分支工作版本；本机 origin/main 的 package.json 与 APP_VERSION 不一致，合并前需核对并重定正式版本 |
| 领域、离线、并发、AI 与学习 | 201 项通过：116 项 AI/IELTS/导航预取/学习并发，66 项同步恢复/PWA/Legacy 主题与 CSS，19 项计时与训练数据 | fixture 不是 Supabase RLS 或真实多设备 |
| LegacyFrame 页面 | 38 个路由/视口组合通过，覆盖 19 个在用 iframe 入口在 1440px 和 390px 下的主题、语言桥及触控目标 | IGCountdown 沙箱内的 8 次 `localStorage` 访问错误来自无 `allow-same-origin` 的嵌入播放器；隔离保持生效。每页保存/全屏流程未测 |
| 管理员入口与权限 | 22 个路线/视口组合可在管理员 fixture 打开；11 个后台子路由对普通/BETA fixture 均重定向到 `/dashboard`，游客跳转保留原始 `next`；公告创建、编辑、停用、启用、取消删除和确认删除均在 stateful fixture 通过，删除只发送一次确认后的 mutation；保存失败时草稿保留且无重复提交 | 只验证本机路由与数据形状，不是生产 Auth、RLS 或真实后台数据操作 |
| 工具箱 | 10 项浏览器流程通过 | 本地 Edge headless |
| 框架与认证 | 壳层 4 视口、导航 5 视口、认证/通知/退出 7 组通过 | 使用签名 loopback fixture，不接真实 Auth/RLS |
| IELTS、资源、设置、快速任务、阅读工坊、QuizWise、小说进度、后台公告表单 | 分别 5、5、16、4、5、2 组；小说进度增加 1 条桌面往返流程；公告表单覆盖延迟服务失败保稿，以及公告创建、编辑、启停和确认/取消删除的 stateful fixture 流程，均通过 | 仅模拟移动触控；数据服务和权限为 fixture；小说长文恢复未在真机和跨设备云同步下验证；公告 CRUD 未连接生产 Supabase/Auth/RLS |
| 复习队列 | 0、50、51、120 条分批、离线未确认和 IndexedDB 回灌通过 | 云端权威快照由本地 fixture 模拟 |
| 日程与计时 | 课程时间线 3 项，新增 390/1440px 今日/周课表/设置切换时倒计时保留；CUE 会话设置 3 项、PracticeTimer 云计时流程通过 | CUE 评价与当前题目跨路由离开/返回在 1440px 本机生产 fixture 通过；真实账号云端接续与设备恢复仍待验收 |
| LegacyFrame / iframe 业务流程 | 答题卡在 1440/390px 通过草稿恢复、判分和重挂载；StudyGuide 三主题、清单/当前板块恢复、390px 触控和 reduced motion 通过；音乐播放器桌面/390px 通过歌单与偏好恢复；QuizWise React 和 HTML 均通过手机端完整答题及本地历史；PracticeTimer 桌面/390px 各 20 项和离线/控制权 fixture 通过；倒计日桌面新增事件恢复通过 | 音乐真实音频/跨账号同步、StudyGuide 深层编辑保存、Countdown 其他设置、PracticeTimer 真实 Supabase/双设备恢复未覆盖；没有 iOS/Android 真机或 PWA 升级验证 |

远程 GitHub Actions 尚未启动；CI 中新加的测试只能说明配置被提交到工作树，不能写成 GitHub Actions 已通过。生产环境、低端设备、真实 2G/弱网、iPhone/Android 真机、真实 Supabase 多设备并发和管理员生产权限均未验证。

## 10 原计划问题与改进对照

| 优先级 | 原问题 | 本轮改进 | 风险与预期收益 |
| --- | --- | --- | --- |
| P0 | 直接在 main 上开发、脏工作区混入 UI 改动 | 使用现有隔离 worktree 与功能分支；保留 main 和用户修改；未合并/推送 | 减少误覆盖和发布风险；仍需在 PR 前同步较新的 main |
| P0 | 只堆 Loading/Skeleton，没测交互阻塞 | 首页入口与异步统计分开；认证 fixture 测量 Dialog、首页入口；不把空壳计为可用内容 | 改善本机响应证据；缺改造前同环境基线与公网/真机数据 |
| P0 | 可能因 UI 改造重写同步协议 | 沿用 local writer、offline workspace、IndexedDB outbox、PracticeTimer server ownership | 保持既有用户数据契约；真实多设备冲突仍需预览和双设备测试 |
| P1 | 为了替换组件重复增加组件库 | 复用项目 Button/Input/Textarea/Dialog/Tabs，Radix 只补 DropdownMenu | 降低重复能力和依赖面；复杂后台和领域页面尚未逐项审计完成 |
| P1 | Tab 切换丢草稿或后台任务继续运行 | 工具仅挂载当前面板并由 provider 留草稿；Schedule/CUE/计时器保留原状态 owner | 避免无条件挂载；其他复杂阅读和设置面板仍需逐页验证 |
| P1 | 只在构建成功后宣布完成 | 补充生产浏览器、离线、权限、旧 iframe、移动视口与状态回归 | 真实性提高；远程 CI、真机、生产服务门禁仍未通过 |
| P2 | 低价值视觉润色优先 | 优先修复入口等待、失败输入保留、重复提交、焦点和触控目标 | 让用户先感受到点击与操作反馈；完整视觉 token 审计继续按后续批次执行 |

## 11 风险、回退与发布条件

发布前必须关闭第三批未完成流程和第四批逐页状态验收；在受控预览环境验证管理员直达 URL、服务端 action 和危险操作；对 Reading、Schedule/CUE 与 LegacyFrame 测试保存失败后保留草稿、重试、离线恢复和账号切换。通过真实双设备回归旧设备恢复在线、冲突处理、迟回执和计时接管。若数据门禁失败，停止推广对应批次。

合并前条件：远程 main 冲突同步完成；类型、lint、密钥、受影响 Node 与浏览器测试通过；GitHub Actions 实际通过；预览环境检查权限和页面入口；按 main 当前版本重新定版并确认与合并/部署内容一致。当前工作区没有部署或回滚行为。

若只回退 UI 批次，使用对应批次 PR/提交边界 revert 并重新构建，不改数据库、同步格式或离线缓存数据。回退验收要检查旧版仍能读取现有 localStorage/IndexedDB key，并继续同步尚未确认的 outbox。

## 12 未完成项与下一步

下一阶段按在用页面清单继续，不要将备份目录、历史副本、无导航入口和停用旧站纳入迁移：

1. 完成第三批剩余业务验收：管理员列表和危险操作的真实数据/服务端 action，Reading 跨设备/生产同步与长文设备恢复，Schedule/CUE 云端持久化和账号接续；CUE 搜索、单条编辑及复习记录/备忘录保留已通过 1440px/390px 本机浏览器回归，离开后返回和学习设置亦通过；AI 权限模型下的真实消息流仍待验收。公告 CRUD 的创建、编辑、启停与确认/取消删除，以及失败保稿和单次提交均已在 fixture 下通过；仍需在受控预览环境对真实后端端到端验收。
2. 第四批继续验证打开、编辑、保存失败重试、语言/主题、全屏、账号切换和离线恢复。QuizWise React/HTML、StudyGuide 主要导航、PracticeTimer 本地/fixture 流程与音乐偏好现已有桌面/手机自动化；剩余重点是 StudyGuide 深层编辑保存、音乐真实播放/同步、PracticeTimer 真实 Supabase 双设备接续，以及各 iframe 页面未覆盖的全屏与账号切换。
3. 在受控预览环境跑远程 CI 与生产同源的权限检查；安排双设备冲突、旧设备恢复在线和迟回执测试。具备 Android/iOS 真机后再完成触屏、软键盘与 PWA 升降级验收。
4. 取得改造前同设备基线后，用相同网络和操作路径复测按钮反馈、弹窗可用和标签切换；本机 fixture 数字只用于定位和回归，不代替线上基线。

本报告与代码都停留在 `feat/ui-modernization-shell`，等待用户检查。审查之前不合并 main、不推送远程、不部署。

## 13 本轮追加验证（2026-10-21）

在设置 `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329` 与仅供测试的占位 anon key 后，重新完成 Next.js 16.3.8 standalone 生产构建。工具箱、主站框架、QuizWise、阅读工坊、小说阅读位置、快速任务、资源目录、设置分类、认证与通知/退出、管理员导航与公告 CRUD fixture、IELTS、19 个 LegacyFrame 路由的 1440/390px 主题/语言桥、StudyGuide、音乐、倒计日、答题卡以及 CUE 离开后返回浏览器流程均通过。设置 UI 16 项通过；主框架 UI 10 项通过；认证壳层 7 项通过；管理员 11 路由 × 2 视口与普通/BETA/游客拒绝检查通过。首页延迟统计下入口实测 142ms，通知 Dialog 暖态 P95 39.2ms（n=30）。

此前因 Windows 进程创建错误 1909 暂停的性能专项、class timeline、review queue 与移动导航测试，已在本轮恢复后完成并通过。历史性系统错误已解除。远程 GitHub Actions、真实 Supabase Auth/RLS、真实双设备、Android/iOS 真机、公网弱网与生产部署仍未验证。测试服务保留用于本地预览；工作保持未合并、未推送。



## 14 本轮追加：主站预览与客服对话改造（2026-10-21）

用户已通过本机浏览器查看 `http://127.0.0.1:3150/dashboard`。这是 Next.js 生产构建通过 loopback Supabase fixture 提供的匿名预览：页面可见新版主站导航、Dashboard 入口、AI Chat/Agent 区域、工具模块和移动底部导航；后端数据均为本机空白/测试数据，线上站点没有改动。预览服务当前保持运行以便用户检查。

本轮客服对话窗改用共享 Radix Dialog、Button 与 Textarea，保留工单 Action、消息 schema 和同步方式。增加主题/全屏 Portal 定位、焦点限制和恢复、Esc 最小化、移动端 16px 输入、IME Enter 防误发送、重复提交保护、发送失败保留草稿、发送期间的新输入保护，以及有草稿时明确确认保留或丢弃。窗口最小化后停止自己的轮询；刷新失败时仍保留已载入消息。

本轮完成 Next.js 16.3.8 standalone 生产构建；浏览器性能专项 50 次暖态计时的中位数为 14.3ms、P95 为 15.5ms、最大值 16.4ms，草稿保留检查通过，脚本错误为 0。该指标起点是 pointerdown，终点是目标面板 DOM 出现并经过两次 RAF，是本机 Edge 155、生产 webpack、1440×1000、无 CPU/网络节流、匿名 loopback fixture 的实验室代理值，不代表实际呈现追踪、INP、线上速度或相对改造前的提升比例。新增 class timeline 3 项、CUE session settings 3 项、移动导航 5 视口和 review queue 0/50/51/120 分批及 IndexedDB 回灌均通过。

客服对话流程在 1280px 桌面与 390px 手机视口通过：覆盖加载失败重试、三主题、焦点限制/恢复、IME、重复发送、失败保稿、新输入保留、最小化后暂停轮询、恢复会话及关闭确认。自动化关闭确认通过键盘 Enter 触发，因为该浏览器运行时向页面注入的空错误标记遮住右上角鼠标目标；普通主站预览中未出现该标记。

本轮记录客服专项、报告 DOCX 重建和逐页渲染检查均已完成；当时的代码、CI 配置和报告尚未提交或推送，结果保留供用户审查。历史版本 3.27.2 低于 main tracking ref 3.30.4，因此不得将该候选号当成正式发布号。

## 15 本轮追加：完整本机浏览器回归与设置懒加载验收修复（2026-10-21）

当前本地生产构建下重新执行 24 组 CI 浏览器流程。23 组首次执行通过，包含主站与认证壳层、管理员 11 路由和权限拒绝、公告 fixture CRUD、QuizWise、IELTS、资源目录、客服桌面/移动弹窗、阅读工坊和阅读位置、快速任务、19 个 LegacyFrame 路由 × 1440/390px、StudyGuide、音乐、倒计日、答题卡、课程时间线、CUE 设置与路由草稿、复习队列和 5 种移动导航视口。设置页的独立代码块断言在该轮首次执行失败；独立复跑通过。

核对后确认设置测试只等待了包裹懒加载组件的父级标题“离线工作区”，父级可先于子组件 chunk 就绪，随后立即读取 `performance` 资源表会产生时序竞态。测试现增加等待懒加载组件独有的“断网时可以做什么”内容，再验证新增 JS chunk。改后设置浏览器流程通过 16 项断言，覆盖桌面 11 类面板、按需 chunk、搜索和手机分类切换及触控尺寸。该修正只改变测试等待条件，不改变运行时设置和用户数据行为。

分支工作版本按小问题规则由 `3.27.1` 升至 `3.27.7`，本轮小步更正均为浏览器回归稳定性修复；`package.json`、lock、APP_VERSION 和更新历史保持一致。本机 Node 为 24.19.0，main tracking ref 的 3.30.4 版本仍较新。Windows 默认命令进程曾间歇返回 CreateProcessWithLogonW 1909；改用获准的本地测试执行后完成验证。此验证为本机匿名/签名 loopback fixture，不代表生产 Auth/RLS、真实双设备、远端 GitHub Actions 或真机结果。

## 16 最终完整浏览器套件复核（2026-10-21）

完整复跑最初暴露三处本机自动化时序：移动导航布局边界、注入的空 `[data-jackyun-errors]` 遮挡音乐 iframe、SSR 快速任务输入框在水合时被替换。测试已分别改为等待真实布局尺寸、清除无内容的注入标记、等待输入框完成水合并进入布局；移动导航则定位响应式导航专属节点。最终 3.27.7 生产构建的 25 个浏览器/性能命令全部通过，包括设置 16 项、权限/公告 CRUD、19 个 LegacyFrame 路由桌面/手机检查、状态恢复、日程/CUE、复习队列与五视口移动导航。最终性能专项代理值 median 24.8ms、P95 26.8ms、max 27ms；通知对话暖态 P95 28.6ms（n=30）；延迟首页统计 1.8 秒时入口 183ms。均为本机 Edge、生产 webpack、loopback fixture、无网络/CPU 节流下的实验室代理数据，不能视为线上 INP 或改造前后比例。生产 Auth/RLS、远端 Actions、双真机和线上性能依旧属于外部门禁。


## 17 本轮追加：QuizWise React 答题控件改造（2026-10-21）

本轮把 QuizWise 的 React 答题主路径接入站点现有共享控件，目的是让选择、确认、翻题和输入获得统一的触控尺寸、键盘焦点和主题样式。改造范围限于当前 React 版本；HTML iframe 版本、题目结构、localStorage/IndexedDB key、答题判定与云端 Action 均继续沿用。

- 题目选择与判断：选择项改用共享 Button，保留 `data-quiz-option` 快捷键钩子，补 `aria-pressed` 选中状态，并维持至少 44px 的触控高度。
- 题目确认与翻页：确认、上一题、下一题和完成测验统一共享 Button；题号状态使用 `aria-live` 通知辅助技术。选择答案后仍需明确确认，未改变判题时点。
- 题目输入与科目：主输入、填空和论述使用共享 Input/Textarea；科目类别、科目、自定义科目和返回/开始操作统一按钮状态和焦点外观。
- 成绩结果：复习答案、重做测验和结束操作使用共享 Button；本地成绩仍通过既有 `quizwise_history` 写入，完成后按现有逻辑清除当前题目和会话缓存。
- 自动化验收：Next.js 16.3.8 webpack 生产构建和 TypeScript 检查通过；QuizWise 浏览器回归覆盖桌面/手机版本选择、React/HTML 切换，以及 390px 手机视口下 JSON 导入、自定义科目、答题确认、题目导航、50% 结果和本地历史字段。改动文件的定向 ESLint 通过。
- 版本管理：工作分支应用版本从 3.27.7 按修复版本规则增加为 3.27.8；`package.json`、`package-lock.json` 根包和 `APP_VERSION` 对齐。当前本机 Node 为 24.19.0，main tracking ref 仍记录 3.30.4；远程 main 与真实生产 Auth/RLS、双设备和真机表现仍待正式 PR 前验证。
- 本机浏览器使用 loopback 后端 fixture 和 Edge headless；此结果证明 React 客户端答题路径与本地记录行为，不证明真实云端同步、在线身份权限或跨设备恢复。


## 18 本轮追加：StudyGuide 响应与触控改进（2026-10-21）

StudyGuide 已有 Material 样式和主题桥接，本轮只补齐操作响应规范，不重复引入 React 组件库，也不改变 iframe 数据逻辑。导航、主标签、分段标签、时间切换、快捷行动、清单、手机菜单和 AI 发送按钮统一至少 44px 触控高度；键盘焦点增加品牌色描边；常用控件过渡从 200ms 缩短到 120ms，内容面板过渡从 350ms 缩短到 120ms，并遵循系统减少动效偏好。点击事件仍由原事件处理器立即触发，改动只控制 CSS 反馈时间。

回归在 Next.js 16.3.8 webpack 生产构建与 loopback 认证 fixture 下通过：浅色、灰色、深色三主题经 `jackyun-theme` 桥切换；原有清单保存格式和当前板块在标签切换及 iframe 重挂载后保留；桌面导航与 390px 手机上的导航/子标签均达到触控高度；移动页面无横向溢出；开启 `prefers-reduced-motion` 后内容面板动画关闭。改动测试文件的 ESLint 与定向 `git diff --check` 通过。该结果不替代真实账号云同步或 iOS/Android 真机验收。

本轮工作分支版本从 3.27.8 增至 3.27.9，包清单、锁文件根包与 `APP_VERSION` 对齐；本机 Node 为 24.19.0。`main` tracking ref 当前为 3.30.4，正式 PR 前仍需同步 main 并依届时版本规则重新定版。代码未合并或推送。


## 19 本轮追加：PracticeTimer 与音乐播放器移动端流程验收（2026-10-21）

PracticeTimer 生产构建下的浏览器流程在 1440px 和 390px 各通过 20 项检查。覆盖课程关联、配置保存与重载、题型搜索、计时状态/阈值、焦点全屏、单题计时和批改、训练报告生成、localStorage 恢复以及移动端无横向溢出。另有离线云控制 fixture 流程通过，覆盖分钟检查点、控制权切换、离线继续计时、恢复网络后上传和旧控制权隔离。该 fixture 模拟 API 状态，不等价于真实 Supabase、多台物理设备或生产权限。

音乐播放器流程在桌面与 390px 手机视口通过：新增歌曲、30 秒间隔、偏移量、单曲循环设置以及 iframe 重挂载后的播放列表与设置恢复。时间接口使用本机响应 stub；真实 Suning 音频服务与跨账号音乐同步未验证。空错误层只在自动化中被清理，测试不隐藏或吞掉有内容的错误提示。

本轮回归扩充按小问题规则把工作分支版本从 3.27.9 增至 3.27.10；包清单、锁文件根包与 `APP_VERSION` 对齐。本机 Node 24.19.0；main tracking ref 3.30.4。改造代码仍保留在 `feat/ui-modernization-shell`，未同步 main、合并或推送。

## 20 本轮追加：QuizWise HTML 版触控、可访问性与完整答题回归（2026-10-21）

HTML 版此前仍作为 `/quiz` 的可选在用流程。本轮为该页面补上键盘焦点描边、移动端 44px 小按钮/开关触控区域、题目进度点 44×44 命中区域、`aria-pressed`/`aria-current`/`role=switch` 状态播报和 `prefers-reduced-motion` 支持；React 外层版本切换器也改为站点共享 Button，并提供可读的 `aria-pressed` 状态。按钮交互仍立即执行，保留现有题目格式、判题时点和 localStorage 键。

完整手机回归覆盖 JSON 导入、自定义科目添加并选择、选择题确认、翻题、成绩计算和 `quizwise_history` 写入；设置开关的 `aria-checked` 和移动触控尺寸也通过。测试首次执行时实际发现自定义科目对象被当成字符串渲染，导致新加科目不可选；修正为渲染其 `name` 字段后全流程通过。现有 QuizWise 浏览器套件同时通过 1440/390px 版本切换和 React 手机答题流程。生产 webpack build 与 TypeScript 通过；定向 ESLint 和脚本语法检查通过。本机 Edge + loopback fixture 不代表真实 Supabase/RLS、设备云恢复或真机体验。

工作分支版本从 3.27.10 按 patch 规则升至 3.27.11；`package.json`、lockfile 根版本与 `APP_VERSION` 一致。本机 `origin/main` tracking ref 对应 3.30.4；远端 main 尚未重新 fetch，不能据此认定最新远程状态。代码仍未合并或推送。

## 21 本轮追加：IELTS 五模块触控与跨轮状态回归（2026-10-21）

`/ielts` 五模块周期的记录入口现在公开展开状态，并关联当前编辑面板；模块状态切换使用 `aria-pressed`，状态、记录和下一轮按钮至少 44px，键盘焦点有品牌色描边。练习字段和 localStorage 写入逻辑未改，未更换周期 schema 或三方合并函数。

新增 390px 生产浏览器回归：保存目标后，将听力模块标为完成并填写证据，将阅读模块标为进行中并填写材料/错因/下一步；开始下一轮后验证完成项重置、未完成项保留且标记顺延，周期历史只追加一次；刷新后重新打开阅读模块仍恢复原草稿。与既有练习保存/重载、写入失败保稿、三主题和 16px/44px 输入检查合计 7 组验收通过。Next.js 16.3.8 webpack 生产构建和 TypeScript 通过，IELTS 两个组件和浏览器用例定向 ESLint 通过。该流程证明本地周期状态保护，不代表真实云同步或跨设备冲突已验证。

分支工作版本由 3.27.11 按 patch 规则增至 3.27.12；包清单、锁文件根版本、`APP_VERSION` 和更新历史一致。本机 main tracking ref 为 3.30.4；远端 main 和生产账号状态未确认，仍不能作为发布版本或合并基线。

## 22 本轮追加：StudyGuide 考试计划草稿保护（2026-10-21）

考试计划生成器的未提交输入现在保存在当前浏览器会话的 `sessionStorage`，切换 StudyGuide 主标签或离开后重新挂载 iframe 时恢复。该草稿仅含考试名称、日期、类型和范围，不写入云端、不改变 `studyguide_progress` 已保存数据格式；成功建立计划后清理草稿。表单控件达到至少 44px 触控高度，移动端输入字号至少 16px，并有品牌色键盘焦点提示。

保存失败处理现在会保留活动计划原状态与表单草稿，并允许用户修复存储空间后重试。结束计划时若持久化失败，页面保留原活动计划，避免界面显示与本机存储不一致。重新构建的 Next.js 16.3.8 webpack 生产预览下，StudyGuide 浏览器回归通过：覆盖标签切换、离开路由后 iframe 重挂载、localStorage 写入失败时保留输入、重试成功、草稿清理、结束计划保存、三主题、清单持久化和 390px 移动导航。该验证使用 loopback 登录 fixture，不代表真实账号云同步或移动真机行为。

工作分支按修复版本规则由 3.27.12 升至 3.27.13；包清单、锁文件根版本、`APP_VERSION` 和更新历史保持一致。本机 main tracking ref 为 3.30.4，远程 main 尚待重新同步；此版本仍是开发分支工作版本，未合并、未推送。

## 23 本轮追加：后台控件移动触控规范（2026-10-21）

后台 11 个在用路由原有约 28px 按钮和不统一的焦点反馈。本轮新增后台局部样式，统一可操作控件最小高度 44px、触屏响应、键盘焦点轮廓和手机 16px 输入字号；不改变权限、提交或保存行为。

Next.js 16.3.8 webpack 构建通过；1440px/390px 检查覆盖 11 个路由并断言可见操作控件至少 44px，同时验证管理员放行、普通/BETA 用户拒绝及游客登录跳转。TypeScript 和定向 ESLint 通过。

更新历史同时去重 7 个旧版本并补齐重点说明；`tests/update-history.test.mts` 的 2 项检查均通过。

工作分支按补丁规则由 3.27.13 升至 3.27.14，`package.json`、lock、`APP_VERSION` 和更新历史一致。Node 24.19.0 与 `.nvmrc` 匹配；本地 `origin/main` tracking ref 是 3.30.4，但 GitHub API 已核实 main 当前包版本 3.31.0。3150 预览曾占用构建文件，构建后已恢复。

GitHub PR #143 仍为 Draft，远程 head 仅到 `cf0ce79`，当前本地改动未推送；远程 CI run `38826074238` 通过，Vercel 旧预览 Ready，但均不包含本轮本地改动。真实账号、多设备、真机和回滚只能在后续提供条件后验收；五批尚未发布。

## 24 本轮追加：日程常用入口共享控件迁移（2026-10-21）

`/schedule` 桌面页的 Cue 管理、添加任务、导入课表此前使用独立原生 Button 样式。本轮改为复用站点 `Button` 的 outline/primary 主题、44px 最小操作高度、focus-visible 轮廓和 `touch-action: manipulation`。手机管理折叠菜单改用清晰的“打开日程管理/关闭日程管理”可访问名称，图标不再污染屏幕阅读器标签。点击仍同步执行既有打开弹窗逻辑，没有新增等待动画、数据写入或状态持久化。

Next.js 16.3.8 webpack 生产构建和 TypeScript 检查通过；CUE 路由回归在 1440px/390px 断言三个桌面入口与手机入口尺寸及触屏属性，并覆盖会话评价、路由离开/返回后题目与评价恢复。另行重跑 CUE 学习设置/自动重练、日程设置保存和 768–1440px 平板/桌面混合学习浏览器流程，均通过；相关四项改动文件的定向 ESLint 通过。以上使用本机生产构建和 loopback fixture，未验证生产身份、云端多设备冲突或真机触摸设备。

工作分支按补丁规则从 `3.27.14` 更新到 `3.27.15`；package、lock 根版本、`APP_VERSION` 和更新历史一致。当前分支仍有未提交改动；没有创建新分支、提交、推送或合并。3150 本机预览已用新构建重启，并保留运行供页面检查。

## 25 本轮追加：StudyGuide 任务助手草稿保护（2026-10-21）

StudyGuide 的“计划与取舍 → 任务写法助手”此前只把生成结果放在 iframe 的内存状态中，切主标签或重挂载 iframe 后会丢失用户输入与结果。本轮将 Subject、Action、Scope、Completion Standard 和“已生成”标记保存在 `sessionStorage` 专用键 `studyguide_task_writer_draft_v1`，页面会话结束即清除，不进入 `studyguide_progress` 或云同步。四个输入设有限长并通过 HTML 转义恢复；修改任一输入立即隐藏旧结果、清空 Copy 状态并要求重新生成，避免复制过期标题。

Next.js 16.3.8 webpack 构建、StudyGuide 内容/兼容检查、定向 ESLint、Node 语法检查和 `git diff --check` 通过。本机生产浏览器流程覆盖桌面/390px、Subject/Action/Scope/完成标准生成、修改后旧结果失效、复制禁用、主标签切换、路由离开/返回重挂载、移动端 44px/16px 输入与 `studyguide_progress` schema 保持不变。该测试使用 loopback 登录 fixture，未验证真实账号云同步，也不声称同步数据格式发生改变。

工作分支按补丁规则从 `3.27.15` 升至 `3.27.16`，`package.json`、`package-lock.json` 根版本、`APP_VERSION` 和更新历史对齐。3150 本机生产预览已用该构建重启，改动仍未提交或合并。

## 26 本轮追加：旧页面语言切换保留运行状态（2026-10-21）

**问题与影响：** `LegacyFrame` 原来把 `lang` 放在 iframe HTML 加载 effect 的依赖中。语言设置跨标签变化时，Next.js Portal 更新语言状态会重新抓取旧 HTML 并重建 `srcDoc`；这会销毁 iframe JavaScript 上下文，可能让页面内存草稿、计时器或临时选择重置。语言切换本身不需要重新启动整个页面。

**实现：** 保留首屏 HTML 注入时的当前语言，运行期语言变化沿用既有 `jackyun-language` postMessage 和旧页翻译 bridge 更新文案。请求拦截脚本同时接收来自同源父窗口的语言消息，更新后续 AI 请求携带的 `interfaceLanguage`。iframe `load` 时会再次读取最新语言，覆盖异步加载期间发生的设置变化。页面地址、账号身份、显示名和运行上下文仍控制重建；本次只消除语言切换引起的无谓重建。

**验证：** Next.js 16.3.8 webpack 生产构建、定向 ESLint、StudyGuide 内容/状态浏览器回归通过。`tests/active-legacy-ui.browser.mjs` 的 19 个 LegacyFrame 路由 × 1440/390px 共 38 个组合通过主题、语言 bridge 与手机触控检查；StudyGuide 另模拟另一标签页更新语言，断言 iframe 文档运行标记不丢失，并截获 `/api/llm-proxy` 请求确认切换英文和切回中文后请求值同步为 `en`/`zh`。8 条 IGCountdown sandbox 内第三方嵌入存储错误被隔离，符合该页面预期。未修改同步协议、存储键、业务数据或服务端权限。

**版本：** 工作版本按补丁规则更新到 `3.27.17`；正式发布号需在未来同步当前 main 后重新确定。当前变更仍留在本地功能分支，未提交、未推送、未合并。

## 27 本轮追加：结束计划保存失败恢复原状态（2026-10-21）

**问题与影响：** `clearExamPlan()` 原先先将内存中的 `activeExamPlan` 设为 `null`，再写入 `studyguide_progress`。若本机存储配额或写入失败，方法虽然没有重绘当前 DOM，却没恢复内存状态；用户之后切换标签触发重绘时，会看见计划创建表单，造成“计划已经结束”的假象，而持久化数据里仍保留旧计划。

**实现：** 保存前保留当前计划对象；写入失败时恢复 `STATE.activeExamPlan` 并显示原有“计划仍保留”提示。成功写入时仍按既有流程清除草稿并重绘。未改变进度 schema、云端数据、同步接口或计时规则。

**验证：** Next.js 16.3.8 webpack 生产构建、更新历史测试、StudyGuide 内容/兼容检查、定向 ESLint 与 `tests/study-guide-state.browser.mjs` 均通过。浏览器测试注入 `studyguide_progress` 写入失败，关闭提示并切换标签后仍显示已启用计划且本地存储保留旧计划；恢复存储后再次结束成功。测试还覆盖考试计划草稿重试、任务助手陈旧结果失效、主题、清单和 390px 移动导航。DOCX 已重新生成并渲染检查。

**版本：** 工作版本按补丁规则更新到 `3.27.18`；正式发布号需在未来同步当前 main 后重新确定。当前变更仍留在本地功能分支，未提交、未推送、未合并。

## 28 本轮追加：错误提示浮层不再阻挡操作（2026-10-21）

**问题与影响：** 云端同步失败时，全局错误通知以高于菜单的层级覆盖页面顶栏。手机用户打开“更多页面操作”后，错误提示卡片会截获菜单项点击，导致全屏等操作看起来没有反应；旧的 StudyGuide 状态测试还移除了通知容器来绕过遮挡，因此没有发现真实问题。

**实现：** 通知固定在顶栏下方，层级低于 Radix DropdownMenu、Dialog 与侧栏；提示文字和卡片表面允许点击穿透，复制、关闭和手动复制文本控件仍可交互。通知按钮维持至少 44px 触控目标。移除了状态测试隐藏通知容器的绕过，并在 390px LegacyFrame 浏览器回归中保持错误提示可见，再实际打开、关闭全屏菜单。

**验证：** Next.js 16.3.8 webpack 生产构建、定向 ESLint、错误码单测和通知浏览器回归通过。通知回归覆盖 1440px/390px、输入焦点保留、卡片区域点击穿透、复制日志脱敏、手动复制、重复错误合并、后台静默和 30 秒自动隐藏。StudyGuide 状态回归在不移除通知节点的情况下通过。`active-legacy-ui.browser.mjs` 的 19 个 LegacyFrame 路由 × 1440/390px 共 38 个组合通过；手机端 StudyGuide 在模拟错误提示仍可见时实际打开“更多页面操作”，进入全屏，再次打开菜单退出全屏。8 条 IGCountdown 沙箱内第三方嵌入错误仍被隔离。验证使用本机生产构建和签名 loopback fixture；真实账号、生产 RLS、云端同步、第二设备和实体手机仍待验证。

**版本：** 工作版本从 `3.27.18` 按补丁规则更新为 `3.27.19`；正式发布号仍须同步 main 后重新定版。变更继续保留在本地功能分支，未提交、未推送、未合并。

## 29 本轮追加：CUE 管理操作目标统一并验证编辑保留（2026-10-21）

**问题与影响：** CUE 管理弹窗在宽屏桌面显示的“详细信息”和“删除”按钮只有约 30px 高；手机 CSS 已设 44px 高，但窄按钮宽度和桌面端规则仍不统一。卡片内容长、操作彼此紧邻，降低了点击准确度。

**实现：** 仅针对知识 CUE 管理弹窗内按钮统一 `min-width/min-height: 44px` 和 `touch-action: manipulation`。复用现有 focus-visible 样式，不改变删除确认、Cue 编辑、学习记录、数据格式或路由行为。

**验证：** Next.js 16.3.8 webpack 生产构建、定向 ESLint、更新历史单测和 `cue-search.browser.mts` 通过。1440px/390px 均通过大标题/小标题/答案/MS 优先级、拼写回退、组合词、清空搜索和触控尺寸回归；手机流程先使用实际“打开日程管理”入口。逐项测量卡片首条的编辑、详细信息、删除按钮，均达到至少 44×44px 且 `touch-action: manipulation`。还通过真实页面编辑 CUE 大标题和答案，回读本机存储确认 Cue ID、状态、复习间隔、连续次数、下一次日期、复习记录和备忘录不变。`cue-route-draft.browser.mts` 与 `cue-session-settings.browser.mts` 在同一生产预览通过。验证仅为本机浏览器模拟，不代表实体触屏、生产云端持久化或真实账号接续。

**版本：** 工作版本从 `3.27.19` 按修复版本规则更新为 `3.27.20`；正式版本仍需同步 main 后重新定版。保持在本地功能分支，未提交、未推送、未合并。

## 30 本轮追加：手机 CUE 管理入口与编辑保留回归（2026-10-21）

**修正：** CUE 搜索浏览器测试在 390px 下等待仅桌面可见的“日程视图”导航，之前导致测试误报超时。测试现通过真实“打开日程管理”入口进入 Cue 管理；没有改动产品导航权限。

**编辑验证：** 在 1440px 和 390px 页面分别实际打开 CUE 管理、搜索和编辑一条 Cue。保存后检查本机 `jackyun_schedule_control_v1`，确认 Cue ID 不变，version 只增加一次，状态、复习间隔、连续次数、下次复习日期、既有复习记录和备忘录都保留。配套 `cue-editing.test.mts` 修正了过期顶栏断言；该断言原要求手机另有一个刷新按钮，而当前顶栏已经把刷新放入统一菜单。

**结果：** `cue-search.browser.mts` 两种视口通过，截图保存到 `artifacts/verification/cue-search-v32720/`；`cue-route-draft.browser.mts`、`cue-session-settings.browser.mts` 和 Cue 编辑单测通过。此为本机模拟，不代表生产云端写入或真机验收。

**版本：** 验收修正后的工作版本按 patch 规则由 `3.27.20` 更新到 `3.27.21`；package、lock、`APP_VERSION`、更新历史和本报告保持一致。本地分支继续保留，未提交、未推送、未合并。

## 31 本轮追加：本机生产预览复验与点击反馈测量（2026-10-21）

**复验：** 在 `3.27.21`、Next.js 16.3.8 生产构建及 loopback fixture 下，StudyGuide 状态、阅读工坊 5 项、音乐与客服桌面/手机、主站壳层 4 视口、认证/通知 7 组、设置 16 项、移动导航 5 尺寸、QuizWise React/HTML 和 19 个 LegacyFrame 路由 × 1440/390px 均通过。管理员 11 路由 × 2 视口、权限拒绝/游客跳转及公告 CRUD fixture 也通过。

**环境：** `3150` 未设置本机 `SUPABASE_SERVICE_ROLE_KEY`，使 `/admin/users` 进入错误边界；以本机占位键在 `3152` 复测后管理员流程通过。此为启动环境差异，不据此判断生产页面故障；未使用真实密钥，原 `3150` 预览保持不变。

**点击反馈代理指标：** Windows、Edge 155、1440×1000、生产 webpack、无 CPU/网络限流的匿名 loopback fixture 下，pointerdown 至计时面板 DOM 可见并经过两次 animation frame 的中位数为 20.5ms、P95 为 22.0ms、最大值为 22.2ms；草稿保留通过、页面错误为 0、加载 JavaScript 编码字节约 582,062。它不是实际绘制时间、INP 或线上数据，也没有同环境改造前基线，不能作为相对提速结论。

**边界：** 以上仅证明本机 fixture 的页面回归；真实 Auth/RLS、管理员数据库写入、云端持久化、多设备、实体手机、弱网和远程 Actions 仍未验证。本轮只更新验收记录，未改业务代码、依赖或应用版本；仍未提交、未推送、未合并。

## 32 本轮追加：离线恢复与多设备冲突保护复验（2026-10-21）

**验证范围：** 在当前工作区直接重跑 `node --test tests/sync-engine.test.mts tests/workspace-sync-recovery.test.mts tests/sync-stale-remote.test.mjs tests/practice-cloud-offline.test.mts tests/practice-cloud-frame.test.mts tests/practice-cloud-route.test.mts tests/study-concurrency.test.mts tests/sync-v2.test.mts`，65 项通过，0 项失败。覆盖旧设备时钟异常仍保留双方新增数据、离线恢复后上传最新本地计时、冲突期间继续编辑时保留新草稿、冲突解决前重新检查云端版本并拒绝覆盖较新云端数据、远端删除与本地编辑形成显式冲突、重连重试和多标签页并发写入。

**结论与限制：** 这些测试证明本地同步引擎、API 契约和恢复逻辑有自动化回归保护；测试使用模拟服务或隔离 fixture，不能证明真实 Supabase/RLS、真实账号下两台设备同时编辑、旧设备恢复在线的生产时序或移动真机行为。后续获得双设备与隔离账号后，仍需按计划执行真实端到端冲突演练。本轮只复跑测试并更新验收报告；未修改业务代码、数据模型、同步协议或应用版本，也未提交、推送或合并。

## 33 本轮追加：清理全仓 ESLint 阻塞（2026-10-21）

**修复：** 首次全仓 ESLint 发现 6 个动态测试夹具文件共有 30 个错误，集中在 VM/browser mock 的动态值类型和 Next.js 的 `module` 命名规则；另有同步 fixture 的 1 条未使用解构字段警告。只在这些测试夹具文件说明并限制动态边界相关 lint 规则、修正变量命名和无用字段，没有改产品组件、业务逻辑或同步实现。

**验证：** `node node_modules/eslint/bin/eslint.js .` 无错误、无警告；`node node_modules/typescript/bin/tsc --noEmit` 通过。同步和 PracticeTimer 相关 65 项单测、PracticeTimer 桌面/390px 云端浏览器流程、Dida 日程桌面浏览器流程及工具页 10 项 UI 浏览器流程通过。Next.js 16.3.8 webpack 生产构建在临时独立输出目录通过，生成 95 个静态/动态路由条目；构建后恢复自动变化的 `tsconfig.json` 和临时 `next.config.ts` 设置，并清理临时产物，原有 3150 预览仍返回 HTTP 200。应用版本按小修规则从 `3.27.21` 更新至 `3.27.22`，`package.json`、lock 根包、`APP_VERSION`、更新历史和本报告保持一致。

**边界：** 全仓静态检查和本机 fixture 通过不代表真实 Auth/RLS、双设备生产并发、远程 CI、线上性能或真机验证。没有修改同步协议和用户数据，也未提交、推送或合并。

## 34 本轮追加：阅读工坊完整本机交互回归（2026-10-21）

**结果：** 新增本机 AI fixture 流程：SSE 生成→查词→测验→完成→统计/书架重开；断言 localStorage 保留文章、词汇、成绩和完成次数。桌面/390px入口、懒加载与页面错误检查通过。

**边界：** 浏览器跑在 `3150` 的 `3.27.21` 预览，阅读工坊源码未变；`3.27.23` 构建通过但未作浏览器测试（临时环境缺 Supabase 变量）。mock 不代表真实 AI、云同步、Auth/RLS 或跨设备。版本 `.22→.23` 已对齐；本地未提交、推送或合并。

## 35 本轮追加：旧页面加载失败恢复（2026-10-21）

**改进：** `LegacyFrame` 获取静态 HTML 失败时显示可访问的错误提示，并提供重试控件；加载中状态使用 `role=status`。重试复用原有语言、主题和数据桥接，不改变页面或用户数据格式。

**验证：** 当前 worktree 的 Next.js 开发服务使用 `localhost:3153`。浏览器回归先让 `/StudyGuide.html` 返回一次 503，再点重试并确认第二次请求成功；随后 19 个在用 iframe 路由在 1440px 和 390px 下通过主题与语言桥检查，StudyGuide 手机全屏与错误提示操作也通过。涉及组件/测试的 ESLint 和全仓 TypeScript 检查通过。

**边界：** 本机 fixture 只验证静态页面失败恢复和 UI，不代表公网 CDN、生产服务端或真机网络行为。版本按小修规则由 `3.27.23` 更新至 `3.27.24`；本地未提交、推送或合并。

## 36 本轮追加：设置搜索保留 hydration 前输入（2026-10-21）

**问题与修复：** 已登录设置页在 JS chunk 尚未完成 hydration 时，搜索框会先显示；此时输入的文字会被 React 受控值覆盖。本机延迟 chunk 复现确认输入“离线”会被清空。搜索框改为保留原生输入值，并在客户端挂载后将早期输入同步到筛选状态；分类过滤和按需加载策略不变。

**验证：** 设置浏览器回归主动延迟客户端 chunk 1.5 秒，在 hydration 前输入“离线”，确认 hydration 后文本保留且显示 1 个匹配分类；其余桌面分类切换、11 个用户可访问分类按需加载、390px 下拉分类切换与触控尺寸共 16 项通过。登录导航与权限 fixture 7 项、StudyGuide 状态回归、19 个 LegacyFrame 路由 × 桌面/手机共 38 组主题和语言桥回归均通过。

**环境限制：** 设置搜索测试使用本机开发服务器和签名 loopback fixture；管理员 `/admin/users` 在本机因未配置 `SUPABASE_SERVICE_ROLE_KEY` 进入错误边界，真实管理数据读取/写入仍待具备隔离服务凭证后验收。真实 Auth/RLS、云同步、第二设备、实体手机、远端 CI 与回退演练继续未验证。版本按小修规则由 `3.27.24` 更新到 `3.27.25`；未提交、推送或合并。

## 37 本轮追加：工具箱保留 hydration 前文本输入（2026-10-22）

**问题与修复：** 工具箱的 TextTools 在客户端 JS 尚未 hydration 时会先显示受控文本框；启动阶段输入的内容可能被 React 初始状态覆盖。根 layout 在 Next.js hydration 前监听带有 `data-jy-early-input` 标记的输入框，仅在页面内存暂存文本，并通过一次性会话事件同步到既有 `ToolDraftProvider`。没有写入 localStorage、云端或既有业务数据；切换工具面板仍按原本的页面会话状态保留。

**验证：** 使用 Next.js 开发服务和 loopback 页面，延迟客户端 chunk 1.5 秒后在 hydration 前输入，确认输入字符数和文本保留；工具箱 10 项浏览器流程通过，覆盖文本转换、工具标签/键盘操作、输入草稿保留、剪贴板失败和过期响应、按需加载的 Word 导出、真实 DOCX 内容、三主题、Dialog 焦点、390px 触控和减少动效，以及指定懒加载 chunk 失败后的面板重试。设置页 16 项和认证/权限导航 7 项回归通过；相关 ESLint 与全仓 TypeScript 检查通过。

**边界：** 浏览器回归在本机开发服务与隔离 fixture 上完成，不代表线上 JS 加载时间、真实 Auth/RLS、云端数据同步或实体手机验证。管理员用户页仍需要真实的 `SUPABASE_SERVICE_ROLE_KEY` 服务端凭证；真实双设备、远端 CI、部署与回退演练未完成。版本按小修规则由 `3.27.25` 更新到 `3.27.26`；本地未提交、推送或合并。


## 38 本轮追加：导航提示对齐与轻量交互动效（2026-10-22）

**问题与修复：** 侧栏切页时的“正在打开页面…”提示原来使用行内弹性布局；关闭按钮没有单独的居中布局，图标和文本也依赖字体基线，窄屏时容易显得歪斜。现改为安全区感知、固定视口居中的网格提示，图标、文字、重试入口和关闭按钮统一对齐，并加入 160ms 的轻微淡入/上移效果；加载环使用 CSS 绘制，避免字体缺字。共享 Button 增加 120ms 的悬停抬起和按压回位反馈；点击事件仍在原有 React handler 中即时触发，不等待动画。系统减少动效偏好会停用提示入场动画和相关过渡。

**验证：** 新增 `tests/navigation-feedback.browser.mjs`，在 localhost:3153 检查 1440px 桌面与 390px 手机视口中的提示居中、图标/文案/关闭按钮垂直对齐、关闭响应、shared Button 悬停 transform 与不超过 120ms 的反馈时长，以及 reduced-motion 动画关闭；全部通过。源文件 ESLint、全仓 TypeScript 检查通过；Next.js 16.3.8 webpack 生产构建在隔离输出目录成功，生成 95 个路由条目。

**边界：** 本次验证覆盖本机浏览器的布局与 CSS 动效偏好，不代表线上加载速度或实体手机实测。应用补丁版本从 `3.27.26` 更新到 `3.27.28`，package/lock/APP_VERSION/更新历史对齐；未提交、推送或合并。

## 39 本轮追加：阅读页 hydration 前首击保护（2026-10-22）

**问题与修复：** 阅读页在 HTML 已显示、React 客户端模块仍加载时，点击“AI 阅读工坊”没有响应；用户必须等页面完全启动后再点一次。仅对这个可见入口增加 hydration 前的一次性点击暂存：模块挂载并发出就绪事件后，重新定位当前按钮并重放一次。队列消费后立即清除，不会因组件就绪事件自动打开工坊；常规阅读书架仍为默认页面。没有修改路由、文章/书架数据格式或 AI 接口。

**验证：** `tests/reading-studio.browser.mjs` 人为阻塞阅读模块 chunk，在按钮仍可见时点击，确认点击进入队列；释放 chunk 后确认工坊打开且队列消费。常规冷启动保持书架默认，避免自动打开回归。阅读工坊桌面与 390px 手机流程、延迟生成/查词/测验 fixture、书架本地记录与页面错误检查通过。其他本机回归：shell/auth 导航 7 项、设置 16 项、快速任务 4 项、Quiz 桌面/手机、公告 CRUD fixture、客服桌面/手机、StudyGuide 状态与草稿恢复、资源目录 5 项、IELTS 仪表盘 7 项均通过。

**性能证据与限制：** 修正后的标签测量先确认 React 已接管并实际保存草稿，再统计 50 次暖态标签切换；本机 Windows/Edge 155、1440×1000、Next.js 开发服务器、无限流，P50 25ms、P95 31ms、最大 37.7ms，草稿保留，页面错误 0，编码 JavaScript 约 1,757,840 bytes。此数据是开发环境的本地交互代理值，不是生产基线、INP 或真实绘制性能；不能据此声称线上提速。此前一次工具箱冷启动回归在“使用说明”弹窗处出现时序性无响应；本轮按延迟客户端 chunk 环境完整复跑后，工具箱 10 项全部通过，暂未复现，故保留为低频时序风险而非声称修复。最新代码的全仓 TypeScript 检查、涉及文件 ESLint、阅读页 7 项延迟 hydration/交互回归、工具箱 10 项回归和导航提示桌面/手机动效回归均通过；最新代码未重跑生产构建。

**版本与交付边界：** 工作分支版本由 `3.27.28` 按小修规则更新为 `3.27.29`，package、lock、APP_VERSION 和更新历史同步。当前 worktree `main` 的版本为 `3.32.0`；由于用户要求不合并，本分支版本只代表当前开发快照，后续合并前需要同步 main 并按实际版本规则重新定版。本地预览 `http://localhost:3153/reading` 保持运行。报告 DOCX 已由 Markdown 重新生成并渲染为 22 页，末页内容和分页已检查。没有提交、推送或合并。真实生产 Auth/RLS、云端同步、第二台设备、实体手机、远程 CI 和最新代码生产构建仍未验证。

## 40 本轮追加：隔离生产构建与 UI 门禁复验（2026-10-22）

**生产构建：** 为避免覆盖当前开发预览的 `.next` 产物，在 worktree 内复制应用源文件并复用本地 `node_modules`，使用独立输出目录执行 `next build --webpack`。Next.js `16.3.8` 编译成功，TypeScript 检查成功，95/95 静态页面生成成功并完成优化与 trace 收集；临时副本随后删除，`localhost:3153/reading` 仍返回 HTTP 200。构建使用本机占位 Supabase URL/key，不访问真实项目，也不代表部署或线上行为。

**UI 门禁：** 生产构建前当前源码全仓 TypeScript 检查、涉及文件 ESLint 通过；延迟 chunk 下阅读页 7 项和工具箱 10 项浏览器回归通过；导航提示 1440px/390px 对齐、关闭响应、按钮反馈及 reduced-motion 检查通过。暖态标签交互开发机样本仍为 50 次、P50 25ms、P95 31ms、max 37.7ms，不能当作线上 INP 或与改造前对照的提速结论。

**剩余验收：** 生产配置下真实 Auth/RLS、管理员真实写入、云端同步与双设备接续、Android/iOS 真机、弱网以及远程 CI/部署回退仍未验证；目前用户只授权本机验收。没有改同步协议、用户数据模型或外部部署。

**版本与交付边界：** 工作快照由 `3.27.29` 按 patch 规则更新为 `3.27.30`，package、lock、APP_VERSION 与更新历史同步；当前 worktree `main` 仍为 `3.32.0`。遵照用户要求不合并，正式合并前需先同步 main 并重新确定版本。没有提交、推送或合并。

## 41 本轮追加：在用旧页面与状态续接回归（2026-10-22）

**旧页面覆盖：** 本机签名 loopback fixture 下，19 个当前在用 LegacyFrame 路由分别在 1440px 与 390px 打开；38 组均通过加载完成、深/浅/灰主题消息桥和嵌入布局检查。模拟 StudyGuide 首次静态 HTML 503 后通过重试成功；IGCountdown 沙箱隔离的 8 条预期存储错误均未泄漏到父页面。此项只兼容主站实际入口中的 iframe，不扩张为对备份或独立旧站的迁移。

**状态续接：** 答题卡桌面/手机各验证编辑数据在 iframe 重挂后恢复；音乐播放页桌面/手机验证播放列表、间隔、位置偏移和播放模式在 remount 后保留；倒计时验证事件配置在 iframe remount 后保留。均使用本机浏览器和 fixture，不代表跨设备云端数据接续。

**验收边界：** 上述定向浏览器回归全部通过。生产构建结果见第 40 节；本轮没有修改 iframe 数据桥、同步协议或业务数据格式。真实 Supabase Auth/RLS、第二设备并发编辑、Android/iOS 真机、远程 CI、线上性能与部署回退仍待外部条件具备后验证。

**版本与交付边界：** 工作快照由 `3.27.30` 按 patch 规则更新为 `3.27.31`，package、lock、APP_VERSION 与更新历史同步；main 仍为 `3.32.0`。依用户要求继续留在 `feat/ui-modernization-shell`，不提交、推送或合并。

## 42 本轮追加：管理员与公告操作隔离验收（2026-10-22）

**管理员路由：** 3153 预览缺少服务端 `SUPABASE_SERVICE_ROLE_KEY`，初次执行在 `/admin/users` 进入应用错误边界。为区分产品缺陷与测试配置，在 worktree 内建立独立临时应用副本，在 3154 启动 Next.js 开发服务器，配置只在本机生效的占位 Supabase URL/key；浏览器仅请求 loopback fixture。管理员 11 个页面路由分别在 1440px 与 390px 验证，共 22 组通过。普通用户和 BETA fixture 访问后台均按预期拒绝，游客路径保留。没有读取或使用真实密钥、账号或管理数据。

**公告操作：** 在同一个隔离 fixture 下，创建、编辑、停用、重新启用、删除确认以及取消删除流程全部通过。数据库写操作只落到测试 fixture 的内存状态；未请求真实 Supabase。

**环境收尾与边界：** 临时 3154 服务已停止，测试副本和其 node_modules junction 已删除；用户预览 `localhost:3153/reading` 仍返回 HTTP 200。以上不证明生产 Auth/RLS 或真实管理员数据库写入。真实账号、云同步、双设备、真机、远程 CI 与生产发布仍未验证。

**版本与交付边界：** 工作快照由 `3.27.31` 按 patch 规则更新为 `3.27.32`，package、lock、APP_VERSION 与更新历史同步；main 仍为 `3.32.0`。遵照用户要求不提交、推送或合并。

## 43 本轮追加：同步与计时保护回归复验（2026-10-22）

**结果：** 在当前源码执行 8 组本机单测：`sync-engine`、`workspace-sync-recovery`、`sync-stale-remote`、Practice Timer offline/frame/route、`study-concurrency` 和 `sync-v2`。65 项通过，0 项失败。包含多标签页低频请求、隐藏与离线暂停、断网恢复上传、晚回执期间保留较新编辑、旧设备时钟异常下保留双方新增数据、冲突时显式选择、旧 token/owner 拒绝及计时控制权边界。

**范围限制：** 这些测试证明本地同步契约和并发保护的自动化回归未被 UI 改造破坏；使用模拟服务和本机数据，不能证明真实 Supabase/RLS、两台实体设备同时编辑、旧设备离线后生产重连或跨设备身份接续。未修改同步协议、schema、用户数据或云端接口。

**版本与交付边界：** 工作快照由 `3.27.32` 按 patch 规则更新为 `3.27.33`，package、lock、APP_VERSION 与更新历史同步；分支保持 `feat/ui-modernization-shell`。不提交、推送或合并。
