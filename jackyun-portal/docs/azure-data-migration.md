# Supabase → Azure 数据迁移交付记录

日期：2026-10-07。用户已授权按平台计划实施，并明确要求迁移 Supabase 数据。
状态：已完成源端盘点、逐表校验和文件备份工具；30个文件已备份并复制到Azure，全部从Azure下载回本机核对路径、大小和SHA-256一致。完整数据库逻辑归档和不含角色密码的角色定义已导出并进行归档检查；尚未导入Azure数据库或切换生产。

## 已实查的数据范围

源项目 gdcwwlnzylrzrqhaaljq，PostgreSQL 17，ACTIVE_HEALTHY。
只读查询确认：82 张 public 业务表、1 张 jackyun_private 私有应用表、8 个 auth.users 账号、30 条 Storage 对象记录。
avatars 为公开桶，novel-files 为私有桶；对象记录不证明对应文件字节仍可下载。
数据库约 110 MiB（115,723,411 字节，包含索引与系统数据，不是备份文件大小）。
引用 auth schema 的外键全库合计84个：public 59个、jackyun_private 1个、auth内部24个；此前把全库84个称作业务表外键不准确。34个public函数文本引用auth.*。
这些是迁移依赖线索，不能代替完整函数、触发器和策略依赖审计。
扩展包括 pgcrypto、uuid-ossp、pg_stat_statements、plpgsql、supabase_vault。
Azure 不具备完整 Supabase 托管服务；不能把 public schema dump 直接恢复后宣布网站可用。
MCP list_tables 的 rows 与实际 COUNT 有明显差异，不作为最终验收依据。

## 可执行的逐表验收

[清单 SQL](../scripts/azure-migration-manifest.sql) 在只读、可重复读事务内扫描 public 和 jackyun_private 的所有普通表和分区根表。
输出真实记录数、列名/类型/可空性和排序后的整行 JSONB 指纹；不会输出行原文。
固定 UTC、日期、浮点及 bytea 格式；重复行保留在指纹计算中，读取顺序不影响结果。
操作账号必须具备所有表读取与 RLS bypass，row_security=off 会让受策略过滤的读取报错，不能静默输出局部数据。
超时或权限错误时禁止把不完整文件当清单。

新版SQL通过Supabase MCP实查执行，返回全部83张应用表的计数、列定义和指纹；私有 `backup_dirty_pages` 有1条待备份页面记录，不能只迁public而遗漏它。
结果保存在本机 `.migration-private/source-application-manifest.json`，不是数据库行备份。
新版格式 `jackyun-application-manifest-v2` 明确声明两个schema；比较器保留旧public-only v1读取能力，但禁止把v1和v2混比当成完整验收。
本机已在Git忽略目录安装官方PostgreSQL 17.11客户端，psql/pg_dump/pg_restore版本检查通过；源端密码已通过会话池实际登录验证，客户端TLS verify-full/TLSv1.3与显式READ ONLY事务验证通过。目标数据库连接曾超时，仍需验证网络与凭据。完整数据库归档CLI已执行；下列逐表清单CLI和数据库导入尚未运行。
连接信息放在操作员本机受保护的 pg_service.conf/pgpass 中，分别命名 jackyun_source、jackyun_target；密码不写命令、仓库或聊天。

```powershell
# 在 jackyun-portal 目录，使用可信的全表读取角色。
New-Item -ItemType Directory -Force .migration-private | Out-Null
psql 'service=jackyun_source' -X -q -A -t -v ON_ERROR_STOP=1 -f scripts/azure-migration-manifest.sql -o .migration-private/source.json
if ($LASTEXITCODE -ne 0) { throw '源清单失败' }
psql 'service=jackyun_target' -X -q -A -t -v ON_ERROR_STOP=1 -f scripts/azure-migration-manifest.sql -o .migration-private/target.json
if ($LASTEXITCODE -ne 0) { throw '目标清单失败' }
node scripts/compare-azure-migration.mjs .migration-private/source.json .migration-private/target.json
if ($LASTEXITCODE -ne 0) { throw '数据不一致或清单无效，禁止切换' }
```

