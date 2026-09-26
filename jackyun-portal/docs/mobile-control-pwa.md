# 手机日程与 PWA

/control 在 768px 以下使用手机专用布局：顶部统计为紧凑文字，保留“添加任务”，Cue 管理与课表导入收进“管理”；六个视图用单行横向滚动导航。任务卡的延期、取消与滴答操作放到内容下方，联合任务及其子操作仍完整保留。周课表改为按天纵向排列，可点击某一天进入当日任务；平板和电脑保留七列课表。添加任务、课表导入和学习记录弹窗铺满手机视口并支持内部滚动，表单输入字号至少 16px，底部保留安全区。Cue 学习页顶部提供 CUE 备忘录与全屏按钮；定义卡在手机端随内容展开，长答案不再依赖固定高度翻卡。Cue 管理在手机端使用整页滚动。

## 安装与全屏

/products 是独立 HTML，必须单独引用 /manifest.webmanifest 并注册 /sw.js，不能依赖 React 根布局。

- Chrome / Edge 电脑端与 Android：收到 beforeinstallprompt 时调用原生提示；未收到或失败时显示对应浏览器的手动安装步骤。
- iPhone / iPad：分享菜单 → 添加到主屏幕。Chrome / Edge 没有该选项时，用 Safari 打开相同地址安装。
- Mac Safari：macOS Sonoma 14 或更新版本，文件 / 分享菜单 → 添加到程序坞。
- 安装需要 HTTPS（本地 localhost 调试例外）。没有 beforeinstallprompt 不等于不支持 PWA。
- 全屏使用 Fullscreen API；浏览器不支持或拒绝请求时，显示安装指引。网页无法强制隐藏不支持全屏的浏览器工具栏。

## 验证范围

2026-09-26 本地 Chrome 浏览器验证：390×844 与 320×568 的课表导入、长名称课程、长标题任务、完成记录弹窗、添加任务表单滚动到底部、设置视图；整页宽度等于视口宽度。1280×900 验证桌面管理按钮和任务侧边操作保留。浏览器没有捕获到控制台错误。这是桌面浏览器的小屏尺寸验证，尚未替代真实 iPhone Safari / Chrome 的键盘与安全区验收。

`node --test tests/learning-domain.test.mts` 包含手机布局回归检查。

node --test tests/pwa.test.mts tests/mobile-control-pwa.test.mjs 验证安装配置、浏览器引导分支、提示失败回退和一次性消费。

另需在实际设备与正式 HTTPS 站点验收：安装、从桌面/主屏幕独立启动、长 Cue 答案阅读、键盘弹出时备忘录编辑、全屏进入与退出。用户代理模拟测试不能证明各系统已完成安装。

## 2026-09-26 follow-up

The canonical route is `/schedule`; `/control` permanently redirects and preserves existing links. Cue study is rendered into document.body with an opaque viewport overlay; the portal shell becomes inert and background scrolling is locked until exit. Definition cards retain the same flip control on phone and desktop, with a smaller minimum height on phones.

## Touch-first study

Below 768px Cue study uses question and evidence pages for all recall types, with tap-to-reveal, persistent bottom navigation, and three inline ratings. Choice cues require selecting an option before evidence; correct and chosen answers remain visible. Long evidence scrolls inside the content region while controls stay visible. Shuffle, jump-to-Cue, memo, fullscreen, content revision and early completion remain in the learning tools menu. Desktop study retains its layout and keyboard controls. Subject/unit/status filters use native selects on phones with identical predicates and options.

The portal shell now isolates its stacking context so floating tools cannot overlay Cue study. The full-screen dialog explicitly overrides the generic mobile dialog height cap that left a 16px gap. The shared phone topbar moves theme/fullscreen/logout into More and retains notifications/account/sync. Portal form fields use 16px type to avoid iOS focus zoom; buttons have a 44px minimum height.

Math rendering shares one parser for headings, descriptions, answers and list titles. Explicit LaTeX remains authoritative; plain expressions with equality, subscripts, powers, Unicode superscripts and square roots are also rendered with KaTeX. Slash-only terminology such as CSMA/CD and TCP/IP is left unchanged. Ambiguous plain text is not inferred as math; explicit LaTeX is available for complex expressions. Wide expressions scroll locally, and MathML exposes equations to assistive technology.

Verified using a temporary isolated sample (removed before commit): 390x844 and 320x568 phone viewports, Definition/process/choice reveal, long evidence scrolling, correct-choice marking, rating, tools, memo and exit; 1280x900 desktop controls retained. Real physical iPhone Safari/Chrome verification remains outstanding.
