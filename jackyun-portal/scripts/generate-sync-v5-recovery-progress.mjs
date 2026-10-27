import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const bundledModules = process.env.CODEX_NODE_MODULES;
const { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, WidthType } = require(bundledModules ? resolve(bundledModules, 'docx') : 'docx');
const out = resolve(process.argv[2] ?? 'docs/sync-v5-full-data-recovery-progress-3.58.3-20261028.docx');
const p = (text, options = {}) => new Paragraph({ text, ...options });
const h = (text, level = HeadingLevel.HEADING_1) => new Paragraph({ text, heading: level, keepNext: true });
const cell = text => new TableCell({ children: [p(text)], width: { size: 25, type: WidthType.PERCENTAGE } });
const table = rows => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((row, index) => new TableRow({ tableHeader: index === 0, cantSplit: true, children: row.map(cell) })) });

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Aptos', size: 22 }, paragraph: { spacing: { after: 150, line: 300 } } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: 'Aptos Display', size: 34, bold: true, color: '000000' }, paragraph: { spacing: { after: 180 } } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { font: 'Aptos Display', size: 28, bold: true, color: '000000' }, paragraph: { spacing: { before: 240, after: 140 } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', run: { font: 'Aptos Display', size: 24, bold: true, color: '000000' }, paragraph: { spacing: { before: 200, after: 120 } } },
    ],
  },
  sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } }, children: [
    new Paragraph({ text: 'JackYun 全量资源同步与数据恢复实施记录', style: 'Title' }),
    p('记录日期：2026 年 10 月 28 日。前六节记录 3.54.0 状态；第七节记录 3.55.1 QuizWise 离线答案迁移；后续各节记录 3.56.0 本机工作区归档、3.57.0 离线队列归档、3.57.1 存储键映射回归、3.58.0 同步待办归档、3.58.1 多设备恢复缺陷修复、3.58.2 导出账号隔离与本机 Quiz 题目身份修复及 3.58.3 清理旧测验身份。目标版本：在所有数据迁移与安全验收完成后发布 4.0.0。'),
    p('结论：本记录确认了现有 Schedule v5 客户端的空缓存保护、哈希校验、原子游标与按页订阅测试，并针对日志中可恢复网络错误造成的噪音进行修复。它不表示全账号资源已迁入 v5，也不表示生产账号、staging 迁移或真实双设备验收已通过。'),
    h('1. 当前工作范围'),
    p('3.52.3 已通过 PR #168 合入并部署生产；本地当前在基于最新 main 的隔离分支推进 3.52.4。当前修改没有接触 Supabase 分支或生产数据。3.52.1 将主动取消降为 debug；网络断开、408、425、429、500、502、503、504 记为 warn，不附加重复错误正文；401、403、409、其他非恢复类 HTTP 错误仍保留 error 诊断。3.52.2 修复删除最后一条 CUE 时空集合保护吞掉 tombstone 的 P2 缺陷。3.52.3 再修复放弃或完成最后一个 CUE 学习草稿时空 map 吞掉 tombstone 的 P2 缺陷。两类已同步记录都以当前 revision/hash 写入 v5 outbox；存在未解决冲突时阻止该资源删除并提示用户。所有请求日志仅保留 origin 与 pathname，避免把 ID 查询参数完整写进日志。'),
    p('这一调整不吞掉 fetch 异常、不更改重试策略，也不把远端失败伪装成同步成功。用户可见的同步状态仍取决于 outbox、回执、资源哈希及本地持久化结果。'),
    h('1.1 大文件本机导入与恢复点'),
    p('本机页面 JSON 导入不再限制 1 MB；3.58 MB Schedule 备份可正常解析并校验页面键、JSON 结构和 Schedule 内容。导入操作现在统一通过 applyLocalPageImport：先收集当前页面值并等待 IndexedDB 恢复版本事务完成，再应用导入/删除变更，最后等待 workspaceStorage.flush 完成 IndexedDB 仓库写入；只有整段 Promise 成功返回后，界面才触发恢复成功状态。'),
    p('失败边界已加入真实 IndexedDB 测试：恢复点可在第一次页面改动前从 IDB 读回；恢复点写入失败会在不修改当前页面时中止；仓库 flush 失败不会返回成功，之前的恢复点仍保留；空文件、损坏的 Schedule JSON、空 Schedule 都在应用前拒绝。导入本身不进行云端写入回执确认；联网后的跨设备确认仍由 v5 同步流程负责。'),
    h('1.2 恢复后 v5 资源核对'),
    p('本次新增账号隔离的持久恢复目标队列。恢复前保留当前页面本机恢复点，页面数据完成 workspace IndexedDB flush 后，根据被新增、替换或删除的键生成资源目标；jackyun_schedule_control_v1 映射为各 Schedule v5 域字段，其他可同步键按 legacyWorkspaceFieldForKey 所有者映射。云端备份恢复也将返回的实际变更键排队。同步器将这些目标与当前页面订阅合并，因此不要求用户停留在同名页面。'),
    p('目标在 v5 不可用、存在待回执写入或出现冲突时不会清除；仅完成对应域的拉取/提交，并且该域没有待办或冲突后才在 IndexedDB 中确认清理。目标采用设置 store 原子合并，跨刷新保留；按账号数据库隔离。此改动让旧格式页面恢复后的核对不再只依赖当前路由，但不等于独立 QuizWise、Focus 或 reader Supabase 表已经迁入 v5，也不代表独立业务副作用已适配。'),
    p('3.53.1 修正恢复状态的漏算：持久恢复目标计入待处理状态，不会被 30 秒自动拉取冷却短路；未清除的目标阻止更新最近同步时间，并让状态保持“本机已保存、v5 资源待核对”。最近同步时间只代表本次没有待办的检查结束，不代表全账号所有页面均已核对。v5 未启用或资源仍待处理时，不再用兼容同步完成文案误导用户；该状态不自动开放 v5 灰度。'),
    h('2. 数据覆盖现状'),
    p('2026-10-28 重新扫描的机器清单覆盖 590 个源文件、742 个存储调用点、257 个 localStorage 键模式和 30 个 IndexedDB 调用点。257 个键模式中，187 个仍标注为 v2/v4 路径且是 v5 候选，51 个明确是设备本地/非同步用途，其余是 v5、v4/v5 元数据或条件继承映射。该分类是代码所有权/协议盘点，不等于每个候选都完成了 v5 业务往返验收。清单同时识别 6 类独立 Supabase/API 业务所有者；个人站点、写作和部分离线数据已有 v5 交接或工作区映射，QuizWise 云历史、专注会话/番茄任务、小说书架/阅读进度及离线工作区 mutations 仍有独立业务 API、RLS、副作用或回执语义。最新机器清单保存为 docs/sync-v5-coverage-matrix-20261028.json。'),
    p('不能只把这些表或键名映射进 v5 就宣布迁移完成。Quiz 完成会产生复习项，专注会话要验证用户与任务关联，阅读进度以 book_id 为主键，离线 review attempt 会更新间隔、难度和下次复习时间。迁移必须保留这些事务边界、RLS 所有权、稳定 ID 和幂等回执。'),
    table([
      ['验收范围', '已有代码或证据', '尚未通过的条件'],
      ['Schedule、CUE、任务与练习', 'v5 资源记录、页面订阅、SHA-256、冲突与 IndexedDB 原子提交测试。', '生产库迁移后的认证写入和真实账号重新读取哈希。'],
      ['QuizWise、专注会话、阅读数据', '本地缓存和现有云 API 已盘点，部分客户端缓存映射到 workspace。', '独立表数据的 v5 事务适配、RLS、业务副作用、跨设备读回。'],
      ['IELTS 写作、个人站点、离线工作区', '存在稳定资源 ID、v5 工作区投影或迁移交接代码。', '旧写入冻结、迁移计数/哈希核对及真实用户回执闭环。'],
      ['导入与导出', '3.5 MB Schedule 的本地导入不再受 1 MB 前端限制。', '全设备 IndexedDB + localStorage 完整归档流式往返及中断恢复仍需完成。'],
    ]),
    h('3. 用户日志复核'),
    p('提供的 2026-10-27 客户端日志含多次 v5 资源读取。某旧客户端请求曾将 100 个较长 CUE 记录 ID 放入约 8,967 字符的 GET URL，并收到 414；另有 v5 records 返回 503。当前分支已有基于编码后 URL 长度的分批读取逻辑及测试，验证请求 URL 不超过 3,500 字符。该历史日志不能证明当前生产 bundle 已部署这一实现，部署 SHA 与 Service Worker 缓存版本仍需核实。'),
    p('同一批日志还记录到 /schedule 500、设置页 POST 500（最长约 152 秒）、通知快照 503（约 16–19 秒），以及 v5 capability/changes 查询耗时 16–28 秒。客户端日志只能证明请求结果和耗时，不能据此断定 Azure PostgreSQL、香港网络或 Vercel 函数是根因；需要对应请求 ID 的 Azure/Vercel 服务端日志和数据库指标。'),
    p('Oct 27 日志里出现的 401 与会话过期、页面切换取消等属于不同故障类别。网络诊断调整仅压低可恢复失败的严重程度；认证过期、权限拒绝、哈希不一致、本机落盘失败和真实 CAS 冲突仍需明确处理。'),
    h('4. 自动化验证'),
    p('本次增加 QuizWise active progress 记录，将题目、答案、当前位置、会话及服务端题目 ID 通过 workspaceStorage.flush() 持久化为 stable legacyQuiz v5 记录；IndexedDB 题目副本写入等待事务完成。会话、偏好、设置和本地历史也改为等待 workspace flush 后再确认；本机删除写入失败时不会先从界面移除记录。新增故障注入测试确认偏好和成绩写入会传播 IndexedDB 事务失败，不伪报成功。已有工作区写入回执前保留待办；重新打开恢复在做测验，网络答案未确认时完成动作重试并保留本地进度。并修复了旧题目缓存先恢复、云端进度后到时被一次性恢复标志挡住的竞态，同时防止用户已开始新流程后被迟到的云端进度覆盖。此改动不将 Supabase quiz history / review 副作用假称已迁移。恢复/v5、备份、同步存储清单和版本专项套件 69/69 通过；QuizWise 桌面与移动浏览器场景 5/5 通过；TypeScript、定向 ESLint 和 Next.js webpack 生产构建通过。DOCX 转图因环境无 LibreOffice / soffice.exe 无法完成视觉核验。'),
    p('新增网络失败分类测试通过 2 项，覆盖瞬态状态码与主动 AbortError。针对 PR #168 的浏览器 UI 回归，现有失败日志包含 active-legacy-ui（诗词 iframe 主题等待）、study-guide-state（iframe 标签等待）、music-player-state（测试歌曲未出现）、answer-sheet-legacy（保存标题为空）、cue-route-draft 与 cue-search（移动 Schedule 按钮不可见）、review-queue（完成标题超时）。当前没有同 SHA origin/main 基线 workflow 证据，不能确认这些是历史基线或新增回归，分类为“UI 流程失败、基线归因未证实”；同步安全测试单独统计，不跳过任何数据安全检查。'),
    p('PR #169 前一提交 b78231c 的 workflow 40574090030 中，build、TypeScript/ESLint 与 Existing data safety regressions 通过；Run production UI flows 失败，失败项为 cue-search 等待“打开日程管理”按钮，以及 review-queue 等待“今天的复习完成了”标题。这两个页面不属于本次 QuizWise 改动，但没有同 SHA origin/main 对照，故只能记录为非同步 UI 失败、基线归因未证实，不能称为已证明的历史基线。本次最新提交推送后仍须核对新 SHA 的 CI 和 Vercel Preview；本机正确工作树端口上 QuizWise 测试通过不替代远端全量 UI 或认证云端测试。'),
    h('5. 发布前门槛与依赖'),
    p('4.0.0 发布前必须为每个用户业务数据所有者提供真实 v5 适配器或有证据的非同步说明；完成当前 staging 库快照、可重复迁移演练和恢复核验；以专用测试账号验证认证写入、receipt 查询、重复操作幂等、重新读取 SHA-256、RLS 隔离、离线重试及冲突回滚。不得创建 Supabase 分支。'),
    p('通过 staging 后先在生产专用测试账号受控验证两个浏览器的双向更新、离线恢复、冲突和回滚，并记录 Vercel 部署 READY 对应 SHA、Azure Functions 健康版本与同步端点结果。真实手机当前不可用，手机验收必须标为未执行；桌面移动视口不等同于实体手机。'),
    p('用户业务迁移计数、每资源哈希、待处理操作队列及回执必须核对后，才可退役运行时 v4 兼容。若服务端凭据、数据库权限、测试账号或服务端日志不可访问，应记录具体最小权限和阻碍，不能用合成测试或部署 READY 替代。'),
    h('6. 本次代码变更清单'),
    p('新增 applyLocalPageImport 与 v5RestoreTargets 账号隔离目标队列，将本机恢复点、完整仓库 flush、全目标 v5 核对和安全清理连接起来；新增恢复目标参与状态判断的防误报逻辑。Schedule 备份显式覆盖 Schedule 资源域，旧键按 workspace 字段路由。QuizWise 做题中进度现按 stable legacyQuiz 键恢复，并阻止未确认答案被静默清除。机器清单 docs/sync-v5-coverage-matrix-20261028.json 覆盖 257 个键模式、30 个 IndexedDB 调用点与独立 API 所有者；它仍是迁移底表，不代表每条记录均已 v5 验收。3.54.0 时独立业务表迁移、数据恢复演练、真实跨浏览器生产验收和 v4 退役均未完成，目标 4.0.0 未宣称完成。'),
    h('7. 3.55.1 QuizWise 离线答案迁移'),
    p('重新检查后发现 quizwise.offline_answers 仅剩 IndexedDB schema 和三个旧导出函数，没有活跃调用点；但已安装客户端仍可能留有只存在本机的答案。此前矩阵把它分类为可忽略的无调用 store，可能漏掉历史用户数据。本次将其定义为一次性迁移输入，而不是继续保留一条静默失败的独立队列。'),
    p('迁移读取全部旧答案及 IndexedDB 自动递增 ID，将每项稳定映射为 legacy:<old-id>，写入账号隔离键 quizwise_offline_answers，并在同一个 workspaceStorage IndexedDB flush 中写入 quizwise_offline_answers_migrated_v5 标记。两者同事务落盘成功后才清理旧 offline_answers store；flush 失败则旧记录保留。标记用于防止删除旧副本后，任何遗留行或清理失败再次把旧答案复活。新队列写入等待 v5 本机 flush；读取错误、无效数据、写入错误不再被吞掉。显式清空先持久化 workspace tombstone 和迁移标记，再清理旧 store。'),
    p('自动化验证包括旧队列迁移、稳定 v5 workspace ID、v5 outbox 待回执保留、失败注入时旧副本不变、重试完成迁移，以及明确清空生成 tombstone。该本地与 outbox 路径测试不等价于 Azure/Supabase 已认证写入、服务端 receipt、SHA-256 回读或 RLS 验收；这些全账号发布门槛仍未通过。机器清单从 257 个增长至 259 个 localStorage 键模式，IndexedDB 调用点仍为 30；offline_answers 现归类为有明确 v5 目标的一次性迁移源，不再以“当前无调用”作为丢弃依据。'),
    h('8. 3.56.0 本机工作区归档'),
    p('备份中心新增本机工作区 JSON 导入/导出。格式为 jackyun-v5-workspace，包含全部通过备份白名单的本机 workspace 键，逐记录保存 SHA-256，并对规范化后的完整归档再次计算 SHA-256。没有应用层固定文件大小门槛；导入按 File.text() 读取并在写入前完成 JSON、版本、计数、键白名单、重复键、每条哈希和整体哈希核验。此时它仅包含本机已持有的工作区键，不包括 IndexedDB 队列、同步资源 outbox 或尚未下载的云端记录。'),
    p('导入采用合并策略：只应用归档明确包含的记录，不将缺失键推断为删除。拒绝空或格式错误的 Schedule。写入前逐页面保存当前恢复点，随后写入 workspaceStorage 并等待 IndexedDB flush，成功后才持久排入对应 v5 资源恢复目标；同步器继续负责云端回执和哈希确认。若本机 flush 失败，则不排入云端恢复目标、不报告成功，恢复点仍保留。'),
    p('新增测试覆盖大于 1 MB 的 Unicode Schedule、逐记录和整体哈希、损坏归档、空 Schedule 拒绝、先恢复后落盘再排目标、缺失键保留及落盘失败不排远端任务。此功能解决本机 workspace 归档与恢复，不覆盖当前独立云端 backup_center_versions 的 v2 格式，也不把 30 个 IndexedDB 调用点全部纳入归档。独立 QuizWise/Supabase 历史、专注、阅读、离线业务 outbox 的 v5 迁移仍需逐项完成。'),
    h('9. 3.57.0 离线工作区归档与恢复'),
    p('本机归档增加 jackyun-offline-workspace 数据库中的当前账号 snapshots 与 outbox：覆盖任务、复习、阅读的离线快照及未确认操作。导出只选择匹配 ownerId 的记录，不导出其他账号队列。归档 SHA-256 覆盖这些内容；导入校验 ownerId、快照 scope、稳定 operationId、payload 与创建时间。跨账号导入直接拒绝。'),
    p('恢复会在同一 IndexedDB readwrite transaction 中先将当前账号快照/outbox 写入 archiveRecoveryPoints，再合并归档内容。每账号最多保留最近 10 个恢复点。现有快照优先保留；同 operationId 且 payload/kind 相同的记录保持原有重试状态，不覆盖；同 ID 不同内容会 abort 整个离线数据库事务。新操作保留原 ID、追加本地 sequence，并在事务完成后发出本地队列事件。重复提交仍由服务端原 receipt/idempotency 语义处理。'),
    p('导入流程先保存 localStorage 页面恢复点，持久化工作区记录后再恢复离线数据库，最后才排入 v5 工作区目标。离线恢复失败会尝试恢复此次工作区写入前的 localStorage 值；IndexedDB 队列导入自身具备事务原子性。全局 localStorage 与多个独立 IndexedDB 数据库之间不存在浏览器级跨库事务，因此恢复点作为回滚依据保留。'),
    p('边界：归档仍不含 jackyun-sync-v2 中的 v5Resources/v5Outbox/v5Conflicts、设备同步设置、独立 QuizWise/Supabase 历史、focus_sessions、reader_books、云端未下载记录或云端 backup_center_versions。按钮和状态文本已列明这些排除项，不称其为完整设备镜像。当前机器矩阵重新扫描到 591 个源文件、756 个存储调用点、259 个 localStorage 键模式和 31 个 IndexedDB 调用点；189 行仍属 v2/v4 候选。3.57.0 的离线归档测试将验证跨账号拒绝、重复操作 ID 幂等、冲突事务回滚及快照/outbox 读回；全量 IDB 归档、独立业务表 v5 迁移、staging/生产认证验收、跨浏览器与实体手机仍未完成。'),
    h('10. 3.57.1 静态存储键映射回归'),
    p('同步模型测试现在读取机器生成的 docs/sync-v5-coverage-matrix-20261028.json，筛选 should_cloud_sync=true 且协议标为 v2/v4 的 189 行。测试确认其中 171 个静态具体键可分解为 170 个 workspace 键和 jackyun_schedule_control_v1 一个 Schedule 根键。170 个 workspace 键逐项断言 legacyWorkspaceFieldForKey 有域归属、legacyWorkspaceRecordId 可稳定生成、反向解析保留原键且资源 scope 为 workspace；Schedule 根键独立断言映射全部六个域。其余 18 个动态模板各生成代表性运行时键，回归验证域归属、稳定 ID、反向解析及 workspace scope。该键级覆盖仍不替代认证运行时真实数据抽样、独立业务 API 的副作用验证或迁移后计数/hash 核对。'),
    p('余下 18 项包含运行时模板或未解析变量，测试继续将其视为待办，不猜测 key 值。该回归证明静态代码映射函数可覆盖清单的具体键，不证明每个资源已由用户页面启动、服务端回执或云端哈希读回，也不证明按页懒迁移已完成所有历史数据。v4 运行时仍不得在迁移计数、哈希和设备更新验证通过前退役。'),
    h('11. 3.58.0 同步待办归档与恢复'),
    p('本机 v5 归档新增账号隔离的 jackyun-sync-v2 Outbox/Conflicts 内容，涵盖遗留待同步操作、遗留冲突、v5 操作和 v5 冲突。归档整体 SHA-256 覆盖这些数据；解析时检查账号归属、稳定 ID、资源 scope、允许同步的 legacy key、revision、日期及 JSON 可规范化。设备会话、认证资料、同步游标、分片缓存和设备设置不会导出。'),
    p('恢复先在目标账号同步 IndexedDB 的单个 readwrite 事务内读取当前队列、持久化队列/冲突恢复点，再合并归档记录。操作按 ID 幂等；遗留操作的本机 sequence/retry 顺序优先保留；同 ID 但业务内容不同会 abort，既不覆盖当前队列也不创建不完整恢复点。恢复点最多保留 10 份。工作区导入固定仓库账号和 v5 目标数据库；异步过程中切换账号会终止流程且绝不通过全局存储句柄回滚到新账号。离线队列以原 sequence 为主、创建时间为回退排序，避免恢复后同一对象的状态操作倒序。v5 恢复目标逐域记录 generation，只确认已处理的同代目标，旧同步轮次不得清理并发新增的目标；缺失后端能力的域保留重试。'),
    p('工作区、离线工作区和同步数据库是多个独立存储，浏览器没有跨库原子事务。本地页面在 IndexedDB flush 后才排入 v5 恢复目标；离线和同步数据库各自保留事务恢复点。归档不包含独立 QuizWise IndexedDB 历史、独立 Supabase 业务表或未下载云端数据，因此仍不能称为完整设备镜像。后续需逐项纳入其余业务 IDB/表格，并完成真实 authenticated business read/write 与跨设备验收。'),
    h('12. 3.58.0 验证与未完成门槛'),
    p('本机验证：workspace archive 与 update history 定向测试 12/12；QuizWise 存储/恢复测试覆盖 tombstone 与题集 ID 一致性；TypeScript --noEmit、定向 ESLint 通过；完整 test:sync 313/313 通过。大于 1 MB Schedule 归档、哈希/损坏检查、IndexedDB 落盘失败保护、账号切换隔离、离线重放顺序、恢复目标代次、未支持能力保留及 v4/v5 待办/冲突归档均有测试覆盖。'),
    p('GitHub Actions run 40589643193（PR #169 测试头 3084408）：生产构建、Type/lint、Existing data safety regressions 通过；Run production UI flows 失败。日志中的失败分布在 IELTS dashboard、旧 iframe/theme 页面、quick-task-ui、study-guide、music-player、answer-sheet-legacy、cue-route-draft、cue-search 和 review-queue。当前改动触及备份归档/outbox，而失败断言来自上述独立页面；这次运行不能证明它们是本次回归，也不能证明它们属于既有基线。需要以同一脚本在目标基线复跑后分类；同步数据安全测试不得跳过。'),
    p('真实 v5 E2E 仍未完成：当前本机阶段的恢复归档尚未覆盖独立 QuizWise IndexedDB/Supabase 业务表、焦点/阅读业务副作用或云端未下载数据；staging/生产仍需最新迁移、受限账号读写与 receipt/SHA/RLS 证据；还需两个独立真实浏览器双向修改、离线重试、冲突回滚与生产部署 SHA 验收。没有实体手机，因此不得标记手机验收通过。'),
    h('13. 3.58.2 导出账号隔离与 Quiz 本地身份'),
    p('修复备份中心导出竞态：导出前捕获 repository account context，并在读取离线快照、同步 outbox/conflicts、本机 workspace 及异步计算归档 SHA-256 后逐次验证上下文。若用户在任一 IndexedDB 等待期间切换账号，流程立即中止，且不会继续读取新账号 workspace、下载混合账号的归档或暴露跨账号数据。新增故障注入测试在首个异步读取中模拟账号切换，并断言 workspace 源未被读取。'),
    p('修复 QuizWise 本地-only 测验恢复：本地测验没有服务端题目 UUID 时，恢复后的进度继续保存为空 questionIds 列表，不再把缺失 ID 伪造成空字符串并写回。带有空 ID 的不完整题目身份集合不会被当作稳定题集匹配；真正的云端 session 仍要求题目 ID 与当前题集逐项一致。测试覆盖无 session 空列表可恢复、混入空字符串的 ID 集合拒绝匹配，以及仅完整非空 ID 集合可写回。'),
    p('本次属于 3.58.2 小缺陷修复，未变更协议、数据库或生产灰度，也未宣称全量数据迁移完成。最新代码本机完整同步/安全测试 314/314、TypeScript、定向 ESLint 及 Next.js 生产构建通过。GitHub Actions 最新 SHA 与 Vercel Preview 仍须核实；即使构建与数据安全回归通过，独立业务表 v5 适配、staging/生产实际数据库验收、真实双浏览器离线/冲突/回滚仍是 4.0.0 阻断门槛。'),
    h('14. 3.58.3 清理旧 Quiz 身份'),
    p('开始新的 QuizWise 测验时立即清空上一场测验留下的 dbQuestions。若当前新测验无法建立云端 session，进度的 questionIds 继续保持为空数组，不会短暂把上一场云端题目 UUID 写入新的本机-only 进度。新增浏览器回归先建立旧云端题目与进度，再导入另一套本机题目并开始本机测验，检查新进度不继承旧 questionIds。此修复不改变 QuizWise 独立云端历史、成绩/复习副作用或 v5 migration scope。'),
    p('本次为 3.58.3 稳定性修复，不改同步协议、数据库或生产灰度。GitHub Actions run 40601080902（SHA 02c573a）中生产构建、Type/lint 与 Existing data safety regressions 通过；Run production UI flows 失败，失败包含 shell 主题状态、Quiz 版本切换立即读写、IELTS dashboard、旧 iframe/theme、study guide、music player、answer sheet、CUE route/search 和 review queue。Quiz 的产品页面文件不在 PR 改动中，本机 Edge 同一浏览器套件 6/6 通过；其跨浏览器断言现改为等待 localStorage 状态，不降低断言。准确 main SHA 382ea47 的本机工作区未包含后续 Quiz 版本选择流程，因此该整组 CI UI 失败仍不应标为已证实历史基线；它们也不是同步安全测试结果。最新提交 CI 及 Preview 需重新核对。'),
    p('4.0.0 前仍必须完成独立业务数据适配、staging/生产真实迁移的计数与哈希、受限账号认证读写及 receipt/SHA/RLS、两个独立浏览器双向/离线/冲突/回滚验收，以及实体手机验收。当前距离真实 v5 端到端仍差这些线上数据与设备证据；不创建 Supabase 分支、不扩大灰度，也不移除运行时 v4 兼容。'),
  ] }],
});

await writeFile(out, await Packer.toBuffer(doc));
process.stdout.write(`${out}\n`);