比较器成功退出仅说明两个清单声明范围内的表列、计数和内容指纹匹配；不是完整迁移成功，也不是账号、Storage服务或全数据库备份校验。
MD5 是意外损坏检测指纹，不是抗攻击的备份真实性证明。备份另做 SHA-256 与恢复演练。
两个快照若处于不同写入状态会产生正常差异；正式验收需冻结旧库写入、排空在途操作和队列、停相关定时任务，再导出和采集同一冻结状态。
不要直接重跑覆盖差异；区分源端后续写入和导入遗漏，完成追平后重新验收。
清单与备份统一放 .migration-private（已加入 Git 忽略）；另外设置操作系统访问权限与加密保存。

## 接下来按此顺序执行

### 已保存的应用结构与依赖定义

[结构目录SQL](../scripts/azure-schema-catalog.sql) 在只读事务内采集 public 和 jackyun_private 的关系/列、约束、索引、函数、触发器、策略、序列、枚举/域类型、扩展、默认权限和catalog依赖。
包含作用在auth表上、但调用应用函数的触发器；不会读取数据库行、密码哈希、服务端文件或执行导出的定义。
源端执行成功并保存为 `.migration-private/source-application-schema-catalog.json`；重新读取解析确认范围，文件SHA-256已在本机计算。
实查：87个关系（83张应用表、4个序列）、405个约束、185个索引、70个函数/过程、37个自定义触发器、128个策略、1608条catalog依赖。
这些定义保存在被Git忽略的本机目录中，函数体可能含敏感应用文字，不公开其内容。

此目录是依赖审计输入，不是可直接运行的恢复SQL，也不是pg_dump的替代。
没有保存完整auth/storage托管schema、所有数据库对象或表内数据；catalog依赖也不能发现所有动态SQL/过程体中的字符串引用。
Azure适配仍要核对函数身份上下文、策略、auth触发器、扩展、序列当前值/is_called、角色权限和用户归属，并进行真实恢复与应用读写验证。

```powershell
psql 'service=jackyun_source' -X -q -A -t -v ON_ERROR_STOP=1 -f scripts/azure-schema-catalog.sql -o .migration-private/source-application-schema-catalog.json
if ($LASTEXITCODE -ne 0) { throw '源结构目录失败' }
```

### 完整数据库逻辑归档的实查结果

2026-10-07：官方pg_dump 17.11经共享会话池导出自定义格式的完整数据库归档，使用serializable-deferrable一致事务快照及30秒锁等待限制，退出0、没有警告。未按schema裁剪或剥离对象owner/ACL，不修改源业务数据。
文件大小43,161,215字节，SHA-256为 `1E9426E90C505789C15244D3A98BE0A23490CBBEAD73CED5AC44DCFCEE7C2467`。
本机目录 `.migration-private/database-backup-20261007-164521` 已设为仅当前Windows用户、SYSTEM和管理员可访问，备份与日志均被Git忽略。
pg_restore --list核对82张public表、1张私有应用表以及auth.users、storage.objects/buckets的数据段。随后将全部数据段流式解压而不执行SQL、不保存或输出行明文，退出0、无警告；逐表COPY计数覆盖全部83张应用表，共8153条应用记录、8个auth用户、30条Storage对象记录。
另以pg_dumpall --roles-only --no-role-passwords导出16个角色的定义和成员关系，5,686字节；刻意不导出数据库角色密码。归档验收与逐表行数报告保存在同一受保护目录的archive-verification.json。
客户端conninfo确认TLSv1.3/TLS_AES_256_GCM_SHA384；显式BEGIN READ ONLY事务内transaction_read_only=on。共享池没有把连接options中的默认只读参数转交为后端默认状态，因此不能单凭pg_service.conf的options保证任意SQL只读，应在事务内显式声明。
归档解析/解压和记录数证明备份可读取及当前覆盖范围，不能代替实际恢复演练或源目标逐表内容指纹核对。Vault扩展数据段已纳入归档；加密数据的外部主密钥、角色密码、平台控制面配置和Storage文件字节不属于此数据库归档。
本次是在线初始快照，不是最终冻结快照；源端后续写入仍须在切换前追平。Supabase托管schema、扩展、owner/角色及服务依赖不能原样恢复到Azure后就宣布网站可用；需适配并完成身份/权限和应用恢复验证。

