import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, WidthType } from 'docx';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const out=resolve(process.argv[2]??'docs/sync-resource-v5-3.45.0.docx');
const p=(text,options={})=>new Paragraph({text,...options});
const heading=(text,level=HeadingLevel.HEADING_1)=>new Paragraph({text,heading:level,keepNext:true});
const cell=text=>new TableCell({children:[p(text)],width:{size:25,type:WidthType.PERCENTAGE}});
const table=(rows)=>new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:rows.map((row,index)=>new TableRow({tableHeader:index===0,children:row.map(cell)}))});

const doc=new Document({
  styles:{default:{document:{run:{font:'Aptos',size:22},paragraph:{spacing:{after:140,line:300}}}},
    paragraphStyles:[{id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{font:'Aptos Display',size:36,bold:true,color:'17324D'},paragraph:{spacing:{after:180}}}]},
  sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1080,right:1080,bottom:1080,left:1080}}},children:[
    new Paragraph({text:'JackYun 同步系统 v5 改造实施说明',style:'Title'}),
    p('版本：Portal 3.45.0；Azure Functions 源码包 3.8.0'),
    p('基线：origin/main 提交 6a486ca3b7d3e52d083851f3c13e5c90751b5d39；基线 Portal 3.44.4。'),
    p('结论：本次交付修复 v4 Gzip 协商和分片接收进度，并新增默认关闭的 v5 服务端协议、资源模型、数据库迁移及 v4 兼容桥基础。Portal 客户端尚未接入 v5 原子拉取/队列，因此本版本不能启用生产账号灰度，也不能视为资源级同步已完成。'),
    heading('1. 现状与目标'),
    p('现有 v4 使用增量游标、记录哈希、离线操作队列、分片缓存和操作回执。Schedule 仍作为一个大记录承载课表、任务、CUE、复习、学习历史和计时器数据。Gzip 服务端能力不能替代客户端协商验证；分片接收也不等于整份正文已通过 SHA-256 校验。'),
    p('改造目标是保留 v4 的数据安全机制，同时建立按账号和资源范围启用的 v5 协议。v5 资源写入使用 baseRevision/baseHash 条件提交，操作回执保证相同操作 ID 可安全重放，删除以墓碑记录表达。数据模型将集合记录拆为稳定 ID 的独立资源，并用顺序资源保留列表顺序。'),
    heading('2. 本次已实现'),
    p('客户端在 v4 协商响应明确声明 transferEncoding=gzip 时启用大对象压缩上传；新增回归测试从协商、分片压缩到服务端解压后的正文校验整个上传链路。下载进度显示“已接收分片”，计数基于唯一分片集合并包含有效缓存；最后一片收到后单独进入“正在校验完整数据”。组装后的 SHA-256 验证通过前，不会进入本地应用流程。'),
    p('新增 Schedule 资源转换模型，当前涵盖课表、任务及完成状态、CUE 卡片与复习、学习记录、练习记录、专注计时器、偏好设置和游戏账户数据。数组以稳定 ID 分记录，另存 $order；映射型数据使用 $keys。重复稳定 ID 会拒绝转换，避免静默覆盖。未识别字段保存在根资源中。'),
    p('Azure 增加 v5 capabilities、manifest、changes、records、operations 与 receipts 路由。写入校验资源范围、正文大小、设备状态、条件版本、幂等操作 ID，并实施每用户每分钟 600 操作上限。changes 日志保留 90 天，游标过期时要求重新建立基线；冲突返回当前远端记录，不覆盖数据。SQL 迁移是新增表及 RLS 策略，不会删除 v4 数据。'),
    heading('3. 双协议一致性与回滚'),
    p('v5 与 v4 使用同一用户写事务。v5 投影提交时同步更新 legacy Schedule 行的 revision、content_hash、updated_at，并追加 v4 变化日志；已存在的多兆字节 storage_value 不随单条资源变更重写。这样 v4 的过期 revision/hash 条件写入会进入冲突流程，旧客户端读取则通过兼容投影获得合并后的 Schedule。投影重建耗时随 v5 写入结果返回，便于后续实测。'),
    p('灰度仅由服务端账号白名单 SYNC_V5_USERS 与资源范围 SYNC_V5_SCOPES 共同控制，不存在全局启用开关。任一 v5 写入失败都不得把旧快照自动转成 v4 全量写入。回滚时先移除测试账号白名单并确认接口回到 v4；保留 v5 表、回执和本地待同步数据，不通过删除数据表或覆盖 Schedule 来回滚。'),
    p('本次服务端兼容桥仍须在真实数据库与客户端端到端测试后才能视作迁移闭环。生产迁移 SQL 未执行，生产环境变量不得设置 v5 白名单。'),
    heading('4. 分阶段交付状态'),
    table([
      ['里程碑','范围','状态与启用策略'],
      ['M1','进度、Gzip、可恢复下载验证','已实现；通过本地聚焦测试，待 CI 和部署后复核。'],
      ['M2','v5 数据模型、接口、数据库迁移','已实现候选代码；默认关闭，迁移 SQL 未应用。'],
      ['M3','Schedule/CUE 资源拆分及 v4 双向投影','资源模型与服务端兼容桥基础已实现；客户端 v5 IndexedDB 原子事务尚未完成，禁止灰度。'],
      ['M4','按页面加载及其他领域资源拆分','未完成；当前定义资源范围，不代表页面读取已切换。'],
      ['M5','跨设备性能对比和生产读写','未验证；需专用测试账号、第二设备及 Azure 运行日志。'],
    ]),
    heading('5. 本地验证'),
    p('已通过：完整 npm run test:sync 共 192 项；Azure backend npm test 共 28 项；v5 CAS/回执/冲突测试；资源模型往返、单条 CUE 编辑影响范围和重复 ID 拒绝测试；v4 Gzip 上传协商、压缩传输及分片恢复测试；Next.js 16.3.8 production build；Azure Functions 3.8.0 打包构建；目标文件 ESLint 与 Node 语法检查。'),
    p('仍需执行：v4/v5 真实 PostgreSQL 事务集成测试，覆盖旧写冲突、兼容投影哈希、资源删除墓碑及并发操作；生产数据库迁移与认证读写验收；浏览器端 v5 IndexedDB 原子页提交和游标推进目前未实现。'),
    heading('6. 性能与安全验收'),
    p('预期指标包括：无变化再次打开 Schedule 不下载完整正文；单条 CUE 修改不重新传输整份 Schedule；有效缓存分片不再请求；任务内接收计数单调递增；仅整体 SHA-256 校验通过后提交本地数据；手机和电脑遵循相同账号级协议。基线 3.44.4 与 3.45.0 的流量和延迟尚未实测，不预先承诺百分比。'),
    p('生产验收必须记录 Vercel READY 对应 commit SHA、Azure Function 版本及运行健康信息，并使用专用测试账号完成认证读写、操作回执查询、再次读取及哈希比对。未提供的 Azure 日志、测试账号和第二设备不能由客户端日志或部署 READY 替代。'),
    heading('7. 发布与运维检查表'),
    p('合并前：运行完整 CI；确认 portal 3.45.0、Functions 3.8.0 和迁移脚本一致；检查 SQL 在指定迁移库可重复演练、RLS 角色与权限正确；核对根工作树原有未提交内容没有进入提交。'),
    p('部署后：确认 Vercel 部署状态 READY 且 SHA 与合并提交一致；检查生产健康端点及 Azure 同步路由的认证/未认证行为；v5 未启用时 capabilities 应保持关闭。生产数据库迁移和 v5 白名单仅在客户端事务闭环、测试账号验收以及回滚演练通过后单独审批。'),
    p('回滚：移除账号白名单，确认所有设备继续使用 v4；检查本地操作仍在持久队列中、没有因 v5 失败触发 v4 覆盖；保留数据库 v5 记录和回执以供诊断。不能仅因 PR 合并成功或 Vercel READY 就宣布同步验收完成。'),
    heading('8. 文件范围'),
    p('主要代码：src/lib/sync/engine.ts、src/lib/sync/resource-model.ts、azure/backend/sync-v5.mjs、azure/backend/sync-api.mjs、azure/sync-v5.sql，以及 /api/sync/v5 Next.js 转发路由。版本记录位于 Portal package 文件和 Azure backend package 文件。详细 SQL 运行限制见 azure/sync-v5.sql 与 azure/backend/README.md。'),
  ]}]
});

const bytes=await Packer.toBuffer(doc);
await writeFile(out,bytes);
process.stdout.write(`${out}\n`);
