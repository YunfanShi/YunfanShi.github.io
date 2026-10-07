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
| actions/schedule-backups.ts restoreScheduleBackup | 直接更新Supabase legacy_sync_data；恢复前旧库备份 | 尚未适配Azure，禁止据五个API宣称覆盖全部写入 |
| actions/export.ts importSelectedData | 候选代码：同步项经Azure当前版本及分块API；其他表保留Supabase | 8项传输回归通过，真实导入、失败恢复及发布待完成 |
| actions/export.ts exportAllUserData previewDataImport | 候选代码：同步项读取Azure分页及分块，完整导出后再次核对版本清单 | 530条及同时间戳分页、中文游标和真实本机RLS通过；生产验收待完成 |
| actions/backup-center.ts restoreBackupVersion | Supabase restore_backup_page间接写旧同步表 | 必须适配完整恢复流程和跨来源备份关联 |
| actions/backup-center.ts createBackupVersion createDueBackupVersions inspectBackupVersion | Supabase RPC或直接读取旧同步表 | 尚未验证Azure备份路由，不能生成旧同步值的“最新”备份 |
| schedule_version_backups与backup_center_versions相关触发器和RPC | 部分已复制到迁移库，但其他业务仍在Supabase | 函数存在不等于备份来源一致，需逐项实查 |
| cron.job与prepared transactions | 只读预检检查活动任务和准备事务 | 切换窗口重新核对，并保存应用停写与排空证据 |
| 直接REST、脚本、历史页面、外部客户端 | 数据库围栏覆盖五表INSERT UPDATE DELETE TRUNCATE | 全部旧写入失败时保留本地队列；需要监测实际旧入口调用 |

源端ALWAYS语句触发器覆盖普通及高权限函数进入五表的写入，不能替代应用入口正确路由。迁移期间不得清空用户队列，也不得为了通过验收删除缓存去重结果或强制覆盖云端。

两端新备份、真实身份、反向复制和备份路由尚未通过，切换工具的证据要求不得填造。第二阶段通知访问改造按原顺序等待第一阶段验收。
