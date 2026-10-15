> 本文件保存实施前的审查计划，调查与操作记录反映当时状态。第一批实际改动、测试和未完成事项见同目录 README.md。

# JackYun 主站 UI 现代化改造实施计划

> 审查修订稿 · 2026-10-16 · 规划交付，不含UI迁移；临时准备纠正见附录B。

## 1 执行摘要及改造目标

JackYun 主站 UI 现代化改造实施计划｜审查修订稿｜2026 年 10 月 16 日。规划基线 main b6f3078，manifest 3.24.4。面向后续前端开发、测试和发布审查。

结论：保留 Next.js、React、TypeScript、Tailwind CSS 3、data-theme 和蓝色品牌，渐进接入 shadcn/ui + Radix 可行。先保护数据与行为，再统一基础交互；不能将换库本身当作性能收益证据。新增依赖精确组合、生产开放范围、真实性能与真机结果均待验证。

本轮交付仅为调查和规划，未改业务代码、版本或锁文件，未提交或推送。曾误建临时隔离分支并按现有锁文件安装依赖，已核对无修改并清理，详见附录B。产物位于仓库外；通用AGENTS.md不取消本任务的仅规划约束。

### 必须修正的执行原则

从 main 直接开发改为隔离工作区、feat/ui-modernization 和分批 PR；先审计复用，不强制替换现有能力；按真实入口冻结范围，不按文件数量扩项；多设备并发、旧设备重连与晚回执列为高风险流程的发布阻断项。

体验目标是点击立即反馈、面板快速可用、普通切换不丢草稿、计时不中断、主题与触屏一致。保留现有 URL、权限与数据契约。非目标包括改同步协议/数据模型、升级 Tailwind、大型全局状态库、全站动效系统、独立旧站和备份重做。

最小交付先做基础组件、工具箱完整流程和即时确认，再做主站导航。前两批完成不代表全站迁移完成；在用旧 HTML 首轮只做有作用域的兼容改造，不承诺全转 React。

## 2 当前架构与依赖核实

