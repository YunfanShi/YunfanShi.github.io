const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const deps=process.env.JACKYUN_ARTIFACT_PACKAGES||'C:/Users/syf26/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {Document,Packer,Paragraph,TextRun,HeadingLevel,PageBreak,Table,TableRow,TableCell,WidthType,Header,Footer,PageNumber,AlignmentType}=require(path.join(deps,'docx'));
const context={structuredClone,crypto:crypto.webcrypto};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../jackyun-portal/public/practice-engine.js'),'utf8'),context);
const E=context.PracticeEngine;
const p=text=>new Paragraph({spacing:{after:150,line:300},children:[new TextRun(text)]});
const h=text=>new Paragraph({text,heading:HeadingLevel.HEADING_1,spacing:{before:100,after:170}});
const sub=text=>new Paragraph({text,heading:HeadingLevel.HEADING_2,spacing:{before:130,after:90}});
const page=()=>new Paragraph({children:[new PageBreak()]});
const cell=(text,head=false)=>new TableCell({shading:head?{fill:'EEF3EF'}:undefined,margins:{top:55,bottom:55,left:95,right:95},children:[new Paragraph({spacing:{after:0,line:240},children:[new TextRun({text,size:18,bold:head})]})]});
function matrix(families){const minute=value=>String(Math.round(value*10)/10);const rows=[new TableRow({tableHeader:true,children:['学科组和题型','内容范围','宽松','普通','模考'].map(t=>cell(t,true))})];for(const [family,label] of families)for(const type of E.profiles[family]){const [name,description,exam]=type;rows.push(new TableRow({cantSplit:true,children:[`${label} ${name}`,description,minute(exam*1.5),minute(exam*1.2),minute(exam)].map(t=>cell(t))}));}return new Table({width:{size:100,type:WidthType.PERCENTAGE},columnWidths:[2400,3900,850,850,850],rows});}
const children=[
new Paragraph({text:'练习计时器与登录界面更新说明',heading:HeadingLevel.TITLE,spacing:{after:230}}),
p('JackYun 3.15.0   2026 年 10 月 13 日'),
p('本次更新把 StudyGuide 的独立限时新题训练做成可直接使用的工具。Schedule 与时间管理提供入口，HTML 工作台记录每题用时和总用时，训练结束后生成报告，并把已批改的真实证据回写 Schedule。登录界面同步优化。'),
sub('进入练习'),
p('在 Schedule 的今日、本周、做题或学习记录页面打开练习计时器，也可从时间管理进入。先选择科目、宽松或普通或模考档、题目来源，并按实际情况勾选首次独立尝试。练习范围、来源编号可不填。'),
p('科目列表读取 Schedule 的学习分类和课表课程。预设覆盖纯数、力学、物理、统计、计算机、化学、生物、人文学科和 IELTS；无法识别的科目提供通用题型，并允许新增科目与题型。'),
sub('操作与用时'),
p('总时间采用正计时，反映累计有效作答；每题采用倒计时，提供节奏提示。Space 同步开始或暂停；数字 1 至 6 选择当前科目的前六种题型；右方向键切换下一题。输入框中不触发计时快捷键。'),
p('新题默认命名为第 1 题、第 2 题，也可自定义名称。新增下一题时暂停，先选题型再开始，选择题型的时间不算作答。题号导航允许返回先前题；各题累计用时独立保存，总用时是各题有效用时之和。'),
sub('专注全屏'),
p('点击专注全屏后，专门为倒计时布置整个可用页面：中央大倒计时，右上角总用时，顶部题号和节奏，左上角低调的题型菜单，底部按键说明、暂停、下一题及结束按钮。页面导航、设置与填写区收起，不依赖浏览器 F11。'),
p('Esc 或退出全屏返回普通界面，计时状态和记录保留。题目名称、范围、批改和诊断在普通界面填写。全屏的题型菜单默认折叠，支持按钮或数字键，避免一屏选择框。'),
p('三色分别设计简约动效：绿色呼吸与轻涟漪、黄色缓慢流动、红色外围细弧快速旋转；数字与真实进度环保持稳定。开始、暂停、切题和阶段变化使用柔和短音。设置可分别关闭动效与音效并调节音量；系统减少动态效果时关闭动效。'),
page(),h('默认题型时间一'),p('下表单位为分钟。模考为训练基准，普通放宽 20%，宽松放宽 50%。所有时间都是可调整的训练起点，不代替具体试卷规则。'),
matrix([['math','数学'],['mechanics','力学'],['physics','物理'],['statistics','统计']]),
p('数学类识别 Math、数学、纯数等名称；Statistics 和 Mechanics 优先于一般数学识别。常规计算与跨章节综合分开，避免把选择题和长题统一设置为 12 至 15 分钟。'),
page(),h('默认题型时间二'),matrix([['cs','计算机'],['science','化学生物'],['humanities','人文'],['ielts','IELTS'],['general','自定义']]),
p('题型按相近用时合并展示。例如常规计算可覆盖同科多个章节，而不是把每个知识点都变成按钮。题型说明列出主要范围；设置里可进一步添加细分。'),
page(),h('时间判断与 StudyGuide 闭环'),
sub('为什么这样设置'),
p('StudyGuide 建议纯数、力学、统计按卷面总时间与分值估算，Edexcel IAL 可从约 1.2 分钟每分起步；Physics 选择题约 1.5 至 2 分钟。工具提供可选分值与每分分钟输入，覆盖本题时间。默认 2 分钟用于快速题，6 至 10 分钟用于常规结构任务，12 至 15 分钟用于综合大题。长写作单独设定。'),
p('三档用时可按每一种题型独立修改。已计时题锁定题型和原始限时快照，防止修改设置使旧题从超时变成按时；新设置用于尚未开始的题。单题也可在开始前直接调整时间。'),
sub('背景提示与最终状态'),
p('剩余时间大于 30% 为绿色；大于 10% 且不超过 30% 为黄色；不超过 10% 且未超时为红色。到零后继续记录真实用时，转为黄色超时提示，并显示超过限时多久。颜色配合文字，阈值可修改，要求 0 小于红色阈值小于黄色阈值小于 100。'),
p('背景颜色表示作答节奏，不代表正确性。用户自行批改：正确且在限时内为绿色 ✓；正确但超时为黄色 △；错误、无思路或求助为红色 ○。未批改保持待批改，不默认当作正确。标记无从下手会同步判为 ○。'),
sub('报告与修复'),
p('结束后报告显示总有效用时、按时正确率、超时题数、待批改题数，以及逐题用时、原限时、三种状态和主要卡点。薄弱线索按题型汇总，优先错误与慢题；样本较少时明确说明不能直接判断长期薄弱。'),
p('可在报告里补批改并填写 Knowledge Node、Root Cause、Retest。九类通用根因涵盖知识、理解、检索、审题、建模、方法、计算执行、表达规范和时间策略。每次只修最高影响的一项，再换一道未见题独立验证。'),
p('约 90 秒完全无法起步时提供跳过建议，但不把 90 秒当成所有题的时限。已有进展时按原题时间继续。第二轮修复应另开 A 类练习，保留首次 ○ 或超时证据；StudyGuide 的最小提示、根因修复、当天新题和延迟验证说明可直接打开。'),
p('报告可一键加入 Schedule 新题复测，同次报告多次点击只添加一项。原始练习报告保留；复测用新的练习记录验证，不用熟题反复成功覆盖首次尝试。'),
page(),h('数据保存与交付验证'),
sub('与 Schedule 的数据联动'),
p('数据使用现有 jackyun_schedule_control_v1 账号同步文档。practiceSessions 保存逐题记录和草稿，practiceTimerConfig 保存科目题型的三档时间与颜色阈值，timedPracticeRecords 保存由已批改报告生成的训练摘要。登录后由现有同步链路写入账户存储，游客保存在本机。无需新建独立题目数据库或迁移旧记录。'),
p('每次操作保存，运行时每 5 秒保存检查点。关闭或刷新后恢复至最后成功保存的有效用时，并默认暂停，关闭期间不计入训练；突然断电可能丢失最后几秒。普通后台停留仍按真实时间累计，避免定时器被浏览器降频影响用时。'),
p('HTML 只发送受限消息，父页面验证数据后通过现有本地写入锁和三方合并保存，保护其他 Schedule 字段。同一次练习使用 Web Locks 防止多个标签页同时编辑。收到其他设备更新时暂停并提示重新打开；可导出 JSON 保留当前内容。此行为要求支持 Web Locks 的现代浏览器。'),
p('未批改记录完整保存为逐题报告；所有实际作答题批改后，才写入训练摘要。摘要按同一练习 ID 更新，不产生重复证据。新题周指标仅纳入 B 或首次作业且独立尝试，熟题 A、整卷 C 和非独立练习保留报告，但不进入新题正确率。'),
p('Schedule 继续显示新题真正动笔数、按时正确率、超时与无从下手次数，以及每次训练主要卡点的前两项。单次独立训练达到 20 分钟才抵扣周目标；短训练也保留题数证据。新增跨历史题型诊断和逐题报告入口，支持从学习记录查看。'),
sub('验证与版本'),
p('已通过 125 项学习、学习并发、洞察、移动学习、路线、同步及练习计时相关测试。1440 像素桌面与 390 像素手机浏览器验证专注全屏、隐藏填写区、题型菜单、Space 与 Esc、暂停、逐题切换、颜色边界、超时、刷新恢复、训练摘要、复测去重、自定义预设及登录布局。'),
p('TypeScript 检查与生产构建通过，生成 94 个静态页面。全仓库 ESLint 无错误，原有两个测试文件存在未使用参数警告。浏览器另外验证黄色与红色动效、独立动画与音效开关。对应源文件、结果与截图保存在 docs/practice-timer-3.15.0。真实账户跨设备同步沿用现有系统，本次以本机持久化、合并与同步边界测试验证，未使用用户账号制造训练数据。'),
p('按新功能规则从 3.14.2 更新为 3.15.0。任务开始已 fetch 核对本地提交和 origin/main 一致。本次仅提交计时器、相关入口与记录、登录样式、版本信息、测试及说明，不混入工作区原有其他未提交改动。'),
];
const doc=new Document({creator:'JackYun',title:'练习计时器与登录界面更新说明',styles:{default:{document:{run:{font:'Microsoft YaHei',size:21,color:'202125'},paragraph:{spacing:{line:300}}}},paragraphStyles:[{id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{size:36,bold:true,color:'000000'},paragraph:{spacing:{after:240}}},{id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',run:{size:28,bold:true,color:'202125'},paragraph:{keepNext:true}},{id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',run:{size:23,bold:true,color:'202125'},paragraph:{keepNext:true}}]},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:900,bottom:900,left:1000,right:1000}}},headers:{default:new Header({children:[new Paragraph({children:[new TextRun({text:'JACKYUN   /   3.15.0   /   2026 年 10 月 13 日',size:16,color:'6B756F'})]})]})},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[new TextRun({text:'练习计时器   ·   ',size:16,color:'6B756F'}),new TextRun({children:[PageNumber.CURRENT],size:16,color:'6B756F'})]})]})},children}]});
Packer.toBuffer(doc).then(buffer=>{const target=path.join(__dirname,'练习计时器与登录界面更新说明3.15.0.docx');fs.writeFileSync(target,buffer);console.log(target);});
