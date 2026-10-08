# Supabase → Azure 数据迁移交付记录

日期：2026-10-07。用户已授权按平台计划实施，并明确要求迁移 Supabase 数据。
状态：30个文件已备份并复制到Azure，下载回读校验通过。完整数据库逻辑归档已成功恢复到Azure独立迁移库；83张应用表的列定义、行数和内容指纹匹配，结构与同步表两用户读取隔离已核对。尚未接入生产后端或切换网站，最终冻结追平仍待完成。

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
本机已安装官方PostgreSQL 17.11客户端；源端会话池及Azure实际登录均成功，客户端TLS verify-full/TLSv1.3与显式READ ONLY事务验证通过。完整归档、独立Azure迁移库恢复以及双方逐表清单CLI已执行。
连接配置在受保护的pg_service.conf中，密码以Windows DPAPI保存，仅解密到PostgreSQL子进程的临时环境；不写明文pgpass、命令、仓库或聊天。服务名分别为jackyun_source、jackyun_target，目标验收须明确指定dbname=jackyun_migration_20261007，不能误查默认postgres库。

```powershell
# 在 jackyun-portal 目录，使用可信的全表读取角色。
New-Item -ItemType Directory -Force .migration-private | Out-Null
psql 'service=jackyun_source' -X -q -A -t -v ON_ERROR_STOP=1 -f scripts/azure-migration-manifest.sql -o .migration-private/source.json
if ($LASTEXITCODE -ne 0) { throw '源清单失败' }
psql 'service=jackyun_target dbname=jackyun_migration_20261007' -X -q -A -t -v ON_ERROR_STOP=1 -f scripts/azure-migration-manifest.sql -o .migration-private/target.json
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

### Azure独立数据库恢复的实查结果

2026-10-07：在现有jackyunasia服务器创建jackyun_migration_20261007，撤销PUBLIC数据库连接权限。未新增服务器、计算规格或付费服务；该库仍占用现有服务器的存储和备份用量，不代表无限免费。
Azure允许列表已配置pgcrypto、uuid-ossp、pg_stat_statements；目标实际安装这三项及plpgsql。Azure不提供supabase_vault，本次归档Vault secrets为0条，应用函数未发现Vault文本引用；这不替代后续动态依赖审计。
从完整归档的TOC选择public、jackyun_private、auth、storage、extensions及上述扩展，保留83张应用表、auth/storage数据和所有70个应用函数。排除Supabase控制面schema与托管实时发布配置，不原样导入16个源角色的超级用户属性和成员关系。
仅创建anon/authenticated两个NOLOGIN策略兼容角色。以--no-owner和--no-privileges恢复，对象归迁移管理员所有；源owner/ACL仍保存在完整归档。运行角色、最小权限、SECURITY DEFINER所有者与可执行范围必须另外适配，禁止管理员作为线上API账号。
首次单事务恢复因answer_sheet_broadcasts引用缺失的supabase_realtime发布而失败；已确认所有应用对象回滚为0。排除这一条托管发布成员后再次以--single-transaction/--exit-on-error恢复，退出0、日志无警告。业务广播表仍保留；Azure实时推送链路未实现，不能认为旧订阅在Azure可用。

验收证据保存在本机受保护备份目录的azure-staging-verification.json及相关日志：

- 源清单采集09:08 UTC，目标09:15 UTC：全部83张应用表的列定义、8153条记录计数和逐表内容指纹一致；未输出私人行。
- 87个关系、185个索引、70个函数、37个自定义触发器、128条策略、4个序列核对一致。结构比较明确排除owner/ACL、默认权限和角色成员关系；这些仍需运行权限审计。
- 405个约束全部存在且validated。唯一原始定义差异是web_sync_upload_chunks_check的AND表达式括号展平；81组边界/空值比较没有行为差异，保留原始比较失败及明确的等价核对记录，不泛化忽略其他约束差异。
- 目标auth.users为8条、storage.objects为30条；恢复身份数据不等于迁移Supabase Auth服务或证明所有会话可用。
- 在事务内临时授予同步表读取并SET ROLE authenticated（无BYPASSRLS），两个有数据账号各自只读自己的legacy_sync_data，缺失身份读到0条。全部临时授权回滚，确认authenticated没有数据库连接或同步表读取权限。此检查覆盖同步表读取，不能代替全模块写入、RPC及身份令牌验收。

本次是在线初始恢复与采样对比，没有冻结旧写入，也未验证后台API、同步操作、删除/重试、文件授权或生产切换。旧Supabase仍是网站唯一写入来源；最终切换必须重新冻结、备份、追平和验收。

后续进展：普通同步执行角色与独立普通登录已配置；本机独立HTTP后台通过Azure真实数据库演练，覆盖并发去重、连接池两用户隔离、账号资料不存在时拒绝、删除/设备撤销，以及26段Unicode大值上传和完整下载。测试记录、设备及原备份标记已精确清理/还原，83表的列、行数和指纹与演练前一致。完整权限与命令见 [同步角色配置与演练](../azure/README.md#同步角色配置与演练)、[后台说明](../azure/backend/README.md)。令牌使用受控测试签名；真实Supabase签发令牌、对象owner审计、云端部署、浏览器接入及最终生产切换仍待完成。

### 文件独立备份工具

[只读文件清单 SQL](../scripts/storage-migration-inventory.sql) 记录原桶、公开性、对象ID、路径、归属、大小、更新时间和原元数据。
2026-10-07通过源项目MCP执行，得到2个桶、30个对象、24,882,492字节；实际清单保存在本机被Git忽略的 `.migration-private/storage-inventory.json`，不发布到仓库。
随后通过已登录的Supabase门户下载catalog、users和头像目录ZIP，保存在本机 `.migration-private` 中。
使用 [门户ZIP导入工具](../scripts/import-storage-downloads.mjs) 校验ZIP CRC与清单覆盖、拒绝未知/重复/不安全路径，复用下述导出器生成独立备份。
实查完成30个文件、24,882,492字节的备份，目录 `.migration-private/storage-backup-20261007`；逐个大小、SHA-256及元数据映射重新读取校验通过。
Azure文件复制及下载回读校验已完成，独立数据库恢复见上节；Azure头像容器仍为私有，网站尚未接入。

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

源端和目标密码已由用户在本机隐藏输入并以Windows DPAPI加密保存，凭据文件限定当前用户、SYSTEM与管理员访问，未进入Git。等待后重新验证，Supabase共享会话池登录成功，密码有效，客户端TLS及显式只读事务已核实；此前连接池认证失败的具体原因未最终确认。用户添加当前出口单IP规则后，Azure管理员实际登录成功，PostgreSQL 17.11及客户端verify-full/TLSv1.3已核实。
防火墙仅保留两个客户端单IP规则，没有全IP或所有Azure服务放行。密码不在聊天、命令文本或仓库中提供。旧源库仍是网站的唯一写入来源；隔离迁移库恢复和后续应用接入分别验收。
源端83表指纹扫描、应用结构目录采集和16项表清单/文件备份/ZIP导入测试已通过；Azure文件下载回读校验、数据库逻辑归档与隔离库实际恢复、83表双方内容核对及同步表两用户读取隔离已通过。运行权限适配、身份服务迁移、应用读写和网站切换仍未验证。

参考：[PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)、[XML 查询映射](https://www.postgresql.org/docs/17/functions-xml.html)。

## 2026年10月8日 macOS切换前复查

以main的acaa314e（3.21.2）为基线，修复候选为3.21.3，生产入口尚未切换。用户在macOS隐藏输入两端数据库密码完成只读预检；CA校验通过，用户添加出口IP白名单后Azure连接恢复。本次确认83张应用表、8个账号，账号状态一致；14张表有数据差异，详见同目录的`azure-cutover-and-database-access-plan.docx`。五张同步表中，设备19对18条、操作4435对4414条、同步数据249对249条但内容不同；冲突222对222条、上传分块0对0条且内容一致。

修复默认只读预检、私有报告、失败步骤诊断、提交结果区分及精确权限与触发器恢复；9项工具测试、16项后台测试、70项同步回归、TypeScript和生产构建通过。隔离本机PostgreSQL17实际验证目标失败回滚、源ACL恢复、五表复制、Unicode、写入冻结和触发器状态通过。全仓库lint仍有16个现存错误、1个警告，生产发布未通过完整门槛。

邮箱密码单账号验收返回REAL_LOGIN_FAILED，未通过。浏览器现有网站会话有效，页面显示6项待上传和分片409；Azure真实身份仍未通过验收。只读聚合发现14项缓存远端结果已过期，其中6项为大值；修复两端API在重试远端决策时读取当前用户最新记录，保留原去重决策和本地队列，新增3项回归测试通过。不能据聚合结果认定它们就是页面的6项队列。双用户真实身份验收、最新备份恢复演练、反向同步演练、写入入口暂停与排空、最终五表追平、网站生产变量配置和24小时观察仍待完成。历史Windows私有归档不在本机，不能当作本机现有可恢复备份。第二阶段数据库访问改造尚未开始。

入口审计确认日程恢复、批量导入及备份恢复还有旧库直接或间接写入，备份导出也仍读取旧同步值。完整清单见[同步入口审计](azure-sync-entry-audit.md)。这些入口和备份来源尚未适配，五个API转发不等于全入口完成，当前禁止启用生产转发。

后续候选代码已适配数据导出、导入预览和同步项导入。新增Azure分页导出，避免500条截断；导出后复查版本清单，源持续变化时拒绝完成。大值经分块传输，导入只接受准确操作确认。8项新传输测试及隔离PostgreSQL真实SQL/RLS分页、Unicode游标、A/B/A账号切换测试通过；这些不是生产真实登录验收。本轮进一步适配了日程恢复、手动页面备份及课表版本检查；自动备份和整页恢复协调仍待完成，生产未启用。

候选新增create_backup_page_with_sync，仅在隔离PostgreSQL17执行验证：当前Azure同步值与源端业务表一起保存，当前账号/同用户/同页面校验、停用和删除拒绝、匿名拒绝、旧表冻结时无写入、改动标记保留均通过。6项传输恢复回归验证备份失败或备份后版本变化时不写Azure。迁移文件尚未应用生产。自动备份和整页恢复在Azure配置存在时明确拒绝旧路径，仍是切换阻塞项。单账号登录工具补充脱敏原因分类；先前REAL_LOGIN_FAILED仍未确定原因。浏览器测试因本机锁屏无法继续，未绕过锁屏。

恢复请求额外要求当前版本：后台在同一用户写锁和事务内复核版本与哈希，变化返回RESTORE_VERSION_CHANGED，避免客户端最终读取与写入之间的窗口被普通时间决策覆盖；分块完成也执行同一检查。候选后台必须先部署验证，不能只部署网站。

自动备份后续候选已实施两端独立改动编号、源端合并快照回执及后台提交证明核验。仅在隔离两库PostgreSQL和Azure SDK验证完整路径，覆盖旧表冻结无写入、确认失败重试不重复造版本、备份期间新改动保留、账号隔离和匿名/停用/删除拒绝；相关SQL未应用生产。共享HTTP允许列表补齐导出及改动标记端点。新自动备份应用路径不再调用旧RPC；源端旧RPC切换保护候选已验证，整页恢复协调仍待完成，不能宣称切换准备全部通过。

候选新增20261008014450_guard_legacy_backup_source.sql，默认仍使用Supabase。三个旧公开备份RPC保留原实现但经私有状态保护；Azure成为来源后拒绝过期快照和旧整页恢复。切换编排先锁私有控制行排空在途旧RPC，再锁五表，并在同一源事务切换状态；目标失败时恢复原状态与ACL。缺少保护时只读预检仍可运行并报告未就绪，apply在修改前拒绝。9项工具测试和隔离PG17验证在途锁等待、真实旧函数兼容、三个RPC拒绝、Azure桥接仍可保存以及失败状态恢复。此SQL尚未应用生产，反向复制后才能人工执行归档的旧入口恢复SQL。

回退候选新增 `azure-sync-reverse-copy.mjs`（默认只读）与 `azure-reverse-preflight.command`。apply 要求24小时内匹配项目与目标库的私有证据：两端写入已暂停、两端备份及真实恢复演练、文件SHA256；未满足拒绝生产修改。先冻结Azure五表及备份标记，再完整回灌五表和合并两端标记，保留源端权威账号状态；源端原ACL和触发器O/D/R/A保持原样。回灌后两端仍冻结，不自动修改网站入口或恢复旧RPC；只有核对提交结果并明确入口选择后才能使用归档恢复SQL。

本机PG17验证回灌新增、删除标记、中文emoji、备份标记合并和新generation，注入源事务失败后旧数据保留、Azure继续冻结；修复UTC指纹复查的时区差异。10项工具测试和两个隔离数据库集成流程通过。正式源保护迁移改为Supabase CLI生成的 `20261008014450_guard_legacy_backup_source.sql`；原未应用的候选文件被替换，不影响生产迁移历史。整页恢复协调、真实身份验收、备份实际恢复、部署、最终追平和24小时观察仍未完成，生产仍未切换。

整页恢复候选新增正式CLI迁移 `20261008014506_azure_page_restore_coordination.sql`。私有恢复作业保存请求别名、所选历史快照、恢复前版本、每键期望版本和固定操作编号，网络丢失后复用计划；已提交操作仅在账号、键和内容哈希匹配时重放确认，不能绕过新的未提交操作的版本保护。全部同步项读回核对后，源端独立事务锁定业务表、保存处理中业务修改的最终检查点，再按原合并语义恢复业务行，不写旧同步表。跨账号ID碰撞拒绝，私有作业无客户端直接访问权；停止恢复保留部分结果及恢复前版本，不自动回滚。

网页先保存本地页面，按账号和版本在sessionStorage保留请求编号，恢复期间新本地值和新队列操作保留。73项同步及16项后台回归、修改文件lint、TypeScript、90路由构建通过；隔离PG17验证源端作业重试、完成响应丢失、前后检查点、跨账号碰撞及取消。新增隔离两库完整恢复链路经真实同步SQL和Azure SDK验证：目标提交后HTTP回应丢失，重试复用同一操作，不重复写；当前值已与历史版本一致时接受哈希与状态匹配的SQL无变更确认。不能把这些证明扩大为所有页面或生产完整验收。新Functions包已构建（SHA256 5d99493b1a22fde2613fe1e4da68621bdf417ecc42d5b67ee2822f996592f3a9），未部署。真实身份、全部页面完整路径、最新备份恢复、迁移生产安装与最终追平仍待完成。

只读核对生产系统目录的31张备份业务表结构后，本机PG17用实际列、主键、唯一键、检查约束及外键验证14页面源端恢复矩阵、31表两虚构账号隔离。同步数组为空，不能证明全部页面Azure传输。修复8类记录删除重建后的自然键冲突（词汇统计/设置、学习大纲/配置、音乐设置、放松状态、课表Hub、个人设置），保留现有行ID；本机8场景及双库SDK恢复回归通过。结构夹具不包含用户业务行。

已实际部署Azure Functions 3.21.3候选：AAD现有身份通过Flex部署端点提交，部署编号 `34b46769-7ec3-4039-8a8e-219aa19a8109`，CLI确认成功；部署包SHA256 `5d99493b1a22fde2613fe1e4da68621bdf417ecc42d5b67ee2822f996592f3a9`。新导出/备份标记/v2接口实际未登录401。基线main回退包已重建，不声称已获取线上旧包。网站入口未切换，候选SQL未安装生产。用户最新备份在源pg_dump失败，补齐私有脱敏诊断及原因分类，等待新结果；真实浏览器登录仍SERVICE_UNAVAILABLE。
# 2026 年 10 月 8 日直接切换实施状态

用户已明确授权放弃上次迁移后 Supabase 新增、修改和删除的数据。当前切换以 Azure 已恢复的数据为基线，取消最终追平及两端内容一致性门槛；历史章节中的“必须追平”要求已由本节替代。

- Azure Functions `3.21.3` 候选已部署，存活检查 `200`；未登录接口 `401`。
- 本轮真实浏览器登录已进入生产 Dashboard；这只证明登录恢复，尚未证明 Azure 读写。
- Supabase 配套迁移已实际安装，本地版本与生产历史对齐：`20261008014421`、`20261008014435`、`20261008014450`、`20261008014506`。源控制仍为 `supabase`，7 个配套 RPC 已存在，私有恢复任务禁止用户直接读取。
- `--accept-azure-baseline` 模式只冻结源写入并记录目标指纹，保留 Azure 五表，不复制、清空或更新其记录；明确标记源增量放弃，不能伪报两端指纹一致。
- `scripts/azure-baseline-prepare.command` 只通过本机隐藏输入取得 Azure 管理员密码，保护目标备份，在隔离本机库实际恢复及核对，再安装目标备份标记 RPC。不连接 Supabase、不切换网站。
- 本轮14项切换/备份诊断、73项同步和16项后台测试通过，三组本机 PostgreSQL 演练通过；TypeScript、密钥检查和生产构建通过。全站 lint 仍有16错误1警告，未通过；本次改动文件的 lint 通过。
- 当前未取得目标基线准备成功报告，尚未执行生产源冻结和网站生产入口切换，尚未完成真实双账号验收及24小时观察。第二阶段尚未开始。

详细接口、权限、备份恢复、回退及验收矩阵见 `azure-cutover-and-database-access-plan.docx`。私人日志、备份和凭据不提交仓库。
