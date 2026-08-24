# Companion 扩展测试报告

## 当前安全结果

- `manifest.json` 只包含新生成的公开公钥，不包含私钥。
- 仓库与工作目录 PEM 扫描通过。
- 旧 CRX/ZIP 发布产物已移除。
- API 配置默认关闭：只有 `COMPANION_V1_ENABLED=true` 才启用。
- 后端 API 使用 Bearer token 校验用户，不仅凭扩展 ID 信任请求。

安全遗留：Git 历史中仍能通过提交 `afa0786 fix: 固定扩展 ID` 找到旧私钥内容。当前工作树已清除，历史重写/远程强制推送没有执行，因为这是不可逆的仓库操作，需要仓库负责人单独批准。旧密钥应视为永久撤销并且不能复用。

## 当前发布候选包

- 商店上传 ZIP：`public/downloads/jackyun-companion-v1.0.1.zip`
- ZIP SHA-256：`0fccaad80a5e7247e65a0276a183cfe0e08e7c6358a5570a0763947cae94a332`
- 签名 CRX3：`public/downloads/jackyun-companion-v1.0.1.crx`
- CRX SHA-256：`08edba2ed44f4a727b735f45794d85eaf2676066068dd2035be2cbeb619c34a3`
- 1.0.1：远程配置失败时使用内置公开配置，关键网络请求进行超时重试，Portal Companion API 明确允许固定扩展来源。
- Windows/macOS 安装方式：商店审核前解压 ZIP，并在开发者模式加载；Chrome 官方策略禁止拖入本地 CRX 直接安装。
- 固定开发扩展 ID：`nlckikhapgbekdclakobfopdihiibafl`。
- 公钥 SHA-256 指纹：`db2a8a70f614a32b0ae15ef38788105b662057d813ac5ee87cd68ae5b8031576`。
- OAuth 精确回调：`https://nlckikhapgbekdclakobfopdihiibafl.chromiumapp.org/oauth2`。
- Chrome Web Store Item ID、Edge Add-ons 地址与 OAuth 客户端 ID：仍需对应账号负责人配置。

## 尚未能由本地代码证明的项目

登录、取消授权、OAuth state/PKCE、refresh、离线同步、撤销设备和商店升级测试必须在 Vercel 生产环境变量生效并完成商店安装后执行。当前自动检查已经确认源码 manifest、ZIP manifest、CRX3 签名公钥、固定 ID、文件哈希和发布清单完全一致。
