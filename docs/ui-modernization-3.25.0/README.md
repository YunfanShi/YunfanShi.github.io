# JackYun 主站 UI 现代化第一批实施记录

候选版本 3.25.0 · 基线 main b6f3078 · 2026-10-16 · 开发分支审查产物

## 第一批实施结果与范围

本批将工具箱作为首个完整迁移样板，建立可继续复用的基础 UI，修复切换丢输入，并验证按需加载、键盘和三主题。开发基线为 main b6f3078，候选版本为 3.25.0；版本号随实际功能改动更新，不代表已经合并或发布。

用户最初的卡顿感不能直接归因于 Node.js 或组件库。生产基线明确复现了工具切换丢输入；实验室暖切换本来已在约 64 ms，改造后同量级。此次收益主要是保留输入、减少加载内容和统一交互，不能宣称全站卡顿已消除。

| 交付项 | 实施结果 |
| --- | --- |
| 基础控件 | Button、Input、Textarea、Radix Tabs 和 Dialog；保留 Tailwind 3、现有 cn、图标和 data-theme。 |
| 工具箱五面板 | 文本、时间、剪贴板、Markdown 和学习换算保留当前页面会话中的输入及结果。 |
| 加载与失败 | 次要面板按需载入；Word 导出在下载时载入；首次断网失败只影响本面板，恢复后可重试。 |
| 验证与工程产物 | 类型、生产构建、本批 lint、36 项现有数据回归、10 组浏览器流程及生产基线对比；新增独立 CI。 |

本批没有迁移导航、首页、设置、日程/Cue、后台或旧 iframe 页面，也没有新增 Sheet、Select、DropdownMenu。没有更改同步协议、数据模型、存储 key、账号授权、计时控制权或业务接口。后四批仍按审查计划逐批推进。

## 仓库安全与依赖兼容

开工时通过 ls-remote 核实本机 main 与远程 main 相同。原工作区有 37 项受控修改及 227 个未跟踪文件条目，未全量暂存、stash、覆盖或清理。实施位于独立 worktree 的 feat/ui-modernization；原 main 工作区继续保留。

| 项目 | 锁定或处理 |
| --- | --- |
| 已有技术栈 | Next 16.3.8、React/DOM 19.2.8、TypeScript 5.9.3、Tailwind 3.4.17 保持。 |
| 新增运行依赖 | @radix-ui/react-tabs 1.2.1、react-dialog 1.3.1、react-slot 1.5.0、class-variance-authority 0.7.1，精确锁定。 |
| 新增测试依赖 | playwright 1.62.1 作为精确 devDependency；本机 Edge，CI 使用 Playwright Chromium。 |
| 兼容证据 | 核对 Radix 的 React 19 peerDependencies；npm ls 无根依赖重复，TypeScript、生产构建和 hydration 页面流程通过。 |
| UI 来源与维护 | 手工适配 shadcn/ui 的项目内源码分层方式，行为由 Radix 实现。未运行最新版 CLI，也未复制整套组件模板。 |

沿用 clsx 与 tailwind-merge 2.x，未套用 Tailwind 4 的变量语法。ui.css 仅新增 --ui-* 和 .jy-*，不把现有十六进制值包成 hsl()。现有站内通知、原生确认框、Router 和主题 Provider 均继续复用。组件接口与维护约束见 jackyun-portal/src/components/ui/README.md。

manifest、lock 根版本、APP_VERSION 和更新记录统一为 3.25.0。该修正只发生在开发分支，不改 main 的版本。历史 3.24.3/3.24.4 为规划文档提交，不据此补造产品功能发布记录。

## 状态 加载和交互实现

| 状态或能力 | 实际策略 |
| --- | --- |
| 页面会话输入 | ToolDraftProvider 位于工具箱父级。useToolDraft 保存文本、结果、时间参数、选定时区、Markdown 文件名与内容、换算参数。 |
| 临时 UI 状态 | 忙碌、复制提示、拖拽高亮、文件读取器留在面板；隐藏后卸载并清理，不永久挂全部面板。 |
| 已保存及跨设备数据 | 继续由原业务 writer 和同步系统拥有。本批草稿不入 localStorage、IndexedDB、云端或新全局 store。 |
| 离开和刷新 | 本次工具箱会话结束；说明弹窗明确提示重要内容及时复制或下载，不承诺刷新恢复。 |
| 按需模块 | 四个次要面板通过 next/dynamic；导出解析代码移至 markdown-docx.ts，下载动作才 import。 |
| 失败隔离与重试 | PanelBoundary 保留父级草稿；重试创建新的 lazy wrapper，避免重复使用已拒绝 Promise。 |

