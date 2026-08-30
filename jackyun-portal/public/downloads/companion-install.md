# JackYun Companion 安装与发布说明

当前修复版为 `1.1.0`，已生成固定 ID 的商店上传 ZIP 和签名 CRX。扩展 ID 为 `nlckikhapgbekdclakobfopdihiibafl`。此版本包含与网页同步的专注计时和可配置 English SafeGuard。

## 本地安装（Windows / macOS Chrome）

Chrome 的安全策略不允许在 Windows 或 macOS 上通过拖放安装商店外 CRX，ZIP 也不能直接拖入安装。审核通过前请使用：

1. 下载 `jackyun-companion-v1.1.0.zip` 并解压到固定目录。
2. 打开 `chrome://extensions` 或 `edge://extensions`。
3. 开启开发者模式。
4. 选择“加载已解压的扩展程序”，选中包含 `manifest.json` 的目录。
5. 确认页面显示 ID `nlckikhapgbekdclakobfopdihiibafl`。

## Chrome Web Store 正式发布

在 Chrome Developer Dashboard 新建 Item，上传 `jackyun-companion-v1.1.0.zip`，填写隐私与权限说明并提交审核。1.1.0 使用 `<all_urls>` 运行 SafeGuard，商店隐私说明需要明确解释：页面只在本地分类；普通学习统计仍只同步域名、类别和有效秒数。审核通过后，用户才能点击商店按钮直接安装，无需开发者模式。

`jackyun-companion-v1.1.0.crx` 是由同一固定私钥生成的 CRX3 签名包，可用于签名核验、Chrome Web Store 的 Verified CRX Uploads 或允许侧载的 Linux/企业环境；它不能绕过 Windows/macOS Chrome 的商店限制。
