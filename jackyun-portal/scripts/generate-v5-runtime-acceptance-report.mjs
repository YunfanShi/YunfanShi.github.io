import * as fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dependencyRoot='C:/Users/syf26/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {Document,Packer,Paragraph,PageBreak,Table,TableRow,TableCell,HeadingLevel,WidthType,BorderStyle,ShadingType,VerticalAlign}=await import(pathToFileURL(path.join(dependencyRoot,'docx/dist/index.mjs')).href);
const stage=JSON.parse(fs.readFileSync('docs/sync-v5-staging-runtime-20261027.json','utf8'));
const live=JSON.parse(fs.readFileSync('docs/sync-v5-production-cue-http-20261027.json','utf8'));
const portalVersion=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const backendVersion=JSON.parse(fs.readFileSync('azure/backend/functions-package.json','utf8')).version;
const p=text=>new Paragraph({text,spacing:{after:130,line:290}});
const h=text=>new Paragraph({text,heading:HeadingLevel.HEADING_1,keepNext:true});
const borders=Object.fromEntries(['top','bottom','left','right','insideHorizontal','insideVertical'].map(key=>[key,{style:BorderStyle.SINGLE,size:4,color:'D9D9D9'}]));
function table(rows,widths){return new Table({width:{size:9360,type:WidthType.DXA},columnWidths:widths,borders,
  rows:rows.map((row,index)=>new TableRow({tableHeader:index===0,children:row.map((text,column)=>new TableCell({width:{size:widths[column],type:WidthType.DXA},
    verticalAlign:VerticalAlign.CENTER,margins:{top:110,bottom:110,left:140,right:140},
    shading:{type:ShadingType.CLEAR,fill:index===0?'E7EBEF':index%2?'FFFFFF':'F7F8FA'},
    children:[new Paragraph({text,spacing:{after:0,line:270}})]}))}))});}