### 文件独立备份工具

[只读文件清单 SQL](../scripts/storage-migration-inventory.sql) 记录原桶、公开性、对象ID、路径、归属、大小、更新时间和原元数据。
2026-10-07通过源项目MCP执行，得到2个桶、30个对象、24,882,492字节；实际清单保存在本机被Git忽略的 `.migration-private/storage-inventory.json`，不发布到仓库。
随后通过已登录的Supabase门户下载catalog、users和头像目录ZIP，保存在本机 `.migration-private` 中。
使用 [门户ZIP导入工具](../scripts/import-storage-downloads.mjs) 校验ZIP CRC与清单覆盖、拒绝未知/重复/不安全路径，复用下述导出器生成独立备份。
实查完成30个文件、24,882,492字节的备份，目录 `.migration-private/storage-backup-20261007`；逐个大小、SHA-256及元数据映射重新读取校验通过。
Azure文件复制及下载回读校验已完成；没有数据库导入，Azure头像容器仍为私有。

```powershell
# 适用于已从门户下载的文件夹ZIP，不需要在终端获取service_role密钥。
node scripts/import-storage-downloads.mjs .migration-private/storage-inventory.json .migration-private/NEW-BACKUP avatars=.migration-private/avatars.zip novel-files=.migration-private/catalog.zip novel-files=.migration-private/users.zip
node scripts/export-supabase-storage.mjs verify .migration-private/NEW-BACKUP
```

ZIP按原桶和对象路径匹配，不直接解压用户路径到磁盘。该方式与API方式一样需要冻结写入后的最终清单和备份；本次是在线准备备份，不是切换时的最终冻结快照。

[文件导出工具](../scripts/export-supabase-storage.mjs) 从清单逐个下载原文件，核对大小并计算SHA-256，保留归属和公开性。
本地用桶/路径组合的哈希作为文件名，原对象名不能跳出备份目录。输出目录必须不存在，避免覆盖之前的完整或失败备份。
任何下载/大小失败都不生成完成清单；只有全部成功才写 `manifest.json` 并重新读取校验。

```powershell
# 先在本机安全配置 SUPABASE_SERVICE_ROLE_KEY，不写进命令、聊天或仓库。
# 清单由上述 SQL 导出；Node.js 24，从 jackyun-portal 目录运行。
node scripts/export-supabase-storage.mjs export .migration-private/storage-inventory.json .migration-private/storage-backup-20261007
if ($LASTEXITCODE -ne 0) { throw '文件备份失败，禁止迁移切换' }
node scripts/export-supabase-storage.mjs verify .migration-private/storage-backup-20261007
if ($LASTEXITCODE -ne 0) { throw '文件备份校验失败' }
```

该工具读取源文件，不上传Azure、不删除Supabase文件、不修改生产。下载会使用Supabase出站额度。
备份目录须由操作员设置Windows访问权限并加密；Node的POSIX mode不等同Windows ACL。备份包含私人路径和文件内容。
最终下载应在写入冻结后重新生成清单，以防清单和文件版本不一致；相同大小不能证明源文件从未变更。
SHA-256检查检测意外损坏，不能抵御攻击者同时篡改清单和字节；完整备份还应保存到独立受保护的位置。
单个文件下载使用SDK返回的内存Blob，当前约25MB文件集适用；未来大文件须改成有界流式下载再运行。
文件映射和哈希供后续Blob上传核对使用；旧私有小说不得因迁移而公开。
6项导出/校验测试覆盖同尺寸损坏、下载失败、重复清单、归属变更、路径穿越和备份覆盖，均通过。

### Azure文件复制的实查结果