Button 默认 type=button，保留原生 props/ref，Promise onClick 立即进入 busy；ref 守卫阻止连续点击重复进入，finally 解除。输入在失败时保留。事件不经过点击延时、全局防抖或动画等待。Tabs 方向键移动焦点，Enter/Space 激活；选择背景和文字立即一起更新，避免渐变期间失去对比。

剪贴板每次操作带 generation；输入变化、清空或卸载使旧响应失效。Markdown 文件读取在新读入、手工编辑或卸载时取消，旧下载/复制结果不回写已隐藏面板。时间工具卸载时清除定时器；超出 Date 范围的输入返回错误提示。

## 主题 弹层与可访问性

本批保留 light、gray、dark 的 data-theme 与原来的持久化流程。新增品牌前景、错误、成功、警告 Token，复用背景、前景、边框和品牌变量。浅色蓝按钮使用白字，深色浅蓝按钮使用深色字；新样式不修改旧页面全局 reset。

| 场景 | 实现与验证 |
| --- | --- |
| 说明 Dialog | 提供 Title/Description；Radix 限制焦点、处理 Escape、恢复触发按钮焦点。 |
| Portal 主题 | 打开时选择触发点最近主题容器；根主题回到 body；局部暗色覆盖已验证。 |
| 全屏 | Portal 放入 document.fullscreenElement 内的最近可用主题容器；桌面全屏打开关闭已验证。 |
| 即时确认 | 剪贴板清空仍用 siteConfirm 的原生 dialog 队列；取消保留文本，不替换 Shadow DOM/top layer。 |
| 快捷键 | 新 Dialog 打开时全局导航快捷键退让；defaultPrevented 和 IME composing 不触发全局处理。 |
| 移动端 | 390×844 新建 touch/mobile context，44px 标签目标、换行、16px 输入、tap 切换、无横向溢出已验证。 |

prefers-reduced-motion、已有 data-reduced-motion 和局部 data-motion 继续生效。没有引入动画库或图标包。Word 上传区增加键盘可达操作；输入显式绑定 label，错误用 alert，成功与加载使用 status。

边界：移动端是桌面 Edge 模拟，没有 Android/iOS 真机；没有完整屏幕阅读器审计。当前蓝色三主题通过，不据此声称自定义 accent、所有嵌套菜单或全屏状态中途切换已全面通过。Sheet/复杂 Select 等留待后续批次。

## 验证证据与性能解释

本机完成 10 组浏览器流程：文本和时间输入/结果、手动键盘标签、隐藏时钟清理、学习换算、剪贴板拒绝/重复/晚响应、真实 Word 文件、三主题焦点、局部主题与全屏、触屏模拟、离线恢复及管理员匿名拒绝。具体断言保存在 browser-results.json 和可复现测试脚本中。

| 检查 | 本轮结果 |
| --- | --- |
| TypeScript 与生产构建 | tsc --noEmit 和 next build --webpack 通过；使用占位 Supabase 环境，不读取生产凭据。 |
| 本批 lint 与密钥扫描 | 本批 TSX/TS/浏览器脚本 lint 通过，check-no-private-keys 通过。 |
| 已有数据回归 | sync-v2、workspace-sync-recovery、practice-cloud-offline、ielts-local-concurrency 共 36 项，通过。它们不等于真实后端双设备验收。 |
| 全仓 lint | 仍有历史 30 个错误、2 个警告，8 个旧测试文件与 main 在规范换行后内容相同。本批未修改这些文件，也未删除或屏蔽规则。 |

| 同环境 50 次暖切换 | 改造前 | 改造后 |
| --- | --- | --- |
| P95 毫秒 | 63.9 | 64.9 |
| Median 毫秒 | 63.4 | 63.7 |
| 流程加载压缩 JS 字节 | 640434 | 565322 |
| 切回文本是否保留输入 | False | True |

压缩 JS 减少 75,112 字节，约 11.7%。这是匿名工具箱进入及暖切换流程的浏览器资源总量，不是整个网站包体。延迟差异处于本机噪声量级，没有明显提速证据。

