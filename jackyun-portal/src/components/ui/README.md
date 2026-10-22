# JackYun 基础 UI

第一批采用 shadcn/ui 的可维护组件源码分层方式，手工适配现有 Tailwind 3 与 `data-theme`。Radix 提供 Tabs、Dialog 和 Slot 行为，CVA 管理 Button 变体。这些文件是项目维护的适配层，没有运行最新版 CLI，也没有引入第二套 Router、表单库、Toast 或主题 Provider。

参考：[shadcn/ui](https://ui.shadcn.com/docs)、[Tailwind 兼容说明](https://ui.shadcn.com/docs/tailwind-v4)、[Radix](https://www.radix-ui.com/primitives)。后续引入官方组件源码时须记录来源版本及许可，逐个核对 Tailwind 3 类名和 CSS 变量，不能直接覆盖全局 CSS。

- `Button`：默认 `type="button"`；保留原生 props/ref；Promise 返回的 `onClick` 在调用后立即进入 busy，ref 阻止同一操作重复进入，finally 解除。调用方负责捕获并展示业务错误，保存失败不能清空输入。`asChild` 用于保持单个语义元素，不嵌套链接/按钮。
- `Input`、`Textarea`：显式 label、错误描述由调用方提供；手机输入字号 16px，触控高度至少 44px。
- `Tabs`：受控 value；工具箱使用 manual activation，方向键移动焦点，Enter/Space 打开。组件不负责保存业务状态，不使用 forceMount 保留全部面板。
- `Dialog`：受控或非受控 open 均沿用 Radix；必须提供 Title/Description。触发时通过 `getDialogContainer(trigger)` 选择最近主题/全屏容器，并传入 `portalContainer`。嵌套菜单先关闭再打开 Dialog；本批没有新增 Sheet、Select、DropdownMenu，不能宣称这些已迁移。
- `ui.css`：只新增 `--ui-*` Token 和 `.jy-*` 类；已有十六进制颜色不转成 HSL；不改变 Tailwind `darkMode`、品牌设置和现有主题持久化。Tabs 选中背景与文字同时立即切换，避免背景渐变期间白字消失。

`siteAlert/Confirm/Prompt` 继续用于站内即时确认，保留原生 dialog 队列、Shadow DOM 与 top layer，未替换为 Radix。全局快捷键在新 Dialog 打开时退让给浮层。

工具箱 `ToolDraftProvider` 只覆盖当前工具箱页面。它保存输入、输出和转换参数，不持久化、不调用同步接口；离开路由或刷新后会结束。其他页面直接使用工具组件时仍可用局部 state。业务已保存数据、离线队列、计时 controller 的状态所有者没有改变。

运行回归：生产构建并启动后执行 `npm run test:ui-modernization`。默认使用本机 Edge；CI 设置 `JACKYUN_BROWSER_CHANNEL=chromium`，先运行 `npx playwright install --with-deps chromium`。`npm run test:ui-performance -- after` 记录 50 次实验室暖切换，指标是必要 DOM 可见加两帧 RAF 的代理值，不等同 INP 或真实呈现时刻。
