# JackYun Companion 安装与发布说明

当前 BETA 预览版为 `1.7.7`，稳定签名候选版为 `1.1.0`。扩展 ID 固定为 `nlckikhapgbekdclakobfopdihiibafl`。1.7.7 会识别 JSON、NDJSON、JSONL 和 JSON Schema 输出请求，原样读取网页正文或代码块，避免 Markdown 转义破坏结构化结果；并保留 1.7.6 的目标 AI 页面英文进度遮罩。

## 本地安装（Windows / macOS Chrome）

Chrome 的安全策略不允许在 Windows 或 macOS 上通过拖放安装商店外 CRX，ZIP 也不能直接拖入安装。审核通过前请使用：

1. BETA 用户下载 `jackyun-companion-v1.7.7.zip` 并解压到固定目录。
2. 打开 `chrome://extensions` 或 `edge://extensions`。
3. 开启开发者模式。
4. 选择“加载已解压的扩展程序”，选中包含 `manifest.json` 的目录。
5. 确认页面显示 ID `nlckikhapgbekdclakobfopdihiibafl`。

## Chrome Web Store 正式发布

`1.7.7` 当前只作为站内 BETA ZIP 发布，不应直接替换商店 Stable 版本。完成 BETA 验证后，可在 Chrome Developer Dashboard 上传同一来源生成的发布 ZIP，填写隐私与权限说明并提交审核。扩展使用 `<all_urls>` 运行 SafeGuard、页面净网与可选工具，并使用 `scripting` 在扩展更新后恢复已打开页面的 Companion 桥接。商店隐私说明需要明确解释：页面只在本地分类和清理；普通学习统计仍只同步域名、类别和有效秒数；对话与模型识别只读取本机已打开标签页里的可见信息；只有用户在 Portal 明确开启网页 AI 自动化时，Prompt 才会填写到所选第三方 AI 网站。

`jackyun-companion-v1.1.0.crx` 是由同一固定私钥生成的 CRX3 签名包，可用于签名核验、Chrome Web Store 的 Verified CRX Uploads 或允许侧载的 Linux/企业环境；它不能绕过 Windows/macOS Chrome 的商店限制。
