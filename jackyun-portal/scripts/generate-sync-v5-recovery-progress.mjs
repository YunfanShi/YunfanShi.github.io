import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const bundledModules = process.env.CODEX_NODE_MODULES;
const { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, WidthType } = require(bundledModules ? resolve(bundledModules, 'docx') : 'docx');
const out = resolve(process.argv[2] ?? 'docs/sync-v5-full-data-recovery-progress-3.54.0-20261028.docx');
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
    p('记录日期：2026 年 10 月 28 日。Portal 当前候选版本：3.54.0。目标版本：在所有数据迁移与安全验收完成后发布 4.0.0。'),
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
    p('新增 applyLocalPageImport 与 v5RestoreTargets 账号隔离目标队列，将本机恢复点、完整仓库 flush、全目标 v5 核对和安全清理连接起来；新增恢复目标参与状态判断的防误报逻辑。Schedule 备份显式覆盖 Schedule 资源域，旧键按 workspace 字段路由。QuizWise 做题中进度现按 stable legacyQuiz 键恢复，并阻止未确认答案被静默清除。机器清单 docs/sync-v5-coverage-matrix-20261028.json 覆盖 257 个键模式、30 个 IndexedDB 调用点与独立 API 所有者；它仍是迁移底表，不代表每条记录均已 v5 验收。Portal 候选版本为 3.54.0；独立业务表迁移、数据恢复演练、真实跨浏览器生产验收和 v4 退役仍未完成，目标 4.0.0 未宣称完成。'),
  ] }],
});

await writeFile(out, await Packer.toBuffer(doc));
process.stdout.write(`${out}\n`);
