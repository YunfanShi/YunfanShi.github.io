const fs=require('fs'),path=require('path');
const deps='C:/Users/syf26/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {Document,Packer,Paragraph,TextRun,HeadingLevel,PageBreak,Footer,PageNumber,ImageRun,Table,TableRow,TableCell,WidthType,BorderStyle}=require(path.join(deps,'docx'));
const p=text=>new Paragraph({spacing:{after:140,line:290},children:[new TextRun(text)]});
const h=text=>new Paragraph({text,heading:HeadingLevel.HEADING_1,spacing:{before:140,after:160}});
const page=()=>new Paragraph({children:[new PageBreak()]});
const border={style:BorderStyle.SINGLE,size:4,color:'D9D9D9'};
const table=rows=>new Table({width:{size:100,type:WidthType.PERCENTAGE},columnWidths:[3000,6500],rows:rows.map((row,i)=>new TableRow({cantSplit:true,tableHeader:i===0,children:row.map(text=>new TableCell({borders:{top:border,bottom:border,left:border,right:border},margins:{top:100,bottom:100,left:120,right:120},children:[new Paragraph({spacing:{after:0,line:250},children:[new TextRun({text,size:21,bold:i===0})]})]}))}))});
const screenshot=path.join(__dirname,'verification/after-768-touch.png');
const children=[
new Paragraph({text:'CUE 学习区域和清单同步更新说明',heading:HeadingLevel.TITLE}),p('JackYun 3.17.0   2026 年 10 月 14 日'),
p('本次更新扩大平板与其他设备的 CUE 学习区域，将占据题目上方大量空间的星空成果面板收成可展开的成果栏。新增仅本次有效的自动间隔重练开关，重练触发按题数或按时间二选一；每日自动任务可关闭。关联的滴答清单支持选择同步范围，在 Schedule 清单时间线查看并同步完成或取消完成。'),
h('本次间隔重练的操作'),p('开始 CUE 学习后，在乱序旁点击“间隔重练”。默认自动进入，按题数触发，间隔 5 题。可以关闭“自动进入间隔重练”，或将触发方式切为按时间。题数可设 1 至 50，分钟可设 1 至 60；时间方式初始值为 5 分钟。两种方式互斥，不会再出现题数或时间任何一个先到就插入的情况。'),
table([['选项','实际行为'],['自动关闭','继续正常题目，不因到期提示或本轮完成而自动导向错题。目录与到期重练按钮保留。'],['按题数','从错题的首次评价开始，计入其他真实检索次数；单纯改评价不会制造间隔。'],['按时间','按实际经过的分钟计算，题数增加不会提前触发。到期在切换下一题时插入，不打断当前作答。'],['修改间隔','从修改时刻及当前检索次数重新计算现有待重练项；通过结果及原评价不清空。'],['手动重练','本轮全部评价后可直接进入剩余未掌握项；否则只进入当前方式已经到期的项。']]),
p('自动开关和触发配置仅保存在当前学习页面，退出再进入即恢复默认。草稿仍保存题目顺序、原评价、待重练项与重练结果。原黄红评价不会因为同日重练通过而被抹掉，自动插入的错题通过后返回原本要学的正常题目。'),
page(),h('平板和其他设备的学习空间'),p('问题的主要原因是触控设备把完整的星空成果面板放在题目之前；同时学习外层采用滚动块布局，题目不能分配剩余高度。现在外层使用纵向布局，题目主区域占剩余空间，长答案在主区域内滚动。低高度横屏允许整体滚动，底部操作保持可访问。'),
p('平板和手机的星空成果默认是一条短栏，点“查看成果”可展开原有统计、收藏和商店。桌面保留侧栏。学习明细和难度集中展开，当前科目、单元、上次与本次评价仍直接显示。手机将其他学习操作收在“更多学习操作”，翻面、作答及评价保留在底栏。'),
new Paragraph({children:[new ImageRun({type:'png',data:fs.readFileSync(screenshot),transformation:{width:330,height:440}})]}),
p('768 × 1024 触控平板的学习主区域约 718 像素，820 × 1180 为 874 像素，1024 × 768 横屏为 462 像素。这里统计的是主区域高度，包含科目与学习明细，不把它误称为纯题目卡片高度。手机 390 × 844 主区域约 502 像素；桌面 1440 × 900 约 771 像素。'),
page(),h('每日任务改为可手动管理'),p('入口是 Schedule 设置中的“课后复习单与滴答清单”，新增“自动生成每日学习任务”总开关。为兼容已有账号，默认沿用原来的开启状态；关闭后不再显示自动生成的每日复习、到期复习批次、维护检查、间隔复习、周末复习和预习任务。'),
p('手动任务、同步清单、课表、学习记录、CUE 内容与到期信息仍保留。关闭不会删除历史证据或把 Cue 标记为掌握。重新打开后按当前日期重新计算任务。开关写入既有 Schedule 状态，沿用本机持久化与账号备份同步；已在滴答中创建的任务不会因为关闭网站自动生成而被删除。'),
h('滴答清单与 Schedule 联动'),p('登录并关联滴答账户后，在今日页面的“清单时间线”点击“同步范围”。多个关联账户可以分别选择清单；勾选后保存，取消全部勾选即可关闭这个账户的读取同步。范围保存在账户设置中，其他登录设备可读取同一选择，不覆盖原来的课后任务发送目标清单。'),
p('时间线显示选中日期的任务、未完成的逾期任务和没有时间的任务。有明确时间时显示时间，无时间时显示全天或未定时间。按任务自身的时区转换日历日期；带有正文的任务可展开查看。页面每分钟及重新获得焦点时刷新，也可以手动刷新。编辑同步范围期间暂停自动刷新，避免覆盖未保存的勾选。'),
p('点击圆形完成按钮后，网站调用滴答完成接口，再读取该任务核对状态；确认成功才改变显示。取消完成通过官方批量更新接口保留任务原有正文、重复规则等字段，并再次核对状态。接口失败或远端没有确认时显示原因，保持原状态，用户可以刷新和重试。'),
p('未完成任务从清单数据接口读取，最近 30 天的已完成任务从官方 completed 接口读取，最多 200 项；达到上限会提示到滴答查看更多历史。因此外部完成会在刷新后显示，完成后的任务仍可取消完成。该清单时间线的完成状态不会伪造 CUE 学习证据，也不会把任意待办的勾选当成知识掌握。'),
page(),h('权限和验证结果'),p('清单接口使用现有 Supabase 账户授权与加密令牌。每次请求先验证当前登录用户，再按账户 ID、用户 ID 与滴答 provider 读取账户；令牌只在服务端解密。同步范围必须属于当前令牌实际返回的清单；完成操作限制在用户选择的范围中，并读取任务核对所属清单。前端不接收令牌，不在日志或响应中输出秘密。无需新增数据库迁移。'),
p('109 项相关单元与接口测试通过，覆盖两种间隔互斥、改间隔保留证据、每日任务开关与旧快照、时区与逾期、账户权限、清单保存、完成与取消完成及失败响应。接口测试执行实际路由代码，使用模拟 Supabase 与滴答服务，不向用户的真实清单写入测试任务。TypeScript、目标源码 ESLint 与生产构建完成检查。'),
p('Edge 验证七种屏幕与输入模式：768 × 1024、820 × 1180、1024 × 768、1366 × 1024 触控平板，900 × 900 鼠标设备，390 × 844 手机与 1440 × 900 桌面。验证翻面、评价、转屏、草稿恢复、背景层级，另在两种横屏平板测试混合题目会话。'),
p('额外的浏览器流程验证自动开关两种状态、设置仅本次有效、每日任务开关刷新保存，以及匿名请求被拒绝。清单浏览器验证从实际 React 组件发起 HTTP 请求到实际路由，再由模拟外部服务返回结果，覆盖保存范围、完成与取消完成、失败时不勾选。尚未用用户的真实令牌进行滴答联调；上线后首次选择清单即可复核真实权限与账号支持情况。'),
p('手表端原有完成与取消完成操作读取的是 JackYun study_tasks；本次清单时间线连接的是滴答任务。滴答自身各客户端会依据远端完成状态同步；本次没有更换手表 APK，也不把两个不同任务库错误地当作已经互通。'),
h('版本与仓库交付'),p('任务开始时 main 与 origin/main 一致。新增可选重练策略和清单同步功能，按版本规则从 3.16.0 升级至 3.17.0。版本信息、源码、测试和本 DOCX 在 main 提交，完成后推送并核对本机与远端提交一致。共享工作区中不属于本次范围的修改继续保留。'),
p('官方接口参考 https://developer.dida365.com/docs/openapi.md'),p('Supabase 用户验证参考 https://supabase.com/docs/reference/javascript/auth-getuser')];
const doc=new Document({styles:{default:{document:{run:{font:'Microsoft YaHei',size:22,color:'000000'}}},paragraphStyles:[{id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{size:34,bold:true,color:'000000'}},{id:'Heading1',name:'heading 1',basedOn:'Normal',next:'Normal',run:{size:28,bold:true,color:'000000'}}]},sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1080,bottom:1080,left:1080,right:1080}}},footers:{default:new Footer({children:[new Paragraph({children:[new TextRun({children:['JackYun 3.17.0  ',PageNumber.CURRENT],size:18})]})]})},children}]});
Packer.toBuffer(doc).then(buffer=>fs.writeFileSync(path.join(__dirname,'CUE学习区域与清单同步说明3.17.0.docx'),buffer));