2026-10-07：avatars的2个头像由用户从门户上传，novels的28个小说文件通过官方Azure CLI 2.91.0、Entra登录和容器范围RBAC上传。上传未覆盖目标对象，也未删除Supabase源文件。
目标账号为jackyunassets9d26b2cc，保留原对象路径；原novel-files映射到novels，avatars映射到avatars。
从Azure重新下载两个容器的全部对象，核对对象数30、总大小24,882,492字节，以及每个路径、大小和SHA-256，全部一致。验收报告保存在本机被Git忽略的 `.migration-private/azure-roundtrip-verification.json`。
这验证了当前文件字节复制和操作员数据平面读写；原归属、缓存等元数据保留在本机清单中，尚未完成应用元数据接入。两个容器仍为私有，后台运行身份未附加、没有文件权限，网站仍读取Supabase。
用户授权的临时Storage Blob Data Contributor仅授予当前操作员的avatars和novels容器范围，尚未移除；最终追平并完成迁移后撤销。没有授予存储账号级访问或新增其他容器权限。
本次为在线初始快照；正式切换还须冻结旧写入并核对最终清单和增量，不能将此次校验当作最终切换验收。

### 数据、身份和文件切换

1. 备份：完整数据库逻辑备份、角色/扩展/函数/策略/触发器/定时任务清单；文件另行下载。
   pg_dump 的数据库备份不包含 Storage 文件字节。文件清单记录桶、路径、大小、SHA-256、可见性和归属；逐个检查可下载与复制后的字节一致。
2. Azure 试验库：先验证 TLS 与扩展允许列表，再建独立暂存数据库；保留旧 Supabase 服务作为迁移期间唯一写入源。
   未完成身份适配前不把 auth.users 外键替换为空表；先建立保持原 UUID 的应用身份映射。
3. 数据导入：按模块保留全部历史和 ID。同步数据同时迁设备、操作去重、删除标记、冲突和备份；不能只迁可见的当前计划。
   序列 nextval、外键、唯一约束、索引、触发器、RLS、函数分别验收；加密值需要原加密密钥和版本，否则复制密文仍不可用。
4. Blob：复制 30 个现有文件对象并核对字节；公开头像与私有小说权限分别处理。
   私有下载保留用户鉴权，记录旧路径到新对象的映射；应用切换读取并实查旧文件链接兼容后才允许停用旧文件服务。
5. 账号：初期 Supabase Auth 保留，业务数据使用原用户 UUID；后续 Entra 身份绑定到同一 app_user_id。
   验证全部 8 个账号的数据归属，用户互相不可读写；管理员、封禁、授权、恢复路径不能遗漏。
6. 切换：写入冻结、最终备份、最后追平、逐表校验、文件校验和应用全流程验证后，逐模块改为 Azure 唯一写入。
   包括离线修改、重复操作、并发、删除后重连、登录切换、历史备份恢复和大计划表。
7. 回退：先冻结 Azure 写入，把切换后新记录和删除追平到旧库，再切回；禁止仅换回连接串导致新数据丢失。
   旧库与旧对象在观察期保留，退役前重新核对无旧写入及恢复证据。

源端和目标密码已由用户在本机隐藏输入并以Windows DPAPI加密保存，凭据文件限定当前用户、SYSTEM与管理员访问，未进入Git。等待后重新验证，Supabase共享会话池登录成功，密码有效，客户端TLS及显式只读事务已核实；此前连接池认证失败的具体原因未最终确认。Azure连接仍超时，门户显示当前出口IP与现有防火墙单IP规则不一致，目标密码尚未验证。
下一步等待用户确认Azure临时单IP放行，再继续目标网络、密码、恢复及应用接入验证；不扩大为全IP访问，不自动重置密码。密码不在聊天、命令文本或仓库中提供。
源端83表指纹扫描、应用结构目录采集和16项表清单/文件备份/ZIP导入测试已通过；Azure文件上传及30个对象的下载回读SHA-256校验已通过；数据库逻辑归档、角色配置导出及归档数据段检查已通过；Azure数据库导入、身份迁移和网站切换仍未验证。

参考：[PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)、[XML 查询映射](https://www.postgresql.org/docs/17/functions-xml.html)。
