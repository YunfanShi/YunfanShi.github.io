# Azure 独立同步后台

版本3.21.1。保留现有同步接口契约，通过普通PostgreSQL登录访问Azure迁移库。此阶段仅在本机启动演练，网站仍使用Supabase；没有创建Container Apps或新增云计算资源。

接口：`/api/sync/v2`、`/api/sync/v2/large`、`/api/sync/devices`、`/api/sync/conflicts`。`GET /health/live`仅检查进程存活，不证明数据库可用。HTTPS入口由最终云端服务提供；容器监听8080。

## 身份与数据库

- Bearer令牌必须由指定Supabase项目验证：ES256/RS256使用该项目JWKS；旧HS256调用Auth的`/user`确认，不分发签名密钥。验证issuer、audience、角色、有效期、账号UUID与session_id，拒绝匿名及service_role；不使用可编辑metadata或请求里的user_id。
- 本机验证使用受控测试签名，未验证真实线上签发令牌。JWT不是即时会话撤销检查；当前账号状态门禁来自迁移库profiles，切换前需追平资料，敏感操作的即时撤销策略仍需落实。
- 连接显式配置可信CA并校验证书；连接池最多4条。登录拒绝超级用户、BYPASSRLS、建库、建角色、复制权限。每个事务在同一连接SET LOCAL普通执行角色和已验证身份，检查当前active资料；写操作按用户加事务锁，提交/回滚清除上下文。
- SQL权限由上级目录的`sync-runtime.sql`配置，脚本仅接受隔离迁移库。普通登录仅有连接和SET ROLE执行角色权限；不得使用迁移管理员作为运行登录。SECURITY DEFINER对象owner仍需部署前审计。
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

数据库私网模板已通过Azure预验证与what-if，尚未创建收费资源。Container Apps自建网络还有公网IP和负载均衡开支，当前改为优先验证Functions Flex托管同一同步后台；香港已确认支持Node24。[具体配置及费用](../backend-deployment-review.md) 包括固定网络和后台执行情景。随后完成Functions入口、运行身份与Key Vault、真实登录验收及浏览器试点；全模块迁移和最终冻结追平另行验收。

依据：[Supabase JWT验证](https://supabase.com/docs/guides/auth/jwts)、[node-postgres事务](https://node-postgres.com/features/transactions)、[TLS配置](https://node-postgres.com/features/ssl)。
