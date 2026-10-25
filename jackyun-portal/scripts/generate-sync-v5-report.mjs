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
    p('结论：本次交付修复 v4 Gzip 协商、分片进度与 v5 兼容投影问题，并接通默认关闭的 v5 客户端资源存储、按页面拉取、离线操作队列、原子游标提交和冲突处理。代码与本地专项验证已覆盖主要闭环；真实 PostgreSQL 迁移、生产认证读写和跨设备验收仍未完成，因此不得启用生产账号灰度。'),
    heading('1. 现状与目标'),
    p('现有 v4 使用增量游标、记录哈希、离线操作队列、分片缓存和操作回执。Schedule 仍作为一个大记录承载课表、任务、CUE、复习、学习历史和计时器数据。Gzip 服务端能力不能替代客户端协商验证；分片接收也不等于整份正文已通过 SHA-256 校验。'),
    p('改造目标是保留 v4 的数据安全机制，同时建立按账号和资源范围启用的 v5 协议。v5 资源写入使用 baseRevision/baseHash 条件提交，操作回执保证相同操作 ID 可安全重放，删除以墓碑记录表达。数据模型将集合记录拆为稳定 ID 的独立资源，并用顺序资源保留列表顺序。'),
    heading('2. 本次已实现'),
    p('客户端在 v4 协商响应明确声明 transferEncoding=gzip 时启用大对象压缩上传；新增回归测试从协商、分片压缩到服务端解压后的正文校验整个上传链路。下载进度显示“已接收分片”，计数基于唯一分片集合并包含有效缓存；最后一片收到后单独进入“正在校验完整数据”。组装后的 SHA-256 验证通过前，不会进入本地应用流程。'),
    p('新增 Schedule 资源转换模型，当前涵盖课表、任务及完成状态、CUE 卡片与复习、学习记录、练习记录、专注计时器、偏好设置和游戏账户数据。数组以稳定 ID 分记录，另存 $order；映射型数据使用 $keys。重复稳定 ID 会拒绝转换，避免静默覆盖。未识别字段保存在根资源中。'),
    p('Portal 客户端按页面资源范围读取 capabilities、manifest/changes 与资源正文；正文按 SHA-256 校验后，资源记录、合并后的本地 Schedule 文档及游标在同一个 IndexedDB 读写事务提交。每个 v5 worker 显式绑定创建时账号的 IndexedDB namespace；账号切换后尚未提交的网络响应会被丢弃，不能写入新账号或全局数据库。记录变化使用本地持久 outbox、稳定操作 ID 与服务端 receipt 恢复；CAS 冲突保留两份内容，并在同步中心提供明确的本机/云端选择。灰度撤销会清除客户端 v5 Schedule 所有权标记，使后续周期恢复 v4 路径；服务端版本 CAS 和兼容投影承担冲突保护。'),
    p('Azure 增加 v5 capabilities、manifest、changes、records、operations 与 receipts 路由。写入校验资源范围、正文大小、设备状态、条件版本、幂等操作 ID，并实施每用户每分钟 600 操作上限。changes 日志保留 90 天，游标过期时要求重新建立基线；冲突返回当前远端记录，不覆盖数据。SQL 迁移是新增表及 RLS 策略，不会删除 v4 数据。'),
    heading('3. 双协议一致性与回滚'),
    p('v5 与 v4 使用同一用户写事务。v5 投影提交时同步更新 legacy Schedule 行的 revision、content_hash、updated_at，并追加 v4 变化日志；已存在的多兆字节 storage_value 不随单条资源变更重写。这样 v4 的过期 revision/hash 条件写入会进入冲突流程，旧客户端读取则通过兼容投影获得合并后的 Schedule。移除 v5 写入白名单后，只要账号已有投影头且 v5 表可用，v4 兼容桥仍会继续读取和维护投影；仅关闭白名单不是回滚旧兼容代码的授权。'),
    p('任一 v5 写入失败都不得把旧快照自动转成 v4 全量写入。只有服务端明确撤销 v5 capability 后客户端才清除资源所有权；下一个 v4 写仍依赖兼容投影的 revision/hash CAS，过期内容进入冲突而非覆盖。兼容桥还会对展开后的当前 v5 投影重新执行 Schedule 不可变证据检查，不能只依据可能过期的 legacy 正文。若回退 Azure Functions 到不含兼容桥的旧二进制，可能使 legacy storage_value 与已推进的 revision/hash 不匹配；在部署这种旧版本前必须先物化并哈希校验完整 Schedule 正文，或保留兼容桥版本。v5 表、回执和本地待同步数据不得因回滚而删除。'),
    p('本次服务端兼容桥仍须在真实数据库与客户端端到端测试后才能视作迁移闭环。生产迁移 SQL 未执行，生产环境变量不得设置 v5 白名单。'),
    heading('4. 分阶段交付状态'),
    table([
      ['里程碑','范围','状态与启用策略'],
      ['M1','进度、Gzip、可恢复下载验证','已实现；修复 GitHub Actions 暴露的测试入口、过期断言、仓库 mock、更新精选和时钟边界；并增加账号切换隔离、灰度撤销恢复、冲突保留和当前投影不可变证据校验。最新本地回归通过，最新远端 CI 仍在执行。'],
      ['M2','v5 数据模型、接口、数据库迁移','已实现候选代码；默认关闭，迁移 SQL 未应用。'],
      ['M3','Schedule/CUE 资源拆分及 v4 双向投影','客户端资源存储、页内原子提交、离线操作及冲突决策已接入；真实 PostgreSQL 双向一致性与回滚仍待验证。'],
      ['M4','按页面加载及其他领域资源拆分','按路由选择同步范围已实现；生产侧分资源灰度保持关闭，需先完成数据库迁移及测试账号验收。'],
      ['M5','跨设备性能对比和生产读写','未验证；需专用测试账号、第二设备及 Azure 运行日志。'],
    ]),
    heading('5. 本地验证'),
    p('最新已通过：portal 完整回归 node --test tests/*.test.mts tests/*.test.mjs 共 901 项；test:sync 共 202 项；Azure backend node --test azure/backend/tests/*.test.mjs 共 33 项，含 Azure HTTP 路由与 v4/v5 投影安全测试；ESLint 0 错误（保留 2 条既有 warning）；Next.js 16.3.8 production build。专项还验证 v5 CAS/回执、未知字段投影、原子游标、账号 namespace 隔离、账号切换中止、撤销灰度、多个未决冲突保留、兼容桥不可变证据保护，以及 v4 Gzip 上传与分片进度。Azure Functions 打包构建与密钥扫描在前一提交通过；本轮仅改动共享处理逻辑和测试，仍须由推送后的 CI 重新确认。'),
    p('仍需执行：v4/v5 真实 PostgreSQL 事务集成测试，覆盖旧写冲突、兼容投影哈希、资源删除墓碑及并发操作；生产数据库迁移与认证读写验收；手机和电脑跨设备验证。接口返回 projectionBuildMs、projectionRecordCount 与 projectionBytes；数据库层记录 sqlCount、databaseMs 和 poolWaitMs。单条资源仍会扫描并组装兼容投影，服务端负载是否改善须用相同基线实测，不能由客户端流量减少推断。'),
    heading('6. 性能与安全验收'),
    p('预期指标包括：无变化再次打开 Schedule 不下载完整正文；单条 CUE 修改不重新传输整份 Schedule；有效缓存分片不再请求；任务内接收计数单调递增；仅整体 SHA-256 校验通过后提交本地数据；手机和电脑遵循相同账号级协议。基线 3.44.4 与 3.45.0 的流量和延迟尚未实测，不预先承诺百分比。'),
    p('PR head 238335a0b71b9c637be33acf8e9977f945c2999a 对应的 Vercel Preview 已 READY；预览 /api/health 返回 200，未认证 /api/sync/v5 返回 v5=false。该 Preview 只验证路由与默认关闭，不代表生产部署或认证读写。下一提交对应预览及 GitHub CI 需重新检查。生产验收必须记录 Vercel READY 对应 commit SHA、Azure Function 版本及运行健康信息，并使用专用测试账号完成认证读写、操作回执查询、再次读取及哈希比对。未提供的 Azure 日志、测试账号和第二设备不能由客户端日志或部署 READY 替代。'),
    p('GitHub Actions run 40203515973 曾在 Existing data safety regressions 失败；该轮失败的 Node 测试 alias、旧测试夹具/断言、ARIA 关联、唯一精选版本及音乐同步时间边界已修复。修复提交 238335a 的 run 40206228983 已通过 build、Type/lint 和 Existing data safety regressions，但 Run production UI flows 最终失败，涉及 quiz-ui、IELTS dashboard、quick-task、legacy UI、study guide、music player、answer sheet、CUE route/search 与 review queue 浏览器流程。当前本地 901 项完整回归和专项同步 202 项通过；这些浏览器验收失败需在合并前逐项复现或确认基线，不能将绿色的同步子步骤等同于整个 CI 通过。新一批账号隔离/回滚/投影安全修复尚未推送，故 40206228983 不覆盖当前版本。'),
    heading('7. 发布与运维检查表'),
    p('合并前：运行完整 CI；确认 portal 3.45.0、Functions 3.8.0 和迁移脚本一致；检查 SQL 在指定迁移库可重复演练、RLS 角色与权限正确；核对根工作树原有未提交内容没有进入提交。'),
    p('部署后：确认 Vercel 部署状态 READY 且 SHA 与合并提交一致；检查生产健康端点及 Azure 同步路由的认证/未认证行为；v5 未启用时 capabilities 应保持关闭。生产数据库迁移和 v5 白名单仅在客户端事务闭环、测试账号验收以及回滚演练通过后单独审批。'),
    p('回滚：移除账号白名单后，先验证所有设备回到 v4 写入且兼容桥继续返回最新投影；检查本地操作仍在持久队列中、没有因 v5 失败触发 v4 覆盖；保留数据库 v5 记录和回执以供诊断。若需要回退 Functions 兼容代码，先将投影物化到 legacy storage_value 并校验正文哈希。不能仅因 PR 合并成功或 Vercel READY 就宣布同步验收完成。'),
    heading('8. 文件范围'),
    p('主要代码：src/lib/sync/engine.ts、src/lib/sync/resource-model.ts、azure/backend/sync-v5.mjs、azure/backend/sync-api.mjs、azure/sync-v5.sql，以及 /api/sync/v5 Next.js 转发路由。版本记录位于 Portal package 文件和 Azure backend package 文件。详细 SQL 运行限制见 azure/sync-v5.sql 与 azure/backend/README.md。'),
  ]}]
});

const bytes=await Packer.toBuffer(doc);
await writeFile(out,bytes);
process.stdout.write(`${out}\n`);