计时起点为 pointerdown，终点为必需时间内容可见后再等待两帧 RAF；N=50，排序第48项为P95。它是实验室帧代理值，不能冒充真实像素呈现、INP、弱网或冷切换 P95。正式 100/200ms 发布指标仍需 trace、冷/暖各50次和真实设备补证。

## CI 发布 回退与后续工作

新增 .github/workflows/ui-modernization.yml：PR 到 main 时运行锁文件安装、固定 Node、Playwright Chromium、生产构建、类型/本批 lint、密钥扫描、36 项数据回归及浏览器流程，上传测试产物。没有部署步骤，不接触生产密钥。工作流首次远程结果以 PR Checks 为准，本机通过不能代替 GitHub CI 通过。

本轮仅推 feat/ui-modernization 并建立 Draft PR。main 保持原版本，待 CI、预览、权限/主题/关键行为审查后再合并。已知全仓 lint 债务、真实后端多设备、真机与实际呈现指标未完成，不宣称已达到全量上线门禁。Vercel 已有 main 提交状态；开发分支可能生成预览，不执行生产 promote。

单批回退：合并后若采用独立普通提交，按该批提交 git revert；若采用 merge commit，使用 git revert -m 1；若 squash，则 revert squash 提交，通过回退 PR 审查。UI 回退不得清 localStorage、IndexedDB、outbox 或恢复旧业务快照。未修改数据格式，仍需检查既有记录、计时和待同步队列没有回退。

开发中同步 main：先确认 feature 工作区干净，再 fetch 并 merge origin/main，逐文件解决冲突，不强推已共享分支，不用整边 ours/theirs 覆盖用户工作。原 main 的未提交改动由原所有者继续保留，不自动混入本批。后四批另立清晰提交和 PR 边界。

下一批为主站侧栏、Topbar、手机导航及首页入口。先补真实部署入口和角色清单，再迁移焦点与浮层；不自动恢复全导航预取。日程/Cue、写作/阅读和旧 iframe 仍按高风险数据门禁排队。

测试环境限制：占位后端会让原共享 AI 外壳请求显示 JY-5002 错误通知，基线和改造版均可见；本轮没有修复或隐藏该独立环境问题。剪贴板拒绝和竞争通过 mock 验证，导出的 DOCX 为实际下载文件。没有登录生产账号或执行真实云端并发写入。

## 复现步骤与代码依据

在 jackyun-portal 内执行 npm ci --ignore-scripts --no-audit --no-fund；设置 NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co、NEXT_PUBLIC_SUPABASE_ANON_KEY=ui-test-placeholder、NEXT_TELEMETRY_DISABLED=1，再 npm run build。必须使用项目声明的 Node 24.19.0 或兼容 >=22 环境。

本机比较基线采用同样 next start -p 3150 方式。standalone 正式运行应复制 public 至 .next/standalone/public、.next/static 至 .next/standalone/.next/static，然后以 PORT=3150 启动 node .next/standalone/server.js。CI 验证 standalone 方式；JACKYUN_TEST_URL 可改测试地址。

浏览器：默认本机 Edge；Linux CI 设置 JACKYUN_BROWSER_CHANNEL=chromium 并 npx playwright install --with-deps chromium。执行 npm run test:ui-modernization；性能执行 npm run test:ui-performance -- after，原始样本和资源列表写入 artifacts/verification/ui-modernization/performance.json。该目录为本机临时证据，不混入业务提交。

| 文件或目录 | 审查重点 |
| --- | --- |
| src/components/ui/ | Button Promise 守卫、原生输入属性、Radix wrappers、主题 Token 与容器规则。 |
| src/components/modules/tools/ | tool-drafts 的页面所有者、tool-panel 重试、五面板状态迁移、markdown-docx 按动作加载。 |
| src/components/layout/keyboard-shortcuts.tsx | 浮层退让及 IME/defaultPrevented 判断，原导航映射保留。 |
| tests/ui-modernization*.mjs | 真实浏览器流程、DOCX ZIP 校验、按需 chunk 请求与50次暖切换样本。 |
| verification/ | 浏览器结果、性能前后、历史 lint 清单、检查摘要；路径相对本报告目录。 |

官方参考：ui.shadcn.com/docs/tailwind-v4；radix-ui.com/primitives/docs；playwright.dev/docs/ci-intro；github.com/actions/setup-node。参考资料用于接入策略，不替代锁定版本和本仓库测试。DOCX 与 Markdown 从同一内容生成；如缺 LibreOffice，使用 docx-preview/Edge 后备逐页检查，Word 原生分页仍待验证。
