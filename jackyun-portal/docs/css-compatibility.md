# 手机浏览器样式兼容

部分 Android 浏览器使用系统旧 WebView。Tailwind 4 的 CSS 层、现代颜色及独立变换属性会超过旧内核能力；不支持 CSS 层时，整个布局工具类块可能被丢弃。

使用 Tailwind 3.4 和 Autoprefixer 输出普通 CSS。`tailwind.config.mjs` 扫描 `src` 下的组件，并保留 `data-theme="gray"` / `data-theme="dark"` 主题和 Typography。不要直接升级回 Tailwind 4；升级前必须验证旧 Android 内核。此调整降低基础样式要求，不保证任意旧浏览器都支持 Next.js 或页面中的所有增强效果。

Service Worker 验证 CSS/JS 的响应类型，避免把 HTML 错误页缓存为样式；缓存读写失败不能阻断网络资源。页面在初始加载、资源错误或重新联网时，对缺失的站内 Next.js 样式重试一次，不自动刷新或清空用户数据。

运行 `npm run test:pwa` 检查生成的 CSS、主题、样式重试及缓存故障，再运行 `npm run build`。发布后仍需用受影响的真实设备确认：普通浏览器和主屏幕模式均能显示布局；浅色、灰色、深色主题正常；从旧版本更新后及网络恢复后仍能加载样式。
