# Azure 第一阶段基础设施

`foundation.json` 是资源组级 ARM 模板，仅创建文件和机密的基础设施；不迁移数据、不部署占位后台、不切换网站。
部署目标：Azure for Students / JackYun / East Asia。
用户要求尽量不付费；具体单价、免费边界和余额核查结果见 [费用核查](cost-review.md)。用户认可已核查价格；赠金余额目前未能核实。

资源：Standard_LRS、StorageV2、Hot 存储账号；5 个私有容器 attachments/exports/backups/avatars/novels；Standard Key Vault；用户分配身份 jackyun-api-identity。
账号与保管库默认名包含资源组派生后缀，避免全球名称冲突；保存实际名称供后续后台配置使用。
本次门户使用 `foundation.parameters.json` 的具体名称：jackyunassets9d26b2cc、jackyun-kv-9d26b2cc。
2026-10-07用户完成创建后，门户实查部署 `CustomDeployment-20261007115534` 显示“部署完成”。资源组现有4项资源：原PostgreSQL及3项基础资源，全部East Asia。
输出：Blob `https://jackyunassets9d26b2cc.blob.core.windows.net/`；Key Vault `https://jackyun-kv-9d26b2cc.vault.azure.net/`；身份principalId `d60884e5-e2db-47e7-9150-a27410656c20`。
实际存储概述确认Standard LRS/StorageV2/Hot、成功、匿名和Shared Key禁用、HTTPS/TLS1.2、Blob和容器软删除7天。
容器列表确认5个目标容器全部专用；另有专用系统容器 `$logs`，存在不证明日志采集或字节占用情况。操作员已验证avatars/novels数据平面读写及全部30个文件字节；其他容器和应用接入仍须实际验证。

- Blob 禁止匿名访问与 Shared Key；仅允许 HTTPS、TLS 1.2。公网服务端点用于鉴权后的浏览器直传，不等于文件公开。
- CORS 仅允许 https://jackyun.top；临时预览域名和本地开发需要单独审核加入，不允许通配域名。
- Blob 与容器软删除保留 7 天，保留的数据也占空间和费用。
- Key Vault 使用 RBAC、7 天软删除与清除保护；删除后至少保留 7 天，清除保护启用后不能取消。
- 此基础模板不授予数据平面角色，不放入密码，不输出机密或存储密钥。用户另行授权的当前操作员临时文件角色只覆盖avatars和novels容器，迁移结束后撤销；用户分配身份尚未附加到后台，也没有文件/机密访问权。
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

本机已在Git忽略目录安装并登录官方Azure CLI 2.91.0，完成文件上传和下载校验；上述模板validate/what-if命令尚未运行。部署实际状态记录在数据迁移文档中，不以模板存在代表已接入。
后续：部署真实 Container Apps 后台与托管身份最小权限 →配置应用机密 →数据库连接/暂存导入 →Blob迁移和附件接口 →应用试点。

依据：[Storage ARM](https://learn.microsoft.com/en-us/azure/templates/microsoft.storage/2023-05-01/storageaccounts)、[Key Vault ARM](https://learn.microsoft.com/en-us/azure/templates/microsoft.keyvault/2023-07-01/vaults)、[托管身份 ARM](https://learn.microsoft.com/en-us/azure/templates/microsoft.managedidentity/2023-01-31/userassignedidentities)。
