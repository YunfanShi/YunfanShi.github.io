# 本地合并检查（2026-09-26）

范围：本仓库全部本地分支、Git 注册的工作区、主目录未提交文件，以及 /private/tmp 中相关发布副本与补丁。未关联本仓库的历史 Desktop/iCloud 副本不作为当前代码来源。

## 恢复点

- 原主目录：fc12625187d594902a6e657efc33fb509ae2bbdd。
- 原主目录全部改动：codex/pre-local-integration-20260926（625018a7f9cc726f7654d9978ea13b5c85307778）。
- 原始文件与差异归档：/private/tmp/jackyun-local-integration-backup-20260926。
- 本轮开始时的远程主分支：2de2778b1d0608aef010f2884f0068d0b399f260。

## 合并与冲突决策

| 内容 | 处理 |
| --- | --- |
| 同步、备份与恢复工作区 | 已在远程主分支；保留新版恢复比较、历史保护、按修改量或时间备份 |
| Cue 工作流、课表导入、历史加权间隔、既有计划重算、历史筛选、科目总览、次日再复习 | 保留新版；本地较旧的同目的提交不回退后续修正 |
| mobile-control-pwa | 保留全部移动端布局、独立全屏按钮和 PWA 安装与更新内容 |
| 已直接部署但未合并的认证修复 | 纳入强制退出、请求超时、闲置同步跳过网络、退避与认证失败暂停；普通退出仍保存备份、尝试同步并提示待上传修改 |
| 离线队列 | 缺失认证不删除；存在原账户待上传操作时禁止新账户接管，队列为空可清理旧缓存后切换 |
| feat/combat-procrastination | 提取未合并的跳转链接编码能力；使用标准 UTF-8 编解码，兼容旧 XOR 和现有 Base64 链接 |
| 旧 Control 整页替换、旧导航名、无用户手势的自动全屏 | 由新版学习工作区、导航与全屏按钮替代，保留新版；旧提交及原文件仍在历史与恢复快照 |
| 旧确认回调、歌单重复追加、classList 覆写修复 | 旧确认界面已换成任务启动对话框；当前歌单先清理旧选项，classList 方法覆写已不存在，不重复应用旧补丁 |
| 旧分支中两份误加入的命令输出文件 | 与应用无关，不复制；原提交中保留 |
| Companion 预览包 | 全量检查发现 ZIP 内托管脚本过旧，按当前源码重新打包并更新 SHA-256；稳定版签名包保持原版 |
| 其他本地分支 | 已包含于远程主分支，或 git cherry 证实补丁相同，不重复应用 |

## 重复迁移名称

原文件保存在恢复快照，仅保留正式名称，避免 Supabase 重复执行同一功能的迁移：

| 原本地名称 | 正式名称 |
| --- | --- |
| 20260924002426_backup_center_versions.sql | 20260924091940_backup_center_versions.sql |
| 20260924011710_web_sync_large_transfers.sql | 20260924092002_web_sync_large_transfers.sql |
| 20260924134957_backup_default_seven.sql | 20260924142242_backup_default_seven.sql |

正式迁移链含后续备份修正；本轮没有向生产数据库执行迁移。

## 远程同步

根据本轮新增 AGENTS.md 要求，合并通过验证后更新远程主分支，并复查本地与远程提交一致。推送前再次检查远程是否有新提交。生产部署状态需单独验证，不将 Git 推送等同于部署成功。

## 检查过的本地分支

- codex/2-igcsehttpsbestexamhelpcomexamcambridgeigc
- codex/admin-sync-companion-fixes
- codex/backup-retention-20260924
- codex/cue-legacy-rescan-20260925
- codex/cue-review-history-20260925
- codex/full-site-update-20260825
- codex/json
- codex/mobile-control-pwa
- codex/pre-publish-reader
- codex/pre-sync-definitions-20260914
- codex/publish-cue-review-20260924
- codex/reader-improvements
- codex/reader-publish
- codex/schedule-cue-updates-20260924
- codex/sync-backup-resilience
- codex/sync-recovery-20260924
- docs/readme-update
- feat/ai-agent-mode
- feat/ai-performance-optimization
- feat/ai-scoped-prompts
- feat/ai-upgrade-schedule-tools
- feat/ai-upgrade-v2.5.23
- feat/combat-procrastination
- feat/control-enhancements-v2.5.16
- feat/i18n-bilingual-support
- feat/schedule-time-advance
- feat/site-notifications
- feat/studyguide
- feat/studyguide-account-management
- feat/swap-control-timetable-hub
- feat/time-management-v26
- fix/ai-assistant-bugs
- fix/ai-tools-comprehensive
- fix/ai-tts-speed-title-music-player
- fix/ai-v2528-subtitle
- fix/bilibili-sync-native
- fix/control-ui-v2
- fix/control-view-scroll
- fix/mini-player-and-subtitle
- fix/notification-modal-size
- fix/single-song-player-and-memory
- fix/stale-closure-and-player-modes
- fix/timetable-sync-and-break
- fix/timetablehub-goal-ux
- fix/timetablehub-sync-and-ai
- fix/tts-voice-language-bugs
- fix/v2.2.1-bugfixes
- main
