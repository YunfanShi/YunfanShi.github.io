# Azure 独立同步后台

## 当前源码包 3.7.0

网站3.44.0新增v4能力协商、变化日志读取及回执查询。后端默认不声明v4；先以管理员运行`../sync-v4.sql`并核对运行角色权限，再设置`SYNC_V4_USERS`灰度账号或`SYNC_V4_ENABLED=true`。数据库未迁移时继续v3。部署与网络审批边界见仓库`docs/sync-reliability-3.44.0`。

2026-10-24：针对生产 ACCOUNT_STATE_UNAVAILABLE，账号权威查询每次最多8秒，临时失败最多再读一次；同一已验证会话及签名有效期内的并发核验合并。401/403 不重试，不从其他用户或未验证资料恢复授权。网站3.40.2同步增加服务端 PostgREST GET/HEAD 的单次恢复重试，写入与 Auth 请求保留原策略。

配合网站 3.25.0，已通过签名与有效期校验的同一用户会话复用账号状态 5 分钟。状态服务临时超时或 5xx 时，仅此前确认正常、尚未到原令牌期限的会话可短暂沿用结果；失败重试间隔 30 秒。明确 401、403、停用、删除和身份不符立即拒绝，不使用可编辑 metadata 或未验证 Cookie 作为信任依据。缓存最多 500 个会话，进程重启后不保留；首次会话核验仍需账号服务。管理员和备份证明校验不使用这个缓存。

账户状态的正常变更最多有 5 分钟缓存窗口。彻底解除同步对 Supabase 的依赖，需要把账号生命周期和停用状态迁移到 Azure 的权威数据源；旧快照不是该权威源。部署版本与验收证据见仓库 docs/backend-load-and-errors-3.25.0。

## 3.5.0 历史记录

配合网站 3.20.0，大值上传支持先 Gzip 压缩再 Base64 分片；版本目录声明 `transferEncoding: "gzip"`，旧客户端继续使用原格式。大值下载仅在 `encoding=gzip` 时按原分片独立压缩。解压后仍执行原有身份、版本与哈希检查，输出大小受既有 24MB 上限保护。无需数据库迁移。错误响应保留旧 `code` 和字符串 `error`，增加对应全站错误编号 `siteCode`；公开健康接口返回运行版本和兼容格式，不返回用户内容。

2026-10-14 已发布 3.5.0 到 `jackyun-sync-9d26b2cc`，部署编号 `2d66de66-ff9c-4345-8082-f3e714ef9873`。公开健康接口确认运行版本 3.5.0、Gzip 和原始格式兼容；此检查不代表已经用真实账号完成多设备验收。下方部署说明保留历史版本编号，最新错误码文档见 `docs/error-codes.md`。

版本3.21.2。保留现有同步接口契约，通过普通PostgreSQL登录访问Azure迁移库。已部署Azure Functions Flex，网站转发由服务端AZURE_SYNC_API_URL启用；未启用时保留原连接。正式启用前必须追平同步数据并验证真实登录。

接口：`/api/sync/v2`、`/api/sync/v2/large`、`/api/sync/devices`、`/api/sync/conflicts`。`GET /health/live`仅检查进程存活，不证明数据库可用。HTTPS入口由最终云端服务提供；容器监听8080。

## 身份与数据库

- Bearer令牌必须由指定Supabase项目验证：ES256/RS256使用该项目JWKS；旧HS256调用Auth的`/user`确认，不分发签名密钥。验证issuer、audience、角色、有效期、账号UUID与session_id，拒绝匿名及service_role；不使用可编辑metadata或请求里的user_id。
- 本机验证使用受控测试签名，未验证真实线上签发令牌。JWT不是即时会话撤销检查；当前账号状态门禁来自迁移库profiles，切换前需追平资料，敏感操作的即时撤销策略仍需落实。
- 连接显式配置可信CA并校验证书；连接池最多4条。登录拒绝超级用户、BYPASSRLS、建库、建角色、复制权限。每个事务在同一连接SET LOCAL普通执行角色和已验证身份，检查当前active资料；写操作按用户加事务锁，提交/回滚清除上下文。
- SQL权限由上级目录的`sync-runtime.sql`配置，脚本仅接受隔离迁移库。普通登录仅有连接和SET ROLE执行角色权限；不得使用迁移管理员作为运行登录。四个原同步函数已确认SECURITY INVOKER。唯一账号状态SECURITY DEFINER查询由无登录专用角色持有，只能通过行权限读取当前用户id、account_status、deleted_at三列；执行角色不能SET ROLE该owner。见sync-identity-owner.sql。
- 普通请求正文最多1MB；上传每段正文250KB、解码120KB，总上传24MB；设备撤销、计划清空保护、冲突及删除规则沿用现有同步实现。CORS默认仅`https://jackyun.top`；CORS不替代令牌验证。错误日志只有请求ID和错误代码，不记录令牌、数据库错误详情或同步正文。

## 配置与运行

安装Node.js 24。从本目录执行`npm ci --ignore-scripts`和`npm test`。`.env.example`仅展示变量，程序通过进程环境读取；它不会自动加载该文件。密码只由安全配置提供，不能写入仓库、镜像、浏览器变量或命令参数。

运行变量：`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`（旧HS256验证需要）、`PGHOST`、`PGDATABASE`、`PGUSER`、`PGPASSWORD`、`PGSSLROOTCERT`、可选`PORT`。随后`npm start`。Linux容器的CA路径为`/etc/ssl/certs/ca-certificates.crt`。

从`jackyun-portal`目录构建：

