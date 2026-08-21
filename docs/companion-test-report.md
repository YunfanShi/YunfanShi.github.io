# Companion 扩展测试报告

## 当前安全结果

- `manifest.json` 不再包含私钥或 `key` 字段。
- 仓库与工作目录 PEM 扫描通过。
- 旧 CRX/ZIP 发布产物已移除。
- API 配置默认关闭：只有 `COMPANION_V1_ENABLED=true` 才启用。
- 后端 API 使用 Bearer token 校验用户，不仅凭扩展 ID 信任请求。

安全遗留：Git 历史中仍能通过提交 `afa0786 fix: 固定扩展 ID` 找到旧私钥内容。当前工作树已清除，历史重写/远程强制推送没有执行，因为这是不可逆的仓库操作，需要仓库负责人单独批准。旧密钥应视为永久撤销并且不能复用。

## 当前开发包

- 文件：`public/downloads/jackyun-companion-dev-v1.0.0.zip`
- SHA-256：`62f36706da0f842dfb87f6116e080695d9f2cd540fe4a2f73e3a6f71cfb1eb52`
- 安装方式：开发者模式加载解压缩目录。
- 正式扩展 ID、公钥指纹、Chrome Web Store Item ID、Edge Add-ons 地址：待商店/开发者账号配置。

## 尚未能由本地代码证明的项目

登录、取消授权、OAuth state/PKCE、refresh、离线同步、撤销设备、跨浏览器固定 ID 和商店升级测试必须在真实扩展运行时和 Supabase OAuth 客户端配置完成后执行。
