# JackYun Companion 开发包安装说明

这是审核前的开发测试包，不是 Chrome Web Store 或 Edge Add-ons 正式发布包。

1. 下载 `jackyun-companion-dev-v1.0.0.zip` 并解压到本地受控目录。
2. 打开 `chrome://extensions` 或 `edge://extensions`。
3. 开启开发者模式。
4. 选择“加载已解压的扩展程序”，选中包含 `manifest.json` 的目录。
5. 在扩展详情中记录 ID，并用 `chrome.identity.getRedirectURL('oauth2')` 取得精确 OAuth 回调。

正式发布前不得把开发包描述为“一键安装”，也不得把开发包 ID 用作正式 OAuth ID。
