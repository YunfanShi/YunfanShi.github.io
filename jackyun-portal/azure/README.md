# Azure 第一阶段基础设施

`foundation.json` 是资源组级 ARM 模板，仅创建文件和机密的基础设施；不迁移数据、不部署占位后台、不切换网站。
部署目标：Azure for Students / JackYun / East Asia。

资源：Standard_LRS、StorageV2、Hot 存储账号；5 个私有容器 attachments/exports/backups/avatars/novels；Standard Key Vault；用户分配身份 jackyun-api-identity。
账号与保管库默认名包含资源组派生后缀，避免全球名称冲突；保存实际名称供后续后台配置使用。
本次门户使用 `foundation.parameters.json` 的具体名称：jackyunassets9d26b2cc、jackyun-kv-9d26b2cc；名称能否创建以门户预验证为准。
2026-10-07 门户已接收此模板及参数，最终验证结束后“创建”按钮可用，未显示验证错误；尚未点击创建，资源仍未部署。部署和数据平面访问需要后续实际验证。

- Blob 禁止匿名访问与 Shared Key；仅允许 HTTPS、TLS 1.2。公网服务端点用于鉴权后的浏览器直传，不等于文件公开。
- CORS 仅允许 https://jackyun.top；临时预览域名和本地开发需要单独审核加入，不允许通配域名。
- Blob 与容器软删除保留 7 天，保留的数据也占空间和费用。
- Key Vault 使用 RBAC、7 天软删除与清除保护；删除后至少保留 7 天，清除保护启用后不能取消。
- 当前不授予任何新数据平面角色，不放入密码，不输出机密或存储密钥。用户分配身份尚未附加到后台，也没有文件/机密访问权。
- Key Vault 的公网端点仍要求 Entra 鉴权与 RBAC。后续后台身份仅读所需机密；添加权限时分别核对 scope。
- 不创建 Files 共享盘、虚拟机、AKS、SFTP、Front Door、专用终结点或付费常驻计算。

部署步骤：Azure 门户“部署自定义模板”→“在编辑器中生成自己的模板”→粘贴文件→选择 JackYun →审阅并创建。
先检查门户预验证和实际名称。最终创建会接受 Azure 显示的条款，并可能产生按量费用；不能把 JSON 解析或门户预验证当成部署成功。
预算提醒不是容量硬上限，免费额度按个人订阅和到期时间核对；应用上线前还需容量/上传预约限制及费用提醒。

若已安装并登录官方 Azure CLI，可先执行只读预检：

```powershell
az deployment group validate --resource-group JackYun --template-file azure/foundation.json --parameters '@azure/foundation.parameters.json'
az deployment group what-if --resource-group JackYun --template-file azure/foundation.json --parameters '@azure/foundation.parameters.json'
```

本机当前无 Azure CLI，上述命令尚未运行。部署实际状态记录在数据迁移文档中，不以模板存在代表已接入。
后续：部署真实 Container Apps 后台与托管身份最小权限 →配置应用机密 →数据库连接/暂存导入 →Blob迁移和附件接口 →应用试点。

依据：[Storage ARM](https://learn.microsoft.com/en-us/azure/templates/microsoft.storage/2023-05-01/storageaccounts)、[Key Vault ARM](https://learn.microsoft.com/en-us/azure/templates/microsoft.keyvault/2023-07-01/vaults)、[托管身份 ARM](https://learn.microsoft.com/en-us/azure/templates/microsoft.managedidentity/2023-01-31/userassignedidentities)。
