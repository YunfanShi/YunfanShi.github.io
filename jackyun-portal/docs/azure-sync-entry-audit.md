# Azure同步切换入口审计

2026年10月8日，基线main acaa314e，候选3.21.3。此清单是代码审计，不是生产暂停证据。尚未开启生产转发。

| 入口 | 当前实现 | 切换前要求 |
| --- | --- | --- |
| /api/sync/v2 GET POST | 优先Azure转发；未配置时Supabase | 真实读写、去重与离线验收 |
| /api/sync/v2/large GET POST | 优先Azure转发；保留分块 | 中文大值、删除及409重试验收 |
| /api/sync/export GET | 候选用户隔离分页导出，每页20项 | 本机SQL及传输通过，真实读取及部署待完成 |
| /api/sync/devices GET PATCH DELETE | 优先Azure转发 | 设备撤销与两用户隔离 |
| /api/sync/conflicts GET POST | 优先Azure转发 | 旧冲突恢复与去重 |
| /api/legacy-sync 四种方法 | 优先转发Azure兼容实现 | 旧页面实际验收 |
| actions/schedule-backups.ts restoreScheduleBackup | 候选Azure路径：当前快照保存成功后按原版本写Azure | 6项恢复回归和隔离SQL通过；桥接RPC尚未应用，真实恢复待验收 |
| actions/export.ts importSelectedData | 候选代码：同步项经Azure当前版本及分块API；其他表保留Supabase | 8项传输回归通过，真实导入、失败恢复及发布待完成 |
| actions/export.ts exportAllUserData previewDataImport | 候选代码：同步项读取Azure分页及分块，完整导出后再次核对版本清单 | 530条及同时间戳分页、中文游标和真实本机RLS通过；生产验收待完成 |
| actions/backup-center.ts restoreBackupVersion | Azure配置存在时明确拒绝旧RPC；未配置保留旧路径 | 完整跨来源整页恢复协调仍待实施，禁止提前切换 |
| actions/backup-center.ts createBackupVersion createDueBackupVersions inspectBackupVersion | 候选手动备份读取Azure并在源端合并其他表；检查课表读取Azure；自动备份候选合并两端标记和已提交回执 | 迁移尚未应用；自动协调本机已验证，生产和旧RPC切换拦截待完成，只确认已捕获改动 |
| schedule_version_backups与backup_center_versions相关触发器和RPC | 部分已复制到迁移库，但其他业务仍在Supabase | 函数存在不等于备份来源一致，需逐项实查 |
| cron.job与prepared transactions | 只读预检检查活动任务和准备事务 | 切换窗口重新核对，并保存应用停写与排空证据 |
| 直接REST、脚本、历史页面、外部客户端 | 数据库围栏覆盖五表INSERT UPDATE DELETE TRUNCATE | 全部旧写入失败时保留本地队列；需要监测实际旧入口调用 |

源端ALWAYS语句触发器覆盖普通及高权限函数进入五表的写入，不能替代应用入口正确路由。迁移期间不得清空用户队列，也不得为了通过验收删除缓存去重结果或强制覆盖云端。

两端新备份、真实身份、反向复制和备份路由尚未通过，切换工具的证据要求不得填造。第二阶段通知访问改造按原顺序等待第一阶段验收。

本轮桥接RPC不写旧同步表，要求当前用户身份、权威active且未删除账号、同账号同页面的合法同步键；恢复前版本保留免于普通清理。快照同步项上限20,000条、64MiB，超过即拒绝，不能标为完整备份。双方改动标记均不消费。跨来源读取不提供跨数据库原子快照。Mac锁屏使本轮浏览器真实验收无法继续。

自动备份候选已完成网站→Azure SDK HTTP入口→两库SQL→已提交回执→条件确认的隔离本机验证；不是线上真实身份验收。另发现共享HTTP入口漏列导出路径，已补齐导出和改动标记路径并做SDK回归。源端旧create_backup_page/create_due_backup_pages等RPC仍需切换状态拦截，避免历史或外部调用生成过期快照；整页恢复协调仍待完成。因此生产变量仍禁止启用。