const firstCreate=live.trace.find(row=>row.path==='/api/sync/v5/operations'&&row.status===200);
const update=live.trace.find(row=>row.requestBytes===586);
const children=[
  new Paragraph({text:'JackYun v5 数据库与生产接口验收',style:'Title'}),
  p('验收日期 2026 年 10 月 27 日  报告范围 数据库与七个生产资源域'),
  p('本轮已解除单项 Secret 访问及数据库认证阻碍。受限 staging PostgreSQL 和生产七个资源域的真实认证 HTTP 读写通过，Functions 3.12.0 已部署。按用户明确授权，七域已全局开放；这不代表独立旧业务迁移、恢复演练和手机 PWA 验收完成。Portal 3.50.0 的合并与部署状态单独核验。'),
  h('环境与身份'),
  p(`GitHub main 与隔离工作树基线均为 ${stage.sourceBaseCommit.slice(0,7)}。本轮发布候选为 Portal ${portalVersion} 和 Functions ${backendVersion}。本轮真实网络检查已核对旧生产后端 3.9.1、协议 5 和 Gzip；候选部署结果需以最终矩阵中的生产端点及提交核对为准。`),
  p('staging 数据库为 jackyun_v5_stage_20261026，连接登录为 jackyun_sync_login，事务执行角色为 jackyun_sync_runtime。测试确认登录没有超级用户、BYPASSRLS、建库或建角色权限，执行角色不拥有被测表。'),
  p('Azure Object ID 与网站账号 User ID 属于不同身份系统。原夹具错误地将随机 UUID 用于写入，触发用户外键；随后输入 Azure Object ID 的尝试在账号门禁前停止。这两次失败不计为验收。修复后写入仅使用已查询确认的网站测试账号，随机身份仅用于拒绝测试。'),
  h('真实数据库通过项'),
  table([
    ['范围','实际结果'],
    ['结构与权限','五张 v5 表存在，主键正确，RLS 开启，读写 owner policy 检查当前网站身份，workspace 约束存在。'],
    ['资源与回执','创建、修改、SHA 256 回读、幂等重试、操作 ID 错用拒绝、旧 revision 冲突、删除墓碑均通过。'],
    ['事务与隔离','资源、回执与游标共同回滚通过；其他身份读写被 RLS 拒绝。最终外层 ROLLBACK 成功后才输出成功。'],
  ],[2200,7160]),
  new Paragraph({children:[new PageBreak()]}),h('生产 CUE 真实认证 HTTP'),
  p(`初轮正常登录和 Auth 用户核验成功，Azure v5 capability 返回 200；该轮 scopes 为 ${live.scopes.join(', ')}。下列数据保留为初轮 CUE 基线，不代表当前全局范围。后续七域验收及全局配置见最后矩阵。运行器使用线上 HTTPS 接口，不绕过认证中间件。`),
  p('本轮实际验证创建资源、查询回执、同操作重复提交、读取并计算 SHA 256、修改、旧版本冲突、复用操作 ID 的 409 拒绝、删除及墓碑回读。唯一测试资源已删除，新建测试会话已注销；墓碑及回执作为同步协议记录保留。'),
  table([
    ['请求','正文大小','本次耗时'],
    ['能力检查','0 B','3348 ms'],
    ['首次资源创建',`${firstCreate.requestBytes} B`,`${firstCreate.durationMs} ms`],
    ['资源修改',`${update.requestBytes} B`,`${update.durationMs} ms`],
    ['其余创建后请求','0 至 524 B','187 至 227 ms'],
  ],[4400,2480,2480]),
  p('这些是一次测试链路的实际测量，不代表所有用户的延迟分布，也没有与 3.44.4 建立相同场景的百分比性能对比。请求正文是测试资源；报告不保存用户学习正文。'),
  h('证据与复现'),
  p('生产证据 sync-v5-production-cue-http-20261027.json 记录每次接口的请求 ID、HTTP 状态、正文字节和耗时。测试运行器 scripts/azure-v5-http-acceptance.mjs 仅从进程环境读取账号及公开 API 配置；默认不写入，显式开启测试写入后才执行唯一探针资源。'),
  p('数据库证据 sync-v5-staging-runtime-20261027.json 记录权限、结构、实际 handler 行为与回滚结果。Key Vault 启动器支持 TestSubject 参数，该参数是网站测试账号 UUID。密码通过已授权单项 Secret 注入进程，执行后恢复原环境。数据库连接固定校验 staging 主机、数据库及登录名。'),
  new Paragraph({children:[new PageBreak()]}),h('上线前仍需完成的门槛'),
  p('当前已按用户授权全局开放七个资源域，并通过生产真实 JWT HTTP 验收。以下列出仍需完成的业务与设备验收；旧协议不能在这些条件未满足前退役。'),
  table([
    ['阶段','状态及剩余工作'],
    ['P0 与 P1','单 Secret 权限、数据库连接、schema、CRUD、receipt、hash、CAS、事务回滚及 RLS 已通过。'],
    ['P2 覆盖','30 个动态来源模式行中 18 行可云同步，四个隔离页面观察到 8 行写入，10 行待采样。57 个实际 Key 已通过 staging 回执、哈希、幂等及回滚；独立 API 尚待迁移。'],
    ['P3 兼容','受限 staging 已验证双向投影、灰度关闭恢复、删除防复活，以及客户端队列交接、丢响应与回执落盘故障。真实认证浏览器与完整 Schedule 场景仍待验收。'],
    ['P4 迁移','需要最新完整备份、新隔离库恢复、所有账号迁移、增量追赶、数量与指纹对账及失败恢复。'],
    ['P5 与 P6','七域生产 HTTP 核心读写通过；真实浏览器网络恢复和电脑手机 PWA 往返尚未完成。无效 JWT 及账号头不匹配拒绝已验证。'],
    ['P7 与 P8','Functions 已部署，七域已按授权全局开放。Portal 合并及部署继续核验；旧协议保留，退役必须另行通过迁移与回滚验收。'],
  ],[2200,7160]),
  h('发布状态与停止条件'),
  p('操作员此前只在 staging 补授 auth schema USAGE，未授予 auth.users 读取权。本轮 Codex 使用已授权本机网络和 Tailscale 成功执行完整受限 runtime，收到最终 JSON、退出码 0 与最终事务回滚确认；57 个动态 Key、队列交接、三类写作集合及 RLS 均通过。运行身份为受限 runtime，管理员没有替代 RLS 验收。'),
  p('报告生成时：Functions 3.12.0 已部署且七域生产 HTTP 通过，Portal 3.50.0 本地构建及数据安全测试通过，尚待主线合并与 Vercel 发布确认。发现数据丢失、跨账号泄漏、异常覆盖或回滚不安全时，暂停新写入并保留未确认 Outbox，不得直接回退上传旧全量快照。'),
  p('当前 Supabase 源库查询确认 IELTS Writing workspaces 表不存在，尽管仓库已有建表迁移；不能将接口源码视为可用数据源或已完成迁移。其余业务源数量已核对，但尚未执行全量复制和哈希对账。后续报告继续以未通过的实际验收为主。'),
  p('生产 Supabase 只读核验（不导出正文）已复核源快照：QuizWise 为 5 个科目、10 次会话、119 道题，分别来自 2 个账号；Reader Books 为 9 条、1 个账号；Study Tasks 为 1 条、1 个账号；Study Plans、Review、Focus Sessions 和 Focus Tasks 均为 0 条；离线操作回执为 1 条。上述 12 张表均启用 RLS 且至少有一条策略。精确 PostgreSQL JSONB 行指纹与迁移前行数见 sync-v5-business-source-baseline-20261027.json。此快照只作为迁移对账基线，不代表已导出、恢复或写入 v5。'),
  new Paragraph({children:[new PageBreak()]}),h('个人网站迁移与队列交接'),
  p('候选客户端现在将个人网站保存到统一账号仓库，不再双写独立备份 API。旧云端备份 GET 返回经过服务端核验的网站账号，并拒绝账号不匹配请求。导入在后台执行，断网不会阻塞已有本地网站的显示与保存。旧备份表及旧客户端 POST DELETE 端点仍保留，尚未完成服务端写入冻结和权威切换。'),
  table([
    ['数据风险','实现与验证'],
    ['本地编辑与旧副本不同','保留原编辑，用来源账号及内容派生稳定 UUID 保存独立副本；重试不重复建站。'],
    ['墓碑与基线','导入只允许缺失记录；事务内发现文档、墓碑或云端基线时不替换。'],
    ['账号切换','导入固定来源账号和 IndexedDB 命名空间；延迟响应账号不一致即停止。无账号归属的旧缓存保留在访客恢复路径，不自动认领。'],
    ['本机存储故障','记录与待发意图同一事务提交。注入队列写入失败时共同回滚；本地候选仍保留，可重试。'],
    ['浏览器验收','1280 与 390 宽度各验证来源可用及不可用，保留本地内容且可继续保存；旧备份写请求为 0。仅合成账号夹具，不是手机真机。'],
  ],[2200,7160]),
  h('真实数据库与模拟浏览器存储'),
  p('staging 测试使用实际 PostgreSQL runtime handler 和实际 v5 客户端、fake-indexeddb 存储。冻结提交被延后；注入交接删除失败后两个队列可恢复；成功交接沿用原操作 ID。服务器接受后丢失响应、本机回执删除失败，重建 worker 后均从回执恢复，不重发业务变更。'),
  p(`本轮断言服务器变更 POST 为 ${stage.workspaceHandoff?.serverMutationPosts??'待核对'} 次、SQL 回执 1 条、资源 revision 为 1，且 SHA 256 回读正确。最终外层事务回滚。此证据不经过 Bearer HTTP 认证，也不证明浏览器重启后的物理存储和真实跨设备行为。`),
  p(`生产 Supabase 源端于 2026-10-27 07:04 UTC 只读复核了 13 张旧业务表的行数及聚合 SHA-256，与 05:59 UTC 基线一致；未导出正文、未写入生产。这只证明旧源快照未漂移，尚未证明一次性迁移或恢复完成。当前 Portal ${portalVersion} 和 Functions ${backendVersion} 的构建及数据安全验收结果见本轮矩阵；独立旧业务路径、全用户最新恢复对账与手机真机验收仍需继续。`),
  new Paragraph({children:[new PageBreak()]}),h('IELTS 写作集合服务端验收'),
  p('本阶段已完成写作页面客户端接入 v5：旧独立 Supabase 集合 GET PUT 已从编辑器移除，编辑器以本地数组作为兼容投影，按作文 ID 拆分为 v5 条目；下载数据与字段游标同一 IndexedDB 事务提交，冻结旧提交或待确认冲突时延后交接。服务端仍保留旧 API 供 v4 迁移兼容；这不代表已完成 Bearer HTTP、真实浏览器登录或手机电脑验收。'),
  table([
    ['资源字段','稳定身份与兼容来源'],
    ['writingEssays','原 workspaces 数组按 id 拆分；保留作文草稿、反馈和其他字段。'],
    ['writingErrorHistory','原错误历史按 essayId 拆分；不同作文的错误记录独立版本化。'],
    ['writingArchive','原归档按 id 拆分；测试覆盖 64 字符身份，不截断、不重命名。'],
  ],[2500,6860]),
  p('记录地址采用有界十六进制编码，避免业务 ID 中的 log auth 等内容误触敏感键过滤。仅严格识别的新命名空间允许超过普通键长度限制；记录地址仍不超过协议 240 字符上限。基线标记由服务端保护，不能通过客户端修改。'),
  h('真实 staging 通过项'),
  p('三类集合都通过初始拆分、单项修改不推进其他项版本、v5 写入更新旧数组及哈希、合法 v4 写入反映到记录、过期全量快照拒绝、删除防复活、重复操作回执、灰度关闭后的读写及恢复。对投影写入注入故障后，记录、回执和游标共同回滚；同一操作可安全重试。全量受限 runtime 也验证 57 个动态 Key 的写入、重放、回执、SHA-256 复读和 savepoint 回滚。'),
  p('重复身份和记录 ID 不一致被拒绝。新记录地址不能降级到 v4 写入；客户端发现旧后端没有 writingCollections 能力时，不发送未知字段，并保留待发操作。缺失标记不能让旧源数组覆盖独立恢复出的较新记录；该保护还有单元回归。'),
  p('测试使用受限 runtime 身份、真实 PostgreSQL 与实际协议处理器，在隔离库事务内运行，没有经过 Bearer HTTP。结束时源数组、记录和游标恢复起始状态，前后指纹相同，外层事务回滚。证据见 sync-v5-staging-writing-20261027.json；未改变生产配置。'),
  p('权限修复后的最新受限 runtime 复测已通过，退出码 0、transactionRolledBack=true。后续七个 scope 又通过真实 JWT、本机候选 HTTP 服务和实际 Azure staging 数据库的验收；该 HTTP 验收逐请求提交，并在测试后恢复探针的起始逻辑状态。两种证据分别记录，均不等同于手机真机或页面业务操作验收。'),
  h('仍需执行'),
  p('客户端按项接入现已完成本地单元和 TypeScript 验证，仍需真实认证浏览器登录、断网/重连与电脑手机跨设备验收；原 Supabase 旧 API 服务端是否可退役还需查清其他兼容调用。之后执行完整备份恢复、来源逐项对账和受控灰度。归档动作目前保留原工作稿，直到服务端回执及读回能证明归档落盘，避免用户内容消失。'),
  p('当前发布候选的本地同步回归 268 项、Azure 后端 50 项、TypeScript 及 Next.js 生产构建通过。此前的写作逻辑、QuizWise legacyQuiz 键映射及动态 key 浏览器场景证据仍保留；动态云同步模式 18 项中 8 项已观察写入，10 项待采样。本轮受限 runtime 已完整通过，后续 staging 与生产七域真实 JWT HTTP 也通过。历史 UI 引用文本定位失败单独保留，不替代同步数据安全测试，也不证明真实手机验收。'),
  new Paragraph({children:[new PageBreak()]}),h('Offline Workspace 迁移边界'),
  p('对照 supabase/migrations/20261025023755_reliable_offline_mutations.sql，/api/offline/workspace 的当前 RPC 在一个 Supabase 事务中串行化同账号操作，校验不可变 operationId 与 payload hash，执行业务副作用后写入回执。task.create 使用 operationId 作为任务 ID；plan.delete 同事务删除子任务和计划；review.attempt 同事务插入 attempt 并更新复习间隔、streak、状态和下次复习时间。回执只有操作确认信息，不包含所有副作用记录快照。'),
  p('架构以 Azure Functions 与 Azure PostgreSQL 为业务同步权威，Supabase 仅保留 Auth、JWT 与用户 UUID 链路。旧 RPC 的存在只表示待迁移的历史业务路径；不改造 Supabase 生产 Schema、不创建 Supabase Branch、不将它作为 v5 发布前置条件。需要保留的旧行采用一次性只读导出、Azure 恢复和逐项对账方案；新的业务事务与回执应在 Azure 同一事务提交。旧 API 只在数据完整迁移且旧写入已安全停止后清理。'),
  new Paragraph({children:[new PageBreak()]}),h('本轮全资源验收矩阵'),
  table([
    ['验收项','结论','证据及边界'],
    ['Full Staging Runtime','PASS','真实受限 PostgreSQL；CRUD、回执、SHA-256、RLS、v4 兼容、队列交接与最终回滚。'],
    ['七个 Scope 真实 JWT HTTP','PASS','timetable learning cue practice timer settings workspace；并发去重、冲突、删除恢复与逻辑基线恢复。'],
    ['生产 CUE HTTP','PASS','真实登录与 Functions；本轮探针删除及测试会话注销。'],
    ['生产 workspace Schema','PASS','先 staging 后生产；四项约束已验证，事务内原有行数量与 SHA-256 不变。'],
    ['生产七域 HTTP','PASS','Functions 3.12.0 部署后七域真实 JWT、并发去重、CRUD、回执、哈希、冲突、删除恢复均通过，探针恢复起始逻辑值。'],
    ['Portal 构建与发布','构建通过','3.50.0 已通过生产构建和 TypeScript；主线合并及 Vercel READY 待发布步骤确认。'],
    ['页面实际业务路径','待逐模块实测','独立 Offline Workspace、QuizWise、Reader Books、Focus Sessions 仍需确认 Azure 权威接入。'],
    ['电脑与手机 PWA','未完成','本机未发现已连接的手机；模拟宽度和 fake-indexeddb 不计为手机真机验收。'],
    ['全用户最新数据迁移恢复','未完成','既有历史备份及行指纹不能替代最新源快照、恢复和最终增量对账。'],
  ],[2700,1100,5560]),
  p('生产 Functions 3.12.0 的健康版本已核验。用户已明确要求全部开放；七域生产 HTTP 通过后，执行 SYNC_V5_MODE=global 和七域 SYNC_V5_SCOPES 配置。全局模式只开放已实现的资源协议，独立旧业务迁移与真机验收仍按上述未完成项继续；旧协议兼容未退役。'),
];
const doc=new Document({styles:{default:{document:{run:{font:'Microsoft YaHei',size:22,color:'000000'},paragraph:{spacing:{after:130,line:290}}}},
  paragraphStyles:[{id:'Title',name:'Title',basedOn:'Normal',run:{font:'Microsoft YaHei',size:36,bold:true,color:'000000'},paragraph:{spacing:{after:230}}},
    {id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',run:{font:'Microsoft YaHei',size:27,bold:true,color:'000000'},paragraph:{spacing:{before:220,after:130},keepNext:true}}]},
  sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1080,bottom:1080,left:1440,right:1440}}},children}]});
Packer.toBuffer(doc).then(buffer=>fs.writeFileSync('docs/sync-v5-runtime-acceptance-20261027.docx',buffer));
