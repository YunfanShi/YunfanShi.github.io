import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, WidthType } from 'docx';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output=resolve('docs/sync-data-rescue-3.52.0-20261027.docx');
const p=(text,options={})=>new Paragraph({text,...options});
const h=(text,level=HeadingLevel.HEADING_1)=>new Paragraph({text,heading:level,keepNext:true});
const cell=(text,header=false)=>new TableCell({children:[p(text,{spacing:{before:90,after:90},...(header?{bold:true}:{})})],width:{size:25,type:WidthType.PERCENTAGE},verticalAlign:'center',margins:{top:120,bottom:120,left:140,right:140}});
const table=rows=>new Table({width:{size:100,type:WidthType.PERCENTAGE},columnWidths:[2200,4900,5100],rows:rows.map((row,index)=>new TableRow({tableHeader:index===0,children:row.map(value=>cell(value,index===0))}))});

const doc=new Document({
  styles:{default:{document:{run:{font:'Aptos',size:22,color:'000000'},paragraph:{spacing:{after:150,line:300}}}},
    paragraphStyles:[{id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{font:'Aptos Display',size:34,bold:true,color:'000000'},paragraph:{spacing:{after:160}}}]},
  sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1080,right:1080,bottom:1080,left:1080}}},children:[
    new Paragraph({text:'JackYun 同步数据恢复与 v5 覆盖审计',style:'Title'}),
    p('实施说明与验收状态 · Portal 3.52.0 · 2026 年 10 月 27 日'),
    p('结论：复核日志与源码后，定位并修复一个会把本机空数组误判为“删除全部云端数据”的 v5 缺陷。增量同步和新设备首次基线现在都会把空集合当作尚未加载的本地缓存，不据此生成批量删除；已填充集合中的单条删除仍会生成资源墓碑。3.58 MB Schedule 本地恢复导入已取消 1 MB 人为上限。该交付修复了可复现的 Schedule 故障，但并不代表所有业务表都已迁入 v5，也不证明 Azure 503 或手机跨设备验收已完成。'),
    h('1. 用户可见故障和根因'),
    p('用户报告本机 Schedule 被清空后，客户端仍显示同步成功或最新，但页面中的 CUE、任务等数据为空；部分云端储存项有数据，打开功能后却看不到。此前日志中同一时间段出现了 Azure v5 请求、v4 与 v2 大对象请求，以及服务端 503。协议混跑和服务端延迟解释了请求慢与状态误导，但不能单独证明空白内容是网络造成。'),
    p('源码根因有两层。其一，captureLocalChanges 在增量拉取前对比本地 Schedule 和 IndexedDB 中缓存的 v5 资源。若本地字段存在但为空，例如 cues: [] 或 completions: {}，转换器只产生空的顺序/键资源，随后的缺项比较会把所有缓存云记录排入 v5 删除队列。首次 manifest 基线也可能把空集合误认作本地意图。其二，/schedule 路由只订阅 Schedule 字段中的一部分；但页面本身会显示 CUE 复习、学习历史、练习、计时器和报告。当 v5 已拥有整份 Schedule 后，旧 v4 会跳过整个 Schedule，因此没有列入页面订阅的字段不会从 v5 拉取。两条路径都能造成“云端有记录，功能页却空”或数据被过早删除。'),
    p('这一修复使用保守规则：空数组或空映射本身不是“全部删除”的授权。新设备或刚清空浏览器缓存时，云端完整记录先经 SHA-256 校验，再投影回本机。明确的逐条删除仍然通过非空集合差异生成墓碑；将来若提供“清空整个集合”，必须由单独、明确的用户操作产生可审计意图，不能依靠空快照推断。'),
    h('2. 本次实现'),
    table([
      ['模块','改动','数据安全结果'],
      ['v5 变更采集','Schedule 字段如属于 items/map 且本机集合为空时，不从本机快照生成资源操作；/schedule 补齐页面实际使用的结构化字段。','避免空缓存触发 delete-all；非空集合中删除单条记录仍按稳定 ID 写入墓碑，所有页面显示的数据都有订阅目标。'],
      ['首次基线事务','最终基线页合并前跳过空集合字段的本地意图比较。','防止尚无游标的新设备因空数组创建冲突、空顺序记录或覆盖远端值。'],
      ['状态呈现','成功状态注明“当前页面所需资源已核对；其他页面会在打开时分别检查”。','不再把页面级同步状态表述成整个账号全部资源都已检查。'],
      ['本地恢复导入','为页面级本地 JSON 增加结构、页面、键白名单及 Schedule 内容校验，移除 Schedule、Definitions、对比记忆本地导入的 1 MB 文件大小限制；导入等待本地写队列 flush。','真实 3.58 MB Schedule 可用于设备间人工恢复；不放宽云端 API 请求体上限，也不放宽凭据过滤。'],
    ]),
    p('本地文件导入不是云端同步：它只恢复所选页面到当前设备，并保留导入前的本机版本。若想让导入内容成为跨设备数据，必须随后完成云端 v5 条件写入和回执确认。完整账户档案导入已经移除额外 3.5 MB 前端拒绝，但仍经由带 4 MB 请求体上限的认证 Server Action；该路径服务端读写多张 Supabase 表。本次没有盲目提高请求上限或伪装成本地 v5 导入。'),
    h('3. 验证结果'),
    p('专项验证：`node --test tests/sync-v5-client.test.mts tests/backup-center.test.mts`，本次改动后的新增与既有用例一并通过。覆盖已有 v5 游标时的空数组/空 map、首次 v5 基线、从非空 CUE 列表删除单条记录、真实 3.58 MB Schedule 页面 JSON 本地导入、Schedule 实际资源订阅和 Definitions/对比记忆路由订阅。完整 test:sync 通过 288 项；TypeScript 无错误；修改文件 ESLint 0 错误及 0 警告；Next.js 生产构建成功。'),
    p('生产日志曾显示 v5 capabilities / changes / records 和部分 v4/v2 请求并存；多次 Azure 服务端 503，最长同步请求在数十秒级。公开站点或 VPN 可达不等于 Azure Functions 到数据库连接正常。用户从香港网络访问客户端也不能消除 Azure 服务端到 PostgreSQL 的连接池、数据库负载或故障。当前没有足够的 Azure Application Insights / Functions 失败请求日志来确认服务端 503 根因。'),
    p('专项测试是本机 IndexedDB 合成响应测试，不会写入真实生产业务数据。真实账号的 HTTP 回执、云端回读哈希以及实体手机—电脑同步尚未通过此提交重新验收。部署 READY、健康端点或接口 200 单独都不足以替代上述证据。'),
    h('4. 数据范围审计'),
    p('Schedule v5 资源模型已经涵盖结构化 Schedule 字段，包括 timetable、任务/完成/取消、CUE 与复习、学习记录、练习、计时器、设置、报告及未识别根字段。页面路由按需选择其中一部分，并非每次都拉取整个账号所有字段；成功状态因此只确认当前页面的订阅资源。'),
    p('Definitions 与对比记忆此前已有 legacyCue Workspace 键分类，但路由订阅缺少 /definitions 和 /properties。本次将这两个实际页面接入 legacyCue/legacyLearning，并加入 route target 回归测试。其他页面的本地键覆盖不应由这两个修复外推。'),
    table([
      ['数据家族','当前观察到的存储/路径','v5 覆盖判断'],
      ['Schedule 与 CUE','jackyun_schedule_control_v1、resource-model.ts；另有独立定义卡/卡组键。','Schedule 结构化字段接入 v5；独立 Workspace 键粒度较粗，仍需要核对真实键、所有者和读写页面。'],
      ['QuizWise 与测验','Supabase quiz_* 表；QuizWise IndexedDB 的 quiz_data/offline_answers；quizwise_* 本地键。','不能整体归为 v5。IndexedDB 答题与离线队列目前不是 v5Resources 的通用资源适配器。'],
      ['学习计划与任务','study_plans/tasks/syllabus/config/mock_records、companion_learning_queue、offline-workspace outbox 及 Schedule 任务。','Schedule 任务字段有 v5；独立服务端表与持久离线操作队列需要分别做所有权和回执迁移。'],
      ['IELTS、专注、阅读','IELTS/练习 API、focus_* 表、reader_books 与阅读进度接口。','部分本地键进入 Workspace；专用 Supabase / API 记录仍由独立路径拥有，不能仅靠键映射视为已迁移。'],
      ['词汇、诗词、音乐、休闲','vocab_*、poem_*、music_*、relax_* 表与本地/IndexedDB 内容缓存。','服务端业务表和大体积缓存需要分开界定；内容缓存通常不应复制，用户进度与创作数据需要 v5 资源定义。'],
      ['个人站点、偏好、备份','personal_sites、user_settings、legacy_sync_data、页面备份以及本地页面恢复。','存在 v5 Workspace 个人站点候选和独立备份服务；全量表迁移与完整备份 v5 化尚未完成。'],
    ]),
    p('当前 BACKUP_TABLES 清单包含 30 个 Supabase 表；它们与 Schedule 文档及 IndexedDB v5Resources 不是同一数据集合。把表名映射到“页面”或 Workspace 字段，不会自动将该表读写改成 v5，也不能证明所有数据都随设备同步。认证、设备、调试日志、密钥和服务端缓存仍必须保持独立或排除，不可为了“全量”一并复制。'),
    h('5. 后续里程碑与验收门槛'),
    table([
      ['里程碑','必须完成','完成证据'],
      ['A. 本次缺陷修复','空缓存保护、状态边界、3.58 MB 本机导入。','专项测试 34/34；合并后的完整 test:sync、lint、typecheck/build 重新通过。'],
      ['B. 数据清单归属','逐表、逐 IndexedDB store、逐本地键记录所有者、CRUD 入口、敏感级别、备份策略、资源 ID、页面订阅和删除语义。','生成覆盖矩阵；每项分类为 v5、服务器权威、缓存/本地专用或待迁移，并链接相应读写代码和测试。'],
      ['C. 统一客户端同步','为确认需跨设备的数据实现 v5 records/operations/receipts 适配，IndexedDB 记录、离线队列和游标同事务提交；取消重复协议所有权。','按领域测试离线重试、幂等、冲突、删除、丢回执、重开恢复与 SHA-256。'],
      ['D. 真实环境读写','取得 Azure 503 的运行时证据；在受控测试主体用同一生产/预生产 API 完成条件写入、回执查询、重新读取及哈希复算。','脱敏机器结果含部署 commit、请求 ID、operation ID、回读 hash；不记录口令或业务正文。'],
      ['E. 多设备与发布','电脑与实体手机双向新增/修改/删除、离线修改后重连、冲突保留及兼容回滚；只在安全条件全满足后扩展灰度。','两设备日志与资源哈希一致；回滚不丢待发操作；生产部署为 READY 且 SHA 对应合并提交。'],
    ]),
    p('真实 v5 端到端验收目前仍差：①变更合并和部署；②Azure Functions 503 的服务端根因与恢复稳定性；③受控真实身份下写入—回执—读回哈希的最新证据；④实体手机参与的双向和离线测试。用户已说明当前没有手机，因此不得将手机验收报告为通过。其他 Supabase 表和 IndexedDB store 尚未全量迁移到 v5，是明确的剩余产品范围，不是本次版本隐式完成的内容。'),
    h('6. 发布和回滚原则'),
    p('本次不执行 Supabase 分支创建、数据库迁移或生产表修改。不得因网站正常打开、VPN 连接成功、单次请求返回 200 或 Vercel 部署 READY 而宣告同步稳定。生产前端部署只能在完整同步回归和安全检查通过后进行；v5 错误时本机待同步操作保留，禁止把旧快照无条件降级成 v4 全量覆盖。'),
    p('若数据范围迁移失败，先暂停对应领域 v5 写入并保留 outbox、收据、冲突和游标；回滚必须验证兼容投影版本/hash 与旧路径数据一致。用户可用页面级本机 JSON 恢复当前设备，但它不是云端回滚和跨设备验收的替代品。'),
    p('本文件记录本次修复范围和尚缺的端到端条件。没有执行的迁移、尚未验证的业务域、服务端日志和实体设备测试均明确保留为未完成。'),
  ]}]
});

await writeFile(output,await Packer.toBuffer(doc));
process.stdout.write(`${output}\n`);
