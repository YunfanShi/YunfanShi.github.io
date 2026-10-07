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
数据库已完成独立暂存恢复与逐表核对，Blob已有文件已复制并下载回读验证。后续：后台网络与费用配置 →真实Container Apps服务和登录身份 →应用机密及文件授权接口 →应用试点与最终数据追平。

## 同步角色配置与演练

2026-10-07：[sync-runtime.sql](sync-runtime.sql) 已在jackyun_migration_20261007执行并验证可重复应用。[实际RPC演练](tests/sync-runtime.sql) 执行成功，全部测试写入和临时对象回滚；测试前后83张应用表的列、行数和内容指纹一致。
两个脚本仅接受jackyun_migration_YYYYMMDD名称的隔离库，错误地指向默认postgres库时已实测拒绝并回滚。不要更改守卫后直接在Supabase或正式数据库运行。

角色jackyun_sync_runtime为NOLOGIN、非超级用户、无BYPASSRLS/建库/建角色权限，不拥有表、函数、schema或数据库。继承authenticated仅用于匹配原行策略，不能SET ROLE authenticated或管理角色。独立普通登录jackyun_sync_login仅能SET ROLE该执行角色，不能继承其权限或管理角色；随机密码仅存本机受保护的DPAPI文件，尚未写入Key Vault或云端服务。
授权仅覆盖legacy_sync_data、web_sync_devices、web_sync_upload_chunks、sync_operations、sync_conflicts的必要操作，以及auth.uid、sync_identity_allowed、normalize_web_sync_value、apply_web_sync_operation、list_web_sync_records、get_web_sync_record_part的执行。sync_identity_allowed只返回当前身份是否有未删除的active资料，不接受其他用户ID。没有auth.users读取、profiles更新、私有备份读取、管理员RPC或schema创建权限。
恢复时省略ACL会留下函数的默认PUBLIC执行权限，本配置在应用/auth/私有schema撤销这些权限，再明确授予上述函数。当前迁移操作员未来创建函数的默认PUBLIC执行也已撤销，并以事务内临时函数实测；其他对象创建角色的默认权限仍须分别配置。

实测覆盖：初次写入与匹配版本更新、同一操作重试不重复、较旧离线修改返回远端状态、跨用户插入/改归属失败、另一用户无法读取记录和操作历史/使用他人设备、大值列表不返回正文、中文/emoji全部分块重组、过期版本/越界分块、删除标记、旧修改不能复活删除、撤销设备拒写，以及缺少身份时拒绝读写。
验证使用现有的两个auth账号UUID，结果不输出用户标识或私人行；依赖实际恢复的函数、策略和触发器。不是HTTP服务、登录令牌验证、连接池并发或全模块生产验收。

```powershell
# 使用已安全配置的凭据；不要把密码粘贴到命令里。
psql "service=jackyun_target dbname=jackyun_migration_20261007 options='-c default_transaction_read_only=off'" -X -v ON_ERROR_STOP=1 -f azure/sync-runtime.sql
if ($LASTEXITCODE -ne 0) { throw '同步角色配置失败' }
psql "service=jackyun_target dbname=jackyun_migration_20261007 options='-c default_transaction_read_only=off'" -X -v ON_ERROR_STOP=1 -f azure/tests/sync-runtime.sql
if ($LASTEXITCODE -ne 0) { throw '同步RPC演练失败' }
```

独立后台已实现先验证令牌，再在同一连接的数据库事务内设置最小身份、核对账号状态和设备；提交或回滚清除上下文。并发写入按用户加事务锁；不会接受浏览器提供的user_id作为身份。普通登录的实际HTTP演练通过，账号不存在时403、连接池跨用户隔离、相同操作并发重试均已验证，测试清理后83表指纹与基线相同。代码、配置与验证边界见 [后台说明](backend/README.md)。
应用对象与SECURITY DEFINER函数仍归迁移管理员所有，部署前还需专用owner与逐函数执行范围审计。此次未创建Container App、放宽防火墙、迁移身份服务或切换网站，未增加计算资源。

参考：[PostgreSQL角色授权](https://www.postgresql.org/docs/17/sql-grant.html)、[默认权限](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)、[SET ROLE](https://www.postgresql.org/docs/17/sql-set-role.html)。

依据：[Storage ARM](https://learn.microsoft.com/en-us/azure/templates/microsoft.storage/2023-05-01/storageaccounts)、[Key Vault ARM](https://learn.microsoft.com/en-us/azure/templates/microsoft.keyvault/2023-07-01/vaults)、[托管身份 ARM](https://learn.microsoft.com/en-us/azure/templates/microsoft.managedidentity/2023-01-31/userassignedidentities)。
