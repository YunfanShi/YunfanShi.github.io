# 退出登录与数据库故障处理

退出菜单提供普通退出和强制退出。普通退出尝试撤销当前 Supabase 会话；强制退出只清除本站认证 cookie，不请求 Supabase，因此已删除设备、认证服务故障不会阻止退出。不会撤销其他设备，也不保证服务端旧访问令牌即时失效。

两种退出均保留本地学习数据、同步队列和离线操作，清除 Service Worker 用户缓存。同账户重新登录后可继续同步；不同账户不得接管原账户待上传数据。共享设备仍应注意本地数据隐私。强制退出不表示未上传的数据已经备份到云端。

Supabase 和同步 fetch 的单次网络等待上限为 8 秒，使用 AbortSignal 合并调用方取消信号。SDK 可能自行重试，所以完整业务流程不等于 8 秒。数据库故障时页面已有的默认值/错误边界继续负责降级，受保护的管理页面不会绕过认证。

闲置同步 tick 只检查本地变化；没有待上传修改时不访问数据库。进入页面、焦点恢复、联网和手动同步仍会拉取云端变化。代价是持续停留在同一页时，其他设备的新数据不会每 30 秒自动拉取。同步失败后自动重试间隔为 30、60、120、240、300 秒，成功后重置；401/403（含设备撤销）暂停自动同步，用户可在同步中心手动重试。本地变化仍继续进入队列。没有新增定时健康检查。

## Supabase 再次无响应时

先查看 Supabase 状态页与项目 Observability 的 CPU、内存、磁盘 I/O、连接数，以及 Database Connections 的阻塞会话和 Query Performance。保存故障时间和日志，再按证据处理慢查询、锁或资源耗尽。应用超时/退避可减少故障放大，但不能修复数据库自身卡死。重启可恢复服务，却不能证明根因已经消除；平台级故障或反复无响应需联系 Supabase 支持。不要自动重启数据库，也不要清空本地同步队列。

参考：
- https://supabase.com/docs/guides/troubleshooting/http-api-issues
- https://supabase.com/docs/guides/database/connection-management
- https://supabase.com/docs/guides/troubleshooting/high-cpu-usage