```powershell
docker build -f azure/backend/Dockerfile -t jackyun-sync-api:3.21.0 .
```

Dockerfile专用ignore采用白名单，仅包含后台依赖与4个纯同步规则源文件；备份、环境文件、整个Next.js应用和node_modules不进入构建上下文。3.21.0镜像已实际构建，上下文38.47KB；离线镜像运行确认uid1000、可信CA存在、共享同步模块加载成功。尚未发布镜像或验证云端运行。

## 验证与数据保护

`npm test`验证真实签名、伪造/过期/错误issuer/audience、匿名与高权限拒绝、旧令牌Auth校验及失败处理、响应大小、HTTP认证/CORS/正文上限和错误脱敏。更改后台代码后执行这些测试和ESLint。

`tests/live-database.mjs`需显式运行，只接受`jackyun_migration_YYYYMMDD`；`PGADMINPASSWORD`仅供选取两条复制账号和精确清理测试对象，HTTP服务始终使用普通登录。管理员凭据不可部署给服务。测试前按受影响用户和页面保存原备份标记的JSON时间戳，清理后逐字段还原，不禁用原触发器。使用[逐表清单](../../scripts/azure-migration-manifest.sql)对比演练前后所有应用表，而不是仅检查测试记录数量。

2026-10-07真实Azure演练通过：普通登录HTTP读写、并发相同操作重试、两用户隔离和连接池上下文、另一用户设备拒用、不存在的账号拒绝、无效批次回滚、26段中文/emoji完整往返、大值列表隐藏正文、版本不符、删除与旧修改、设备改名和撤销。清理后83张应用表8153行的列、行数和内容指纹一致。令牌由测试密钥签发，未执行生产浏览器切换。

按用户批准的Windows路径，修改前MAIN的生产构建3.20.12已备份到`C:\Users\syf26\Desktop\JACKYUN\Backup\v3.20.12`，附文件大小和SHA-256清单；这是本机MAIN生产构建，未验证与线上Vercel产物逐字节相同。本次属于用户无感的迁移准备，依仓库例外不添加更新中心产品公告。

数据库私网与Functions运行模板已经用户认可费用并创建Succeeded。Container Apps自建网络还有公网IP和负载均衡开支，当前改为优先验证Functions Flex托管同一同步后台；香港已确认支持Node24。[具体配置及费用](../backend-deployment-review.md) 包括固定网络和后台执行情景。Functions入口、运行身份与Key Vault已接入；当前仍需真实登录、最终同步增量和浏览器验收。其他模块迁移另行验收。

依据：[Supabase JWT验证](https://supabase.com/docs/guides/auth/jwts)、[node-postgres事务](https://node-postgres.com/features/transactions)、[TLS配置](https://node-postgres.com/features/ssl)。

## Functions 与网站接入

运行入口为functions.mjs，host.json保留完整/api前缀。SDK请求流复用普通HTTP处理器；额外提供/api/legacy-sync兼容原页面，新旧写入都推进同一条记录版本与内容哈希。旧接口列表不下载大于400KB的正文，大值继续走新版分块同步。

从应用目录执行npm run build:azure-functions；脚本只打包13个指定源码、host.json、锁定的生产依赖，不包含环境文件、备份或整个Next.js应用。发布配置见../functions-runtime.json；密码使用Key Vault引用，连接原数据库域名并严格验证TLS。部署存储与运行存储使用托管身份，没有SharedKey。

网站仅配置服务端AZURE_SYNC_API_URL=https://jackyun-sync-9d26b2cc.azurewebsites.net。不将数据库密码给Vercel或浏览器，不跨数据库重试写操作。scripts/azure-sync-cutover.mjs是显式操作员命令，核对账号集合及源ACL，冻结旧库五张同步表写入、备份两端、事务内追平五表与账号状态并比较内容指纹；失败回滚并恢复旧库写权限。成功后旧库保留为只读副本，回退必须先回灌Azure新写入。


### 候选自动备份协调（尚未部署）

新增GET/POST `/api/sync/backup-markers`；分页导出 `/api/sync/export` 也已加入共享HTTP入口允许列表，Azure SDK回归验证其可达且保持鉴权。源端按Supabase迁移顺序应用备份桥接及自动协调文件；它们会拒绝Azure迁移库名称，不能对Azure应用。目标端在既有 `sync-runtime.sql` 之后单独应用 `azure/sync-backup-markers.sql`，再部署候选后台，最后配置网站入口并真实验收。目标附加脚本仅接受隔离迁移库；勿在附加脚本后重新执行会撤销全部函数权限的原运行角色脚本。

两端改动表增加每次更新都变化的UUID编号，保持4MiB或15分钟节奏。源端保存Azure当前同步值与源端业务表，并记录当前用户的版本回执；只确认捕获的源端编号。网站提交Azure确认时携带版本编号，后台以同一已验证用户令牌调用源端confirm_backup_capture，核对已提交回执，再在Azure事务中仅清除匹配编号。网络失败保留标记，重试复用回执；新改动编号不被旧确认清除。运行角色只增加两个限定函数执行权，没有直接私有表权限。

70项同步回归、16项后台回归以及临时两库PostgreSQL + Azure SDK完整自动备份流程通过：失败确认重试、并发新改动、跨账号隔离、源端旧表冻结而不写入。测试身份为本机夹具，不能替代真实Supabase登录。源端旧备份RPC的切换状态保护已完成候选代码和隔离SQL验证，整页恢复协调及生产验收仍待完成，禁止先开启生产变量。
