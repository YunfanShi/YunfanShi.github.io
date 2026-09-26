# 手机日程与 PWA

/control 的手机导航采用两行布局，六个视图均可见。Cue 学习页顶部提供 CUE 备忘录与全屏按钮；定义卡在手机端随内容展开，长答案不再依赖固定高度翻卡。Cue 管理在手机端使用整页滚动。

## 安装与全屏

/products 是独立 HTML，必须单独引用 /manifest.webmanifest 并注册 /sw.js，不能依赖 React 根布局。

- Chrome / Edge 电脑端与 Android：收到 beforeinstallprompt 时调用原生提示；未收到或失败时显示对应浏览器的手动安装步骤。
- iPhone / iPad：分享菜单 → 添加到主屏幕。Chrome / Edge 没有该选项时，用 Safari 打开相同地址安装。
- Mac Safari：macOS Sonoma 14 或更新版本，文件 / 分享菜单 → 添加到程序坞。
- 安装需要 HTTPS（本地 localhost 调试例外）。没有 beforeinstallprompt 不等于不支持 PWA。
- 全屏使用 Fullscreen API；浏览器不支持或拒绝请求时，显示安装指引。网页无法强制隐藏不支持全屏的浏览器工具栏。

## 验证范围

node --test tests/pwa.test.mts tests/mobile-control-pwa.test.mjs 验证安装配置、浏览器引导分支、提示失败回退和一次性消费。

另需在实际设备与正式 HTTPS 站点验收：安装、从桌面/主屏幕独立启动、长 Cue 答案阅读、键盘弹出时备忘录编辑、全屏进入与退出。用户代理模拟测试不能证明各系统已完成安装。