| 项目 | 实际结果 | 依据 |
| --- | --- | --- |
| 运行环境 | Node声明 >=22；.node-version 24.19.0 | package.json:5–7；.node-version:1 |
| 框架与类型 | 锁定 Next16.3.8、React/DOM19.2.8、TypeScript5.9.3 | package.json:90–115；package-lock.json |
| 样式与工具 | Tailwind3.4.17、clsx2.1.1、tailwind-merge2.6.1；已有cn() | 锁文件；src/lib/utils.ts:1–6 |
| UI依赖 | src/components/ui不存在；manifest/lock无Radix、shadcn、Sonner、Vaul | 本轮路径/依赖静态搜索 |
| 构建与路由 | App Router；standalone；next build --webpack；region hnd1 | next.config.ts:3–5；package.json:21；vercel.json:1–6 |
| TS配置 | strict、bundler、react-jsx、@/*别名 | tsconfig.json |
| 数据客户端 | 锁定supabase-js2.97.0、ssr0.6.1；工作区同步有Azure转发 | 锁文件；src/lib/sync/azure-proxy.ts:6–18 |

声明范围与锁定版本分别核对，不能把 ^3.4.17 当成实际安装版本。只确认当前组合和接入路径，目标UI依赖还未安装，所以没有“精确兼容通过”结论。

根 / 跳 /dashboard；产品在 (portal)，账号在 (auth)，后台有独立 /admin layout。PortalLayout先读claims再并行读取偏好、导航使用、资料、BETA及权益，挂载同步、休眠、播放器与浮动计时。共享layout不应随pathname重新key化。

已有 portal/loading.tsx。首页先读用户后等待八项并行统计；日程先读身份/角色，再返回内层Suspense，内层不能覆盖其之前的await。不应靠再加Skeleton假装减少数据等待。

依据均相对 jackyun-portal：src/app/page.tsx:1–5；src/app/(portal)/layout.tsx:37–69,121–145；dashboard/page.tsx:110–157；schedule/page.tsx:10–18。

## 2 Git 权限与部署调查

本轮只读 ls-remote 核实远程 main 与本机HEAD均为 b6f3078dfcc00d614980b78452da2b783c01320d。当前分支main；37个受控文件变更、227个未跟踪文件条目（-uall），暂存为空。完整status和内容指纹保存在仓库外。提交一致不代表工作区干净，更不代表生产已部署此SHA。

版本差异：manifest和lock根版本3.24.4，src/lib/utils.ts:14的APP_VERSION仍3.24.2，update-history.ts首条3.24.2。本轮只记录，正式发布前统一版本来源与部署信息。

proxy允许无账号产品本机模式，仅/admin与/account-status强制登录；有cookie还检查授权/账号状态。Sidebar protected表示不可隐藏，绝不是需要登录。adminOnly、betaOnly、featureKey与变体过滤不替代服务端授权。

/beta要求登录且accepted；/studio无用户重定向；/review、/study/tasks游客显示引导；/reading受开关/BETA/套餐限制。AdminLayout复核管理员，并在特定路径有角色写入；本轮不通过访问管理员页面冒充只读验证。

受控文件中未发现.github/workflows。package有verify/lint/node:test和浏览器脚本，但不能证明PR必需检查已接入。deploy/deploy.sh.example含安装、部分测试、standalone构建和切目录示例；vercel.json仅给region。生产托管、自动部署、预览、branch protection均待验证。

README记载Azure同步迁移与历史测试，不等于本轮线上事实。当前后端由环境配置选择，本轮未读凭据/用户数据，未执行数据库请求。

依据：src/proxy.ts:7–8,33–84,121–159；sidebar.tsx:132–138；admin/layout.tsx:10–23；deploy/deploy.sh.example:9–24；README.md:34–42。

## 3 在用页面清单与范围冻结

附录A从真实导航生成32个一级入口及明确子入口，每条列名称/路由、进入路径、权限、基础UI和子流程、加载、保留状态、批次、验收。标记为“源码入口确认、生产开放待验证”，不伪称已逐页访问线上。

| 类别 | 含义 | 处理规则 |
| --- | --- | --- |
| A 源码入口 | 导航或在用页面有直接链接 | 候选纳入；隔离预览确认当前可达 |
| C 条件入口 | 管理员/BETA/权益/变体/账号流程 | 按测试身份验证，不为迁移打开未启用功能 |
| V 待验证 | 只有路由或动态配置，实际入口不明 | 隔离清单；确认前不计承诺工期 |
| X 排除 | 备份、历史副本、独立旧站或已下线入口 | 不改不删，不因公共CSS被动损坏 |

用户隐藏偏好不是功能下线；音乐/答题卡变体不假定同时显示。PAGE_PROFILES有条目也不证明当前导航可达。批次一前用游客、普通、BETA、管理员核对候选，记录环境URL、部署SHA、开关、入口证据与日期，冻结实际集合。缺角色数据的功能仅回归拒绝/隐藏。

范围仅当前主站同源页面及必要流程；外链资源、第三方站、手表App和Companion扩展本体不重做。/products有设置/全屏帮助/更新页入口并rewrite至products.html，纳入主站关联页兼容，不扩成独立站重设计。

### 验收代号

U：导航/角色/主题/基础交互；F：表单/浮层/草稿/防重复；D：持久化/离线/并发；T：计时/快捷键/接管；I：iframe桥接/PWA/主题；A：后台权限与危险操作。每项必须U，其他代号引用第10节矩阵，不能截图通过。

## 4 现有UI组件审计

| 类别与实例 | 处理决定 | 理由与风险 |
| --- | --- | --- |
| 已符合：cn、品牌、AuthModeProvider、同步/离线服务 | 保留，UI不另造第二份单例 | 避免重复工具/Provider与数据所有者 |
| 可适配：siteAlert/Confirm/Prompt | 保留Promise、原生dialog、队列和全屏接口 | React/iframe共用；Radix不能仅凭z-index越过top layer |
| 修复复用：Sidebar抽屉、通知、全屏帮助 | 保留事件/入口，逐项统一外壳 | 已有inert、焦点限制与恢复，不能删后重造 |
| 基础壳替换：ToolsTabs、普通表单、CreatePlanDialog | 统一组件，先明确草稿所有者 | 条件卸载已存在，套新Tabs并不能自动保留 |
| 重复实现：按钮、菜单、模态边框 | 同语义才合并，不全局替换div/button | 原生Select在手机简单选项场景应保留 |
| 复杂业务：Schedule/Cue、计时、写作/阅读 | 只换展示输入壳，保留controller和业务writer | 用时、证据、进度和并发不是基础UI |

没有src/components/ui不等于没有可复用UI。error-notices已有错误码、去重、后台静默及日志导出；visible-poll已有串行与退避。Sonner不作为必装项，避免双Toast；成功提示先复用notice。

SupportConversationDialog草稿存在state；关闭/重挂载可能丢失，send入口未见pending同步阻止条件。是否产生重复业务写入待验证；应检查连续Enter/点击时的请求次数与实际结果，不把潜在风险写成已复现BUG。

依据：src/lib/utils.ts:1–6；src/lib/site-dialog.ts:1–17；public/shared/site-dialog.js:9–38；public/shared/error-notices.js:66–143；src/lib/visible-poll.ts:1–19；support-conversation-dialog.tsx:22–68。

## 5 技术架构与依赖兼容策略

固定选择shadcn/ui源码分发与Radix Primitives，保留Tailwind3与已有cn。不引入其他同类库或全局状态框架；基础控件集中src/components/ui，业务逻辑留在领域组件。

从可审阅、支持v3的组件源码获取最小Button/Input/Tabs/Dialog，记录上游URL、revision和本地差异。不得盲用latest CLI接受其对全局CSS/别名/依赖的全部改写，也不连带升级tailwind-merge或React。

批次一隔离工作区先审peerDependencies、React19类型和Next16边界，再锁定版本。执行npm ci重现、npm ls排查重复React、类型/lint/生产构建及hydration检查。精确新增版本待该门禁确认，本轮不虚构或安装。官方对v3和React19的分开说明不能视为精确组合已通过。

### 基础组件接口

Button沿用原生props/type/ref/disabled，增加busy；默认type=button，busy提供aria-busy与同步in-flight守卫。按压动画不加事件延迟、全局防抖或点击等待。链接使用next/link，不嵌套button/a，不造Router。

Dialog/Sheet采用open/onOpenChange，调用方掌握draft与写入；提供portalContainer和loading/error/ready状态。Tabs使用受控value；lazy加载与状态保留按业务分类。原生Select用于普通选项，复杂选择才用Radix Select。

仅交互叶子use client，不将PortalLayout全客户端化。保留所有URL、Server Action/API、payload、存储key/schema、revision/hash、owner/token和事件名。需要改变契约的需求独立提案。图标沿用现有资源，按需增补；不为模板引入整套图表/表单/动画。

依据：package.json:73–121；src/lib/utils.ts:1–6；tsconfig.json；所装Next的server-and-client-components文档；官方资料见附录B。

## 6 三主题与设计Token规范

| Token类别 | 映射与默认规则 | 验收 |
| --- | --- | --- |
| 品牌/前景 | 复用brand/brand-strong/foreground，补on-brand | 深色浅蓝按钮不硬编码白字 |
| 背景/文字层级 | background/card/muted-foreground，补popover/muted/secondary-text | 三主题正文与弱文字可读 |
| 交互与状态 | ui-hover/active/focus、disabled-fg/bg及success/warning/error前景/表面 | 不只靠颜色；焦点轮廓明确 |
| 边框/阴影/圆角 | card-border/surface-shadow；新控件8px、面板12px、弹层16px | 只作用新组件，不全局改旧页 |
| 间距/触控 | 4px刻度；常用目标>=44 CSS px | 390/768/1024/1440及200%缩放 |
| 动效 | 沿用120/200ms，优先transform/opacity | 系统/全局/页面reduced-motion均生效 |

保留html[data-theme=light|gray|dark]、jackyun_theme和云字段；主题应用收敛为单一入口，但沿用既有本机/云端优先级与更新时间语义，不重新定义偏好同步规则。

现有darkMode=media与data-theme不一致。新UI优先Token；在用React中的dark:逐批改为显式主题感知。后台容器当前强制data-theme=dark，选择器必须支持就近边界，不能只看系统或给全站粗暴套.dark。

CSS变量现为完整/十六进制颜色，不能直接套hsl(var())。新token与reset限主站/新UI作用域；旧HTML按页面确认后适配，防止破坏备份和关联静态页面。

Portal来自触发处最近主题边界，默认在同主题overlay root；全屏使用document.fullscreenElement内的同主题容器。Shadow DOM确认框沿用原生dialog top layer；菜单先关闭再开Dialog，不在原生dialog上靠高z-index叠Radix。页面级关闭动效要复制到Portal上下文。

依据：globals.css:20–78,213–215,386；layout.tsx:32；theme-provider.tsx:6–16；topbar.tsx:88–103；cloud-settings-hydrator.tsx:36–44；admin/layout.tsx:23。

## 6 弹窗 菜单与Button交互规范

| 类型 | 打开关闭 | 数据/交互约束 |
| --- | --- | --- |
| 即时确认 | 保留siteConfirm；取消初始焦点，Esc取消顶层 | 串行Promise只结算一次，无额外请求 |
| 异步数据 | 立即反馈+loading，关键内容可交互后才ready | 失败可重试；关闭Abort读取或忽略过期响应 |
| 表单编辑 | 草稿属调用方；dirty关闭确认；保存中防连点 | 失败留输入；成功只清对应提交draft |
| 移动/全屏 | dvh/safe-area，软键盘下可到达操作区 | 不强制全屏；保留不支持Fullscreen时帮助 |
| 嵌套菜单/浮层 | 打开新弹窗前关菜单，顶层接管Tab/Esc | 恢复到触发器；触发器卸载则回安全锚点 |

统一normal/hover/active/focus-visible/disabled/busy。busy保持文案和布局，除disabled外用同步in-flight ref防止下一render前重入；非提交按钮不随意全页禁用。按压效果不延迟实际事件。

读取结果按resourceId与打开代次generation核对，fetch可Abort；不可取消的Server Action忽略失效读取结果。写操作关闭并不撤销已成功服务端写入，继续遵守原有版本/幂等边界，不另造UI写协议。

keyboard-shortcuts当前用document.querySelector找关闭按钮。迁移后浮层接管Esc并阻止重复冒泡；全局导航仅在无激活浮层、非输入/contenteditable/IME composition时运行，禁止一次Esc关多层。

异步空壳标aria-busy，数据不齐禁用危险操作；首壳、ready、业务完成分别记录。错误沿用原诊断通知；关注键盘/触屏、focus恢复、body滚动锁、全屏嵌套与系统减少动效。

依据：keyboard-shortcuts.tsx:12–39；support-conversation-dialog.tsx:30–68；fullscreen-button.tsx:15–27；public/shared/site-dialog.js:25–35。

## 7 状态管理与标签页保留

| 状态层级 | 所有者与策略 | 禁止事项 |
| --- | --- | --- |
| 临时UI | hover/菜单/动画在叶子，关闭可丢弃 | 不逐次持久化或入云 |
| 页面会话 | 工具输入/筛选/输出在父级useState/useReducer或小Context | 不全forceMount，不因Tabs卸载丢草稿 |
| 未提交编辑 | 按实体ID留在业务所有者，关键草稿沿用既有持久化 | 不mount默认写空，不仅靠unmount保存 |
| 业务已保存 | 继续Server Action/localWriter/领域快照 | 不新建第二份权威缓存 |
| 离线恢复 | 既有tasks/review/reading IndexedDB与本机镜像 | 不清outbox、不换key/schema |
| 跨设备同步 | 既有revision/hash与owner/token、冲突UI | 不按设备时间选赢家，不自动替用户解冲突 |

工具箱：ToolsTabs条件挂载，文本/转换参数/输出提升到父级，首次访问lazy import；隐藏时停校时等非必要任务，Word重依赖按执行加载。新增会话草稿不默认承诺跨刷新恢复。

设置：约十五类条件面板；自动保存走现有pending settings，未提交资料/连接输入留会话父级；密码和敏感令牌不持久化。dirty离开类别提示；不为了保留state一次挂所有面板。

客服：按ticketId保留会话draft；详情隐藏暂停自身轮询，公共通知仍按原策略；过期结果不能回写当前ticket。写作/定义卡/性质卡/阅读/答题沿用draft、session、镜像与进度；恢复失败保留副本。

日程/Cue/计时：业务controller稳定，展示层可隐藏；不以tab/theme/pathname为重挂key。隐藏面板停非必要任务，但心跳、检查点、计时继续遵循原规则；跨路由靠既有恢复，不保证页面永不卸载。

依据：tools-tabs.tsx:26–64；settings-content.tsx:32–111；writing-workbench.tsx:80–149；definition-cards-app.tsx:12–43；property-decks-app.tsx:10–122。

## 7 同步保护与并发回归

需要区分三条链路：LocalWorkspaceSync的工作区outbox/版本/冲突/备份；OfflineWorkspaceSync的tasks/review/reading业务mutation；PracticeTimerFrame和practice-cloud的计时控制权。UI不能把三者合并成新autosave。

SyncEngine对远端revision与回执匹配、重读冲突选择、写前备份已有防护；local-edit用base/local/current合并并保留冲突副本；schedule-safety保护非空状态、诊断原文、首次答题证据。保留函数与契约，不改协议或模型。

| 必须用例 | 验收断言 | 已有测试基础 |
| --- | --- | --- |
| A/B改不同记录 | 两条保留，revision不回退 | sync-v2、study-concurrency |
| 同字段冲突/删除与编辑 | 两份证据和明确冲突，无静默时间覆盖 | sync-v2、engine.resolve |
| A离线旧状态，B保存后A上线 | B新内容与firstAttempt不丢；A草稿仍可恢复 | workspace-sync-recovery、schedule-safety |
| 晚回执期间新编辑 | 不清新outbox，不回显旧draft | acknowledgment、recovery |
| 计时接管与重连 | 明确LOST_CONTROL才退出；旧token写拒绝 | practice-cloud-offline/frame/route/browser |
| 刷新/账号切换/版本回退 | 账号隔离、待上传、检查点可恢复 | offline hooks、PWA、browser脚本 |

用两个独立context模拟设备、另开同账号多tab验证锁协调；断言操作ID、revision/hash和关键业务字段，不新增模型。真实数据库用隔离账号/测试库；mock通过不等于真实后端并发通过。

若基线已存在同步失败，或useOfflineSnapshot初始缓存与pending mutation时序疑点，单列风险和后续任务并暂停受影响迁移；不在UI提交中修协议、清冲突或改变时钟规则。

依据：sync/engine.ts:100–169,226–270；sync/local-edit.ts:15–51；sync/acknowledgment.ts:4–25；sync/schedule-safety.ts:18–50；public/practice-cloud.js:7–21。

## 7 加载与性能优化的证据链

| 实际观察/待测问题 | 测量方法 | 有证据后采取措施 |
| --- | --- | --- |
| 首页并行统计仍全部等完 | RSC/TTFB与最慢请求跨度 | 非关键统计细分Suspense，不反复refresh共享layout |
| Schedule多业务state/派生计算集中 | Profiler commit、输入trace、>50ms长任务 | 稳定controller，拆展示子组件；memo只用于测到的热点 |
| 工具/设置静态导入重面板 | 冷暖路由压缩JS和parse/eval时间 | 面板dynamic import，docx等按动作加载 |
| 本机备份扫描与序列化 | 代表性大数据的保存与主线程trace | 测出热点后拆计算；不改安全写序与备份承诺 |
| iframe HTML缓存不保留运行文档 | fetch缓存与srcDoc mount/脚本启动分测 | 稳定src/runtimeContext，防无关render重置 |
| 通知/客服已有轮询退避 | 每分钟请求数、隐藏/恢复trace | 只停隐藏面板自身非必要任务，不重造全局调度 |

已有DeferredAiChat、AI Agent、NotificationInbox动态导入应保留；不能再称“首次全站引入懒加载”。条件渲染与静态import是两件事，必须同时解决bundle与draft。

优先Next共享layout、loading.tsx、Suspense、next/dynamic、Link，不开发URL组件池、全局keep-alive导航缓存。useTransition不能让同步计算自动进后台线程。LegacyFrame依赖src/userName/lang/signedIn/runtimeContext，语言/账号有合法重建需求，不能为缓存显示旧账号内容。

依据：dashboard/page.tsx:110–157；schedule-control.tsx:1483–1609；tools-tabs.tsx:4–8；settings-content.tsx:3–31；legacy-frame.tsx:19–31,434–486；deferred-ai-chat.tsx:3–27。

## 7 预取策略修订

项目安装的Next16.3.8文档明确：App Router Link默认auto/null，在生产viewport预取，静态/动态路由范围不同，loading边界影响动态预取；false关闭自动viewport和hover预取。next.config未启用partialPrefetching，不套用该实验模式的不同默认语义。

Sidebar关闭自动预取后在mouseenter/focus调router.prefetch，已有offline、saveData、2G、intentPrefetch=false守卫。ProductCard直接关闭。README记录这是减少未访问模块后台请求的历史优化，不能全导航恢复预取。

保持原策略先测；普通可见入口逐路由比较原策略、Next auto和现有intent，选一种，不叠两套触发器。没净收益就不改。手动继续router.prefetch，不新造缓存或跨账号复用；不使用true强拉完整动态页面。

离线/saveData/慢网禁手动预取；普通移动网不空闲批量拉所有页。游客不预取登录后个人数据；不预取/admin、/beta、受限权益或会写入/claim控制权的流程。服务端鉴权仍必须生效，客户端隐藏只是减少请求。

每路由冷暖各50次比较可用P95、额外请求/字节与首屏；若主要页面P95回退同时超过10%及50ms，拒绝优化。敏感复用、越权成功和预取后台写入必须为0。任何请求增量有路由级解释；触摸intent仅有测量收益后才添加，不在按下时执行业务。

依据：node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md:294–306；sidebar.tsx:33–38,166,191；product-card.tsx:25–28；README.md:36。

## 8 五批实施计划 批次一与二

保留基础→框架→业务→在用旧页→收尾五批。把基线、状态和数据安全前置；不是最后一批再补测试。所有测试/依赖安装/代码改动均为后续实施内容。

### 批次一  基线与最小UI基础  5至8人日

前置：干净隔离工作区、在用入口冻结、测试账号与v3路线。复用现有cn/确认框，建立token和最小Button/Input/Tabs/Dialog；以工具箱文本输入→切换→返回→转换/复制及即时确认为样板。

最小交付：一个完整流程三主题/键盘/触屏正常，draft不丢；生产构建/hydration通过，锁定依赖，记录JS和交互基线。阻塞：v3/React19精确组合、历史失败归属、现存修改冲突。兼容失败不自动升级整栈。

### 批次二  主站框架与导航  5至8人日

依赖一。统一侧栏、Topbar、手机导航、首页入口与通知入口；保留顺序/折叠/隐藏/变体/权限。处理焦点、Esc、Portal；只实施证据支持的loading和预取调整。

最小交付：游客/登录身份首页→工具箱→设置→返回，手机抽屉/全屏帮助可用；不重挂共享同步和计时；慢网/离线状态准确，后台和BETA不越权。

### 独立提交边界

一：baseline/tests、token/控件、工具样板分逻辑提交。二：框架壳、焦点/浮层、测得的加载优化分开。每批一个清晰PR，不能混入用户其他未提交修改。

前两批净10–16人日，加20%–30%缓冲约12–21工作日（单人全职、环境齐备），替代原7–12日估算。不包含主要业务与旧页面全量迁移。

## 8 五批实施计划 批次三与四

### 批次三  在用React业务  14至24人日

依赖二。顺序：工具/设置剩余→学习卡片/阅读→日程/Cue/计时展示→AI及在用后台。后台/BETA只处理已确认开放入口。改外壳前列出条件挂载点和draft所有者，领域controller/localWriter/离线队列不动。

最小交付：每页编辑→保存→失败重试→恢复，配套旧快照重连和晚回执；计时必须过T。保留原生Select、敏感输入生命周期、题目顺序和快捷键。不能只改卡片边框就算页面完成。

阻塞：大组件耦合、角色身份不足、真实并发环境、旧测试断言差异。只更新对应新交互的断言，不删关键断言让构建变绿。发现协议问题独立排期。

### 批次四  在用iframe兼容  12至24人日

依赖二；高风险流程还依赖三的数据门禁。保留iframe、原脚本和postMessage/存储桥接；外层用统一React组件，内层用作用域token/共享CSS及必要事件适配，不在HTML里临时嵌第二React root。

只处理实际启用的Studyplan、MockPortal、PracticeTimer等。逐模块验证打开/编辑/保存、语言/主题、账号变化、全屏和恢复；I/D/T门禁通过才完成。不能因为存在HTML文件就扩项。

明确首轮不是把全部旧页转Radix。若无法在不改领域逻辑下安全适配，保留可用实现，列出剩余差异并单独提案；不能隐藏未完成项或借机改协议。阻塞来自旧脚本耦合、注入样式、真实业务fixture和PWA缓存组合。

## 8 批次五与工作量汇总

### 批次五  回归 发布与收尾  5至8人日

依赖前述纳入批次。清理已确认无引用的重复组件、统一token文档，完成全清单回归、真机、PWA升降级和回退演练。无入口旧模块保持，不借机清仓库。

最小交付：每项有完成/保留/待验证结论；P0关闭，部署SHA/版本一致；测试环境、数据摘要、回退路径和DOCX/Markdown齐备。

| 范围 | 净投入 | 估算边界 |
| --- | --- | --- |
| 一加二 | 10–16人日 | 最小工具闭环与主站框架，不含全站业务 |
| 三 | 14–24人日 | 启用React学习/设置/AI/后台 |
| 四 | 12–24人日 | 在用iframe兼容，不含整页React重写 |
| 五 | 5–8人日 | 集成/真机/发布/文档 |
| 全范围条件估计 | 41–72人日 | 含20%–30%缓冲约50–94工作日；单人全职 |

范围未冻结、生产开关/账号/设备未齐时不能给可靠日历日期。工期按流程包含调查、开发、测试、评审和文档；不能将回归时间当作免费缓冲。旧HTML比例和多设备门禁使原全量15–25日缺乏依据。

若只交前两批，可独立改善常用操作，但不宣称日程/刷题/旧页全部完成。实际开放功能少时按冻结清单重算，不用仓库1308个文件或195个组件直接估算。

## 9 Git分支 提交与合并策略

正式实施前重查branch/HEAD/远程main/status -uall/暂存/版本。当前37/227条目先明确所有者；不git add .、不全量自动stash、不reset --hard、不clean -fd、不强推。下述操作仅为未来实施方案；临时准备的纠正记录见附录B。

从更新后的远程main建立隔离worktree与feat/ui-modernization，保留当前脏工作区原样。仅按已确认归属的业务提交整合，不能复制整个脏目录；隔离不等于用户修改已合并。

main保持可部署；每批验证后推对应开发分支，开独立PR；前批合入main后再推进下一批，避免巨型或混合PR。默认保留merge commit作为批次边界；若仓库强制squash，每批一个PR/一个squash commit并记录回退点。策略需开工前核实。

每批开始/合并前fetch并在干净feature工作区merge origin/main，不对已共享分支rebase强推。冲突按最新业务逐文件解，重点是同步/存储/权限/领域类型，不整边ours/theirs覆盖。解决后重新跑受影响测试与D/T。

建分支不升版本。首个正式UI系统发布候选暂定3.25.0，若main更高按当时基线与新模块规则选择；发布PR统一manifest、lock、APP_VERSION、更新记录及必要缓存兼容信息。后批不预占版本，修复增patch、新功能增minor、平台重构才major。

PR记录base SHA、批次依赖、范围清单、测试/性能证据和回退操作；审查/预览/CI通过后合入。发布后核对远程SHA、构建artifact和页面显示，不以本机提交代表上线。本轮文档不升版本不入Git。

## 10 自动化测试矩阵

| 编号/场景 | 已有基础 | 实施补充与通过标准 |
| --- | --- | --- |
| U 导航权限主题 | mobile-navigation、device-layout/pages、auth-resilience、beta | 清单四身份三主题；新hydration/console错误0；越权成功0 |
| F 弹层表单草稿 | site-dialogs、error-notices、workspace-features | 焦点/IME/Esc/连续点击/保存失败/晚响应；关键草稿丢失0 |
| D 离线并发 | sync-v2、workspace-sync-recovery、study-concurrency、ielts-local-concurrency | 二设备冲突/旧机上线/晚回执/删除编辑/账号切换，记录不回退 |
| T 计时接续 | practice-timer、practice-cloud-offline/frame/route/browser | 切tab不重置、断线继续、明确接管退出、旧token拒绝 |
| I iframe/PWA | legacy-ui、pwa、device-pages、timed-practice.browser | 消息/语言主题/全屏/缓存升降级，旧页无新增回归 |
| A 后台条件入口 | security、reader-admin、beta、network-access | 直访URL/API继续拒绝越权；无生产危险写入 |

复用node:test和现有手写Playwright browser脚本。脚本经JACKYUN_PLAYWRIGHT_PATH或require(playwright)，部分Edge channel、JACKYUN_TEST_URL和mock。package未声明Playwright，仓库未核实browser CI，文件存在不代表执行环境/覆盖率。

后续固定.node-version、npm lock、Playwright/browser版本，集中清单运行器收证据；新增devDependency/CI属于实施内容。本轮未新增依赖或执行需生产账户的测试，未计算覆盖率。

verify主要串联单元/静态/build，未包含全部browser与practice-cloud专项；每批显式纳入受影响测试。CI最低npm ci、类型、lint、secrets、受影响node:test、生产build和browser smoke，三/四补D/T/I。

同一baseline记录历史失败并分类；新增失败必须0。数据/权限P0不能因“历史就失败”豁免。Android/iOS真机缺失明确未验证，桌面touch模拟不能声称全面通过。

## 10 真实性能验收方法

固定base SHA、生产构建、账号和fixture，不能将HEAD与脏工作区混测。正式在隔离worktree执行next build --webpack/start，避免构建生成文件干扰原工作区；本轮未跑build或性能测试。

| 指标 | 起止/样本 | 建议阈值 |
| --- | --- | --- |
| 按钮反馈 | 每类50次；输入事件到对应状态首个实际呈现帧 | P95<=100ms；DOM赋值时间不等于像素呈现 |
| 轻量弹窗/Tabs可用 | 首次/重复各50次，输入到必要内容可交互且非busy | P95<=200ms，首壳/ready/业务完成分测 |
| 网络页面 | 冷暖各50次；点击到关键业务内容和操作可用 | 单列TTFB/RSC/API，P95不回退超过10%且50ms |
| 主线程/React更新 | 固定数据长会话trace与Profiler | 报告>50ms任务、重复commit；按实测热点优化 |
| JS/后台成本 | 压缩JS/请求/字节；空闲和隐藏各10分钟 | 增长有归因，无新增无意义轮询/整站预取 |
| INP | 发布后真实访问按页面/设备P75 | 目标<=200ms；无真实样本则待验证 |

P95按排序后ceil(0.95N)项，报告N/median/max及失败，不能悄悄剔除慢样本。mark辅助定位，trace确认帧；真实点击/键盘/触屏分别测，不用page.evaluate强制dispatch代替用户交互。

记录CPU/OS/浏览器版本/刷新率/viewport/RTT/带宽/限速/角色/数据量/PWA。首次冷加载与已hydrated操作分开；实验室50次不能冒充真实用户INP。

文档导出、AI生成、重报告不套轻量200ms，分别冻结首次响应、可见进度、取消和完成目标。显示空壳但必需数据未齐不算ready；动效不阻断实际事件处理。

## 11 发布与安全回退

每批PR准入：范围与diff对齐、版本/依赖准确、本批CI/build通过、隔离预览角色/主题/业务通过、无数据P0、性能对比和回退证据。仓库保护/部署触发规则未核实前，不推送会自动发布的提交。

预览使用隔离数据与合法OAuth回调。azure/README记载CORS仅允许主域名，需先核实可批准预览/测试后端；mock可开发UI但不能替代真实接续与冲突验证，不复制生产凭据到任意域名。

草稿/记录丢失、旧设备覆盖、越权、计时接管异常或关键操作不可用立即停推广并回退。纯阴影/圆角不是P0，不挤占数据风险修复。

已合批次用merge commit的git revert -m 1，squash则普通revert，经PR恢复。若后批依赖被撤组件，先逆序撤后批再撤基础。禁止reset/force push重写main。

托管artifact回滚仅短期止损，随后回退PR对齐源码。保留last-known-good SHA/artifact/lock；不回滚数据库，不清localStorage/IndexedDB/outbox，不用旧业务快照覆盖新数据。

回退前后测试账号比较记录ID、revision/hash、firstAttempt/诊断原文、draft和pending，确认新数据可读、待上传可继续、旧token仍拒绝。数据格式不变不代表可省兼容验证。

sw.js为v7缓存并有waiting worker/主动更新；验证旧HTML新脚本组合与账号绑定缓存。编辑/计时中延后强刷新，不以清全站存储解决回退。

依据：public/sw.js:1–4,60–90；pwa-lifecycle.tsx；azure/README.md:16；sync/azure-proxy.ts:6–18；deploy/deploy.sh.example:16–24。

## 12 风险 工期与待验证项

| 待验证 | 需要的信息 | 对计划影响 |
| --- | --- | --- |
| 实际启用与角色 | 生产/预览部署SHA、四身份入口记录 | 决定冻结清单，不能按文件扩项 |
| 新依赖精确组合 | v3源码/peerDeps/lock/build/hydration | 批次一阻断，不盲升整栈 |
| 真实同步与预览 | 后端选择、测试库/账号、CORS/OAuth | 高风险D/T未通过不发布 |
| 性能与设备 | 固定数据trace和Android/iOS真机 | 不能承诺收益或全面通过 |
| CI/PR/部署策略 | 必需检查、合并方式、自动发布规则 | 决定push/merge放行门禁 |
| 现有修改归属 | 37变更、227未跟踪的所有者与要保留提交 | 隔离worktree不等于已整合用户工作 |

条件估算净41–72人日，缓冲后50–94工作日；关键路径为范围/脏工作区→v3样板→框架→业务/旧页D/T/I→真机/发布。仅做前两批12–21日不能称全站完成。冻结范围后逐流程重算。

独立风险包括客服草稿/晚响应/防重复、useOfflineSnapshot初始缓存与pending时序、后台局部主题Portal、显示版本不一致。先基线复现再分类；不在UI提交悄悄重写协议。

本轮交付为静态审查、远程引用核对和文档QA；临时准备已清理，未执行业务测试、生产build、线上登录、DB或性能录制。历史README测试记录与本轮结果不混用。完成后复核受控文件、index和status指纹。

## 原计划问题与改进对照 P0

P0为数据、权限或已有工作保护的发布阻断项，不将低价值视觉润色列高优先级。

| 原因与风险 | 解决方法 | 预期收益 |
| --- | --- | --- |
| 脏main直接开发易混入/丢用户修改 | 隔离worktree+feat分支+分批PR；逐项归属，不强制清理 | main稳定可回退 |
| Tabs重挂载清草稿/计时 | 先分状态和所有者；lazy展示、稳定controller | 切换不中断业务 |
| 旧机/晚回执覆盖新内容 | 保留现有同步契约；D/T门禁与证据断言 | 不削弱反覆盖保护 |
| 导航显隐代替鉴权/预取有副作用 | 保留服务端权限；不预取受限或写操作 | 避免越权与后台写入 |
| 初始化空值写回已有存储 | hydrate/ready前禁止默认空写；沿用writer | 恢复不破坏数据 |
| 回退清存储/恢复旧快照 | 仅回退UI，不清outbox；核对关键记录 | 止损无二次数据损失 |

若这些约束在baseline失败，单列阻断受影响迁移；不能为了赶期降级为视觉验收。

## 原计划问题与改进对照 P1与P2

| 问题级别 | 原因与解决方法 | 预期收益 |
| --- | --- | --- |
| P1 loading当优化 | 分测RSC/API/JS/主线程；空壳不算ready | 收益可解释 |
| P1 常用入口全部预取 | 历史关闭有理由；逐路由auto/intent/false实验 | 等待与后台成本平衡 |
| P1 永久挂载所有面板 | state分离/lazy/隐藏停非必要任务 | 保草稿不保资源浪费 |
| P1 未审计先换库 | 复用cn/dialog/errors/poll；只合并同语义 | 降低重复依赖 |
| P1 系统深色与Portal混乱 | data-theme、就近容器、全屏/嵌套测试 | 三主题一致 |
| P1 build代替回归 | 复用测试补D/T/I、真机记录与角色 | 暴露真实业务问题 |
| P1 版本字段不一致 | 发布PR统一manifest/APP_VERSION/记录/SHA | 发布可追踪 |
| P1 工期按文件数猜 | 按入口、iframe、状态和验证估算 | 减少漏项返工 |
| P2 全套动画与图标 | 首轮不加，交互完成后按需 | 避免首屏负担 |
| P2 HTML全React重写 | 独立提案，首轮兼容适配 | 控制本轮风险 |

## 附录A 清单口径与隔离范围

清单为当前源码可达候选，生产部署/开关/对应账号可达统一待验证。每项的UI表示实际实现及待统一类型，不是已安装Radix。服务端外壳、客户端初始化和iframe启动分别说明，耗时未测。

批次二处理壳与导航，业务按三/四；五覆盖纳入项回归。所有项至少U，其他F/D/T/I/A见第10节。变体/用户隐藏/BETA/权益以角色核实后冻结，不要求一个账号看到全部。

隔离V：/igcountdown、/md2word、/articles、/articles/[slug]、/Techempire、/[code]、/network-access、/temp/redirecting和无主站入口静态页。不是认定停用；只是当前缺足够入口/启用证据，确认前不扩项。articles详情有后台预览链接，故属于条件支持候选。

排除X：Backup、exam-diagnosis-baseline/work、merge142-local-backup、其他独立项目与历史docs/artifacts，不改不删。资源目录外部站、扩展/手表App本体不改。products关联页因设置等直链需兼容回归，不扩大独立营销重做。

## 附录A 主站一级入口 1至4

### Dashboard  /dashboard

入口/条件：侧栏dashboard；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：统计卡/任务快捷输入/学习概览。加载：身份后八统计并行。

保留状态/行为：任务关联与导航位置。批次2/3；验收U/F/D。

依据：jackyun-portal/src/lib/navigation.ts:28；jackyun-portal/src/app/(portal)/dashboard/page.tsx:1–314。

### JackYun AI  /ai

入口/条件：侧栏ai；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：聊天/Agent/模型/消息输入。加载：claims及模型目录；Agent dynamic。

保留状态/行为：会话、输入与进行中请求。批次3；验收U/F/D。

依据：jackyun-portal/src/lib/navigation.ts:29；jackyun-portal/src/app/(portal)/ai/page.tsx:1–17。

### 日程  /schedule

入口/条件：侧栏schedule；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：课表/任务/Cue/题库/导入/答题卡。加载：身份角色后本机恢复。

保留状态/行为：schedule/question-bank草稿、证据、writer与计时controller。批次3；验收U/F/D/T。

依据：jackyun-portal/src/lib/navigation.ts:30；jackyun-portal/src/app/(portal)/schedule/page.tsx:1–18。

### 学习计划  /study

入口/条件：侧栏study-plan；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：计划/任务/导入/专注。加载：Studyplan.html初始化。

保留状态/行为：计划任务与本机云端行为。批次4；验收U/F/D/I。

依据：jackyun-portal/src/lib/navigation.ts:31；jackyun-portal/src/app/(portal)/study/page.tsx:1–15。

## 附录A 主站一级入口 5至8

### 计划显示器  /goal

入口/条件：侧栏goal；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：目标编辑/AI/计划显示。加载：身份后Goal.html。

保留状态/行为：目标、输入与原脚本。批次4；验收U/F/D/I。

依据：jackyun-portal/src/lib/navigation.ts:32；jackyun-portal/src/app/(portal)/goal/page.tsx:1–18。

### StudyGuide  /study-guide

入口/条件：侧栏study-guide；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：tab/subTab与个人IELTS。加载：身份角色后StudyGuide.html+runtimeContext。

保留状态/行为：URL分栏与权限内容。批次4；验收U/F/I。

依据：jackyun-portal/src/lib/navigation.ts:33；jackyun-portal/src/app/(portal)/study-guide/page.tsx:1–16。

### 雅思备考  /ielts

入口/条件：侧栏ielts；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：目标/四科练习/证据。加载：IeltsDashboard本机初始化。

保留状态/行为：目标与已有练习记录。批次3；验收U/F/D。

依据：jackyun-portal/src/lib/navigation.ts:34；jackyun-portal/src/app/(portal)/ielts/page.tsx:1–11。

### 雅思写作工具  /ielts-writing

入口/条件：侧栏ielts-writing；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：写作/诊断/修订/归档。加载：WritingWorkbench读本机镜像。

保留状态/行为：draft/mirror/snapshots与并发保护。批次3；验收U/F/D。

依据：jackyun-portal/src/lib/navigation.ts:35；jackyun-portal/src/app/(portal)/ielts-writing/page.tsx:1–11。

## 附录A 主站一级入口 9至12

### Reading 阅读器  /reading

入口/条件：侧栏reading；C；reading开关/BETA/套餐，页面和API授权不变；生产开放待验证。

UI/子流程：书架/阅读/查词/进度。加载：bootstrap后离线包装。

保留状态/行为：按用户reading快照与阅读位置。批次3；验收U/F/D。

依据：jackyun-portal/src/lib/navigation.ts:36；jackyun-portal/src/app/(portal)/reading/page.tsx:1–15。

### 学习网站收录  /resources

入口/条件：侧栏learning-resources；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：分类/搜索/外链卡。加载：客户端目录筛选。

保留状态/行为：会话筛选，外链不重做。批次3；验收U。

依据：jackyun-portal/src/lib/navigation.ts:37；jackyun-portal/src/app/(portal)/resources/page.tsx:1–11。

### 词汇宝库  /vocab

入口/条件：侧栏vocab；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：词表/添加/记忆复习。加载：Vocab.html初始化。

保留状态/行为：旧词表与学习数据；不误改未接入React词汇页。批次4；验收U/F/D/I。

依据：jackyun-portal/src/lib/navigation.ts:38；jackyun-portal/src/app/(portal)/vocab/page.tsx:1–5。

### 记忆 Memory  /memory

入口/条件：侧栏memory；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：定义/诗词/性质入口。加载：服务端静态卡片。

保留状态/行为：子页入口与返回路径。批次3；验收U。

依据：jackyun-portal/src/lib/navigation.ts:39；jackyun-portal/src/app/(portal)/memory/page.tsx:1–78。

## 附录A 主站一级入口 13至16

### 答题卡  /answer-sheet

入口/条件：侧栏answer-sheet；C；依用户answerSheetMode所选变体，非身份鉴权；生产开放待验证。

UI/子流程：答题/编辑/导出。加载：AnswerSheet.html。

保留状态/行为：已填答案与未提交输入。批次4；验收U/F/D/I。

依据：jackyun-portal/src/lib/navigation.ts:40；jackyun-portal/src/app/(portal)/answer-sheet/page.tsx:1–5。

### 同步答题卡  /answer-sheet-sync

入口/条件：侧栏answer-sheet-sync；C；依用户answerSheetMode所选变体，非身份鉴权；生产开放待验证。

UI/子流程：答题/连接/同步状态。加载：AnswerSheetSync.html。

保留状态/行为：答案与同步会话。批次4；验收U/F/D/I。

依据：jackyun-portal/src/lib/navigation.ts:41；jackyun-portal/src/app/(portal)/answer-sheet-sync/page.tsx:1–5。

### Mock 刷题  /mock-portal

入口/条件：侧栏mock；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：刷题/批改/报告/导出。加载：MockPortal.html。

保留状态/行为：答案、历史与首次证据。批次4；验收U/F/D/T/I。

依据：jackyun-portal/src/lib/navigation.ts:42；jackyun-portal/src/app/(portal)/mock-portal/page.tsx:1–5。

### QuizWise 刷题  /quiz

入口/条件：侧栏quizwise；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：版本选择/答题。加载：读取preference；QuizApp或QuizWise.html。

保留状态/行为：版本偏好、答案与测验进度。批次3/4；验收U/F/D/I。

依据：jackyun-portal/src/lib/navigation.ts:43；jackyun-portal/src/app/(portal)/quiz/page.tsx:1–116。

## 附录A 主站一级入口 17至20

### 错题复习  /review

入口/条件：侧栏review；A/C；游客引导，实际队列需登录；生产开放待验证。

UI/子流程：队列/自评/归档。加载：身份后snapshot+离线队列。

保留状态/行为：答案与review pending操作。批次3；验收U/F/D。

依据：jackyun-portal/src/lib/navigation.ts:44；jackyun-portal/src/app/(portal)/review/page.tsx:1–34。

### 时间管理  /time-management

入口/条件：侧栏time-management；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：计时/番茄/睡眠/倒计时入口。加载：客户端卡片。

保留状态/行为：子页路径与会话接续。批次2/3；验收U/T。

依据：jackyun-portal/src/lib/navigation.ts:45；jackyun-portal/src/app/(portal)/time-management/page.tsx:1–125。

### 睡眠逆推  /sleep

入口/条件：侧栏sleep；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：睡眠输入计算。加载：SleepOptimizer客户端。

保留状态/行为：本次输入和结果。批次3；验收U/F。

依据：jackyun-portal/src/lib/navigation.ts:46；jackyun-portal/src/app/(portal)/sleep/page.tsx:1–11。

### 学习活动  /activity

入口/条件：侧栏activity；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：活动/设备/统计。加载：身份后并行请求。

保留状态/行为：账号数据范围与统计语义。批次3；验收U。

依据：jackyun-portal/src/lib/navigation.ts:47；jackyun-portal/src/app/(portal)/activity/page.tsx:1–35。

## 附录A 主站一级入口 21至24

### 工具箱  /tools

入口/条件：侧栏tools；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：文本/校时/剪贴板/Word/日常Tabs。加载：静态import+条件挂载。

保留状态/行为：父级输入输出草稿；隐藏停非必要任务。批次1/3；验收U/F。

依据：jackyun-portal/src/lib/navigation.ts:48；jackyun-portal/src/app/(portal)/tools/page.tsx:1–13。

### BETA 测试中心  /beta

入口/条件：侧栏beta；C；登录且BETA accepted；生产开放待验证。

UI/子流程：测试入口/下载/反馈。加载：身份+accepted后读取。

保留状态/行为：协议状态和反馈，不新增开关。批次3；验收U/F/A。

依据：jackyun-portal/src/lib/navigation.ts:49；jackyun-portal/src/app/(portal)/beta/page.tsx:1–37。

### AI 网站工作室 BETA  /studio

入口/条件：侧栏studio；C；登录；生产开放待验证。

UI/子流程：个人站编辑/发布。加载：登录后PersonalSiteStudio。

保留状态/行为：编辑草稿和原发布权限接口。批次3；验收U/F/D。

依据：jackyun-portal/src/lib/navigation.ts:50；jackyun-portal/src/app/(portal)/studio/page.tsx:1–9。

### 网站插件大全  /userscripts

入口/条件：侧栏userscripts；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：目录/搜索/下载。加载：客户端目录。

保留状态/行为：筛选与链接，扩展本体不改。批次3；验收U。

依据：jackyun-portal/src/lib/navigation.ts:51；jackyun-portal/src/app/(portal)/userscripts/page.tsx:1–11。

## 附录A 主站一级入口 25至28

### 音乐播放器  /music

入口/条件：侧栏music-player；C；依用户musicMode所选变体，非身份鉴权；生产开放待验证。

UI/子流程：播放/列表/音量。加载：MusicPlayer.html。

保留状态/行为：队列与播放状态，不无故重启。批次4；验收U/F/I。

依据：jackyun-portal/src/lib/navigation.ts:52；jackyun-portal/src/app/(portal)/music/page.tsx:1–5。

### Sync Music  /music-sync

入口/条件：侧栏music-sync；C；依用户musicMode所选变体，非身份鉴权；生产开放待验证。

UI/子流程：同步媒体/列表。加载：MusicPlayerSync.html。

保留状态/行为：位置和同步会话。批次4；验收U/F/D/I。

依据：jackyun-portal/src/lib/navigation.ts:53；jackyun-portal/src/app/(portal)/music-sync/page.tsx:1–5。

### B站同步  /bilibili-sync

入口/条件：侧栏bilibili-sync；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：视频/同步控制。加载：BilibiliSync.html。

保留状态/行为：播放与同步输入。批次4；验收U/F/D/I。

依据：jackyun-portal/src/lib/navigation.ts:54；jackyun-portal/src/app/(portal)/bilibili-sync/page.tsx:1–5。

### 放松一下  /relax

入口/条件：侧栏relax；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：媒体/游戏/AI入口。加载：Relax.html。

保留状态/行为：进行中状态，外部内容不改。批次4；验收U/F/I。

依据：jackyun-portal/src/lib/navigation.ts:55；jackyun-portal/src/app/(portal)/relax/page.tsx:1–5。

## 附录A 主站一级入口 29至32

### 设置  /settings

入口/条件：侧栏settings；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：十五类面板/账号/备份/配对。加载：身份与配置读取；条件渲染。

保留状态/行为：section/pair、pending偏好；敏感输入不落盘。批次3；验收U/F/D/A。

依据：jackyun-portal/src/lib/navigation.ts:56；jackyun-portal/src/app/(portal)/settings/page.tsx:1–82。

### 更新  /update

入口/条件：侧栏update；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：记录/筛选/产品链接。加载：UpdateShowcase。

保留状态/行为：筛选与实际版本展示。批次3；验收U。

依据：jackyun-portal/src/lib/navigation.ts:57；jackyun-portal/src/app/(portal)/update/page.tsx:1–11。

### 帮助中心  /help

入口/条件：侧栏help-center；A；默认产品本机模式，个别云操作需登录；生产开放待验证。

UI/子流程：帮助/客服/跳转。加载：HelpCenter.html。

保留状态/行为：输入与客服行为。批次4；验收U/F/I。

依据：jackyun-portal/src/lib/navigation.ts:58；jackyun-portal/src/app/(portal)/help/page.tsx:1–5。

### 管理员  /admin

入口/条件：侧栏admin；C；管理员，额外能力检查不变；生产开放待验证。

UI/子流程：总览/后台导航。加载：proxy+AdminLayout+Server Action。

保留状态/行为：权限、局部主题、危险确认。批次3；验收U/F/A。

依据：jackyun-portal/src/lib/navigation.ts:59；jackyun-portal/src/app/admin/page.tsx:1–9。

## 附录A 主站子入口 1至4

### 学习任务  /study/tasks

入口/条件：首页任务卡/学习流程；游客引导，登录后任务；生产开放待验证。

UI/子流程与加载：CreatePlanDialog/OfflineTaskWorkspace；服务器→快照。

状态/行为：计划/inbox/离线操作；新建完成专注。批次3；验收U/F/D。

依据：jackyun-portal/src/app/(portal)/dashboard/page.tsx:231–269。

### 定义卡片  /definitions

入口/条件：/memory卡片；本机可用；生产开放待验证。

UI/子流程与加载：DefinitionCardsApp读cards/session。

状态/行为：学习测试进度、输入导入。批次3；验收U/F/D。

依据：jackyun-portal/src/app/(portal)/memory/page.tsx:1–78。

### 性质卡片  /properties

入口/条件：/memory卡片；本机可用；生产开放待验证。

UI/子流程与加载：PropertyDecksApp读decks/session。

状态/行为：卡组、回忆测试阶段与结果。批次3；验收U/F/D。

依据：jackyun-portal/src/app/(portal)/memory/page.tsx:1–78。

### 诗词  /poem

入口/条件：/memory卡片；本机可用；生产开放待验证。

UI/子流程与加载：Poem.html iframe。

状态/行为：诗词编辑、数据与学习状态。批次4；验收U/F/D/I。

依据：jackyun-portal/src/app/(portal)/memory/page.tsx:1–78。

## 附录A 主站子入口 5至8

### 练习计时  /practice-timer

入口/条件：/time-management及练习入口；认证确定本机/云模式；生产开放待验证。

UI/子流程与加载：PracticeTimerFrame/PracticeTimer.html。

状态/行为：owner/token/revision、用时暂停与firstAttempt。批次3/4；验收U/F/D/T/I。

依据：jackyun-portal/src/app/(portal)/time-management/page.tsx:17–58。

### 番茄钟  /pomodoro

入口/条件：首页/时间管理；本机/账号语义保留；生产开放待验证。

UI/子流程与加载：Pomodoro.html iframe。

状态/行为：运行暂停、任务关联与记录。批次4；验收U/D/T/I。

依据：jackyun-portal/src/app/(portal)/dashboard/page.tsx:241。

### 倒计时  /countdown

入口/条件：首页/时间管理；身份读取但不强制登录；生产开放待验证。

UI/子流程与加载：Countdown.html iframe。

状态/行为：配置与当前运行。批次4；验收U/F/T/I。

依据：jackyun-portal/src/app/(portal)/dashboard/page.tsx:246。

### 倒计日  /examcountdown

入口/条件：时间管理卡片；本机可用；生产开放待验证。

UI/子流程与加载：IGCountdown.html iframe。

状态/行为：日期配置与展示。批次4；验收U/F/I。

依据：jackyun-portal/src/app/(portal)/time-management/page.tsx:40–58。

## 附录A 主站子入口 9至12

### 高级排程  /timetable-hub

入口/条件：日程课表/隐私区；本机模式保留；生产开放待验证。

UI/子流程与加载：TimetableHub.html iframe。

状态/行为：课表编辑草稿与桥接。批次4；验收U/F/D/I。

依据：jackyun-portal/src/components/modules/schedule/schedule-control.tsx:1929。

### 旧版专注  /control/focus

入口/条件：日程课表/隐私区；本机模式保留；生产开放待验证。

UI/子流程与加载：Control.html iframe。

状态/行为：执行限制与当前会话。批次4；验收U/T/I。

依据：jackyun-portal/src/components/modules/schedule/schedule-control.tsx:1929。

### 手表兼容入口  /settings/watch

入口/条件：设置设备/配对流程；账号条件不变；生产开放待验证。

UI/子流程与加载：redirect到settings section=watch，保留pair。

状态/行为：pair与配对；手表App不改。批次3；验收U/F/A。

依据：jackyun-portal/src/app/(portal)/settings/watch/page.tsx:1–8。

### 关联产品页  /products

入口/条件：设置/全屏帮助/更新；公开同源；生产开放待验证。

UI/子流程与加载：rewrite到public/products.html。

状态/行为：安装说明与下载路径，只兼容改造。批次4；验收U/I。

依据：jackyun-portal/src/components/settings/settings-content.tsx:87–100。

## 附录A 账号与异常支持流程

| 路由/入口 | 条件/加载/UI与保留行为 | 批次/验收 |
| --- | --- | --- |
| /login；Topbar/受限流程 | 公开表单与provider，保留next/输入，不保存密码 | 3 U/F/A |
| /reset-password、/update-password；设置/重置链接 | 认证/token校验不变，表单失败保留必要输入 | 3 F/A |
| /unauthorized、/account-status；proxy | 拒绝/受限账号，保留申诉恢复和退出流程 | 3 U/F/A |
| /oauth/consent；授权回调 | 依有效authorization_id；实际入口待验证 | V 确认后3 F/A |
| /server-failure；错误入口 | 诊断与重连，源码入口需核对，不执行写探针 | V 确认后3 U |
| /articles/[slug]；后台内容预览 | 按文章发布/登录规则，数据与阅读返回不变 | C/V 确认后3 U/A |

以上不因为不在侧栏而遗漏，但仍需真实入口证据。未验证的支持流程不计入承诺；公开路由存在并不证明主站在用。重置/授权回调保持原URL与安全校验，不能通过UI美化顺便改认证逻辑。

依据：src/app/(auth)/各page.tsx；src/proxy.ts:7–8,121–159；src/app/account-status/page.tsx:8–18；src/components/admin/site-content-panel.tsx:287。

## 附录A 后台条件入口清单

| 名称/路由 | 入口/UI/加载与状态 | 批次/验收 |
| --- | --- | --- |
| 总览 /admin | 主站管理员入口；DashboardPanel，服务端overview | 3 U/F/A |
| 用户 /admin/users | 后台导航；用户/BETA/套餐操作与表单，Server Action并行 | 3 U/F/A/D |
| 内容 /admin/content | 后台导航；内容编辑与文章/短链；Server Action | 3 U/F/A |
| AI /admin/ai | 后台导航；模型/配额表单与服务端data | 3 U/F/A |
| 网络 /admin/network | 后台导航；NetworkDeviceManager与服务器设备数据 | 3 U/F/A |
| 工单 /admin/tickets | 后台导航/通知；回复draft与ticket query，服务端列表 | 3 U/F/A |
| 公告 /admin/announcements | 后台导航；NotificationManager与排期表单 | 3 U/F/A |
| 权限 /admin/access | 后台导航；管理员/白名单/capabilities并行 | 3 U/F/A |
| 健康 /admin/system | 后台导航；表统计/同步overview并行 | 3 U/A |
| 管控 /admin/enforcer | 后台导航；EnforcerApp与既有规则 | 3 U/F/A/T |
| 版本 /admin/update-hub | 后台导航；版本记录与APP_VERSION | 3 U/A |

共同条件：proxy和AdminLayout校验管理员，额外capability不变；生产启用待验证。保留筛选/详情/未提交编辑和危险确认，敏感输入不持久化；后台局部data-theme=dark的Portal须继承正确主题。

详情候选：/admin/content/library、/admin/ai/test需在父模块确认入口；/admin/test-ai是重定向，/admin/test是否仍有在用入口待验证，不直接纳入。该清单不授权访问真实后台或写入生产数据。

依据：src/components/admin/admin-navigation.tsx:7–20；src/app/admin/layout.tsx:10–35；src/app/admin对应page.tsx；均位于jackyun-portal。

## 附录B 官方资料与真实性说明

shadcn定位与源码维护：https://ui.shadcn.com/docs

Tailwind兼容说明：https://ui.shadcn.com/docs/tailwind-v4

手工接入：https://ui.shadcn.com/docs/installation/manual

Radix SSR：https://www.radix-ui.com/primitives/docs/guides/server-side-rendering

Next Link：https://nextjs.org/docs/app/api-reference/components/link

真实INP：https://web.dev/articles/inp

检索日期2026年10月16日。线上文档可能涵盖比项目更新的版本；预取优先引用已安装Next16.3.8文档。v3及React19分别有支持说明，不能替代精确新增依赖与生产构建验证。

本轮曾因误解开工范围创建feat/ui-modernization临时隔离工作区，并执行npm ci --ignore-scripts --no-audit --no-fund；未新增目标UI依赖、未改源码或锁文件。已验证临时工作区无修改、HEAD等于main后移除并删除未使用分支。原main文件保持原样。未执行生产build、业务测试、线上登录或数据库访问；一次build调用在npm启动前失败，不构成构建结果。未来测试矩阵不构成通过证据。

文档产物使用已有python-docx生成；标准render_docx若因LibreOffice缺失失败，记录原因，使用已有docx-preview/Edge后备逐页检查，不新增依赖。后备可见版式不等同Word/LibreOffice分页验证。

DOCX与Markdown由同一结构化内容生成。路径证据以仓库根目录为基准，代码片段定位到本轮本机源码；修改中的文件不自动等同已提交或已部署内容。

## 附录C 调查与交付核对

远程main核对：b6f3078dfcc00d614980b78452da2b783c01320d。本机main相同。受控文件1308个，37处受控变更、227个未跟踪文件条目，index为空；这些是安全审查信息，不是改造范围计数。

仓库外保存repository-baseline.json、working-tree-status.txt、investigation.json，分别记录内容指纹、变更清单与依赖/导航证据。交付前再次计算trackedContentDigest/statusDigest/indexDigest/HEAD/branch，应与基线一致；结果写repository-verification.json。

产物在 C:/Users/syf26/Desktop/JACKYUN/planning-artifacts/ui-modernization-review-20261016，不在YunfanShi.github.io仓库中。不会使本轮生成物与用户未跟踪文件混在一起。后续如批准入库，可保存Markdown和DOCX及必要清单，不必提交渲染中间图片。

规划结论优先级：保护用户数据与已有工作，保持权限/业务契约，复用公共能力，减少重复与不必要复杂度，再衡量响应和视觉一致。任何待验证项都不能被“看起来流畅”替代。
