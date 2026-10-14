const fs=require('node:fs'),path=require('node:path');
const {Document,Packer,Paragraph,TextRun,HeadingLevel,PageBreak}=require('C:/Users/syf26/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/docx');
const pages=[
  {title:'JackYun 考试诊断驱动学习闭环开发说明',sections:[
    ['交付范围','本次版本为 3.23.0，按新功能规则由 3.22.1 升级。核心闭环是未见题独立计时、记录真实失分、针对修复、再用不同未见题验证。新增功能进入现有 Schedule，不建立另一套计时器、错题本或云数据库。本文说明审计结果、数据关联、操作方法、验证结果与发布条件。'],
    ['仓库与正式网站核查','开始和交付前均成功 fetch GitHub main，基线提交为 1d6b73f，两端提交一致。原本地 main 存在其他任务的未提交改动，包括 Cue、Schedule 和版本文件；本次在独立的 detached HEAD 工作目录开发，保留原目录。正式 StudyGuide 只读请求返回 HTTP 200，服务器为 Vercel，但响应未提供可核验的部署提交或应用版本，不能据此宣称线上已包含本次改动。'],
    ['已有功能与实际缺口','StudyGuide 已有 2026-10-13 限时新题方法。Practice Timer 已有科目与分值配时、暂停、逐题报告、知识点与自由文本卡点。Question Bank 已有原题、markingPoints、maxScore、Cue 关联和作答快照。Cue 已有知识记忆与评分点自查，本次保留。'],
    ['需要补充的部分','旧系统缺少独立考试诊断、事实与潜在原因区分、CS 原始作答的人工评分点对照、Repair 到不同新题的显式关联、可调周频率和跨练习改善过程。旧逐题报告允许事后批改改变首次统计；旧周计划只有 Statistics 与 CS 轮换。'],
    ['复用与改动原则','原有周统计和 Unit/Subsection 分析继续使用，增加首次结果保护与平均时间。已有同步协议使用版本与哈希校验、三方按稳定 ID 合并、离线队列和历史备份；本次扩展它的业务保护，不变更同步协议、不迁移数据库、不修改账号权限。'],
  ]},
  {title:'数据结构与关联设计',sections:[
    ['Schedule 内的诊断记录','ScheduleControlState 新增可选 examDiagnoses 数组和 practiceFrequencies 数组，schemaVersion 继续为 1。ExamDiagnosis 保存科目、考试名、日期、题号、Unit/Subsection、Knowledge Node、原因分类与证据状态、错误事实、训练目标、实际分数、满分和可选失分。只要求日常诊断的核心字段，其余分组折叠、可以之后补充。'],
    ['使用已有记录作为来源','sourceRecordId、sourceSessionId 与 sourceQuestionId 指向原有手动训练或计时器逐题记录。从练习创建会带入科目、日期、题号、章节、知识点和复测描述；从 Question Bank 原始作答创建会带入问题引用、原始答案与已有分数。bankQuestionId 与 cueIds 关联现有题库和知识 Cue。'],
    ['评分与验证历史','reviews 保存追加的人工评分复核；每次复核有独立 ID、日期、实际分数、满分、用户填写的 MS 来源、分值规则及逐点判断。events 保存 Repair 解释或 Transfer 关联；Transfer 指向已存在的 session/question，并可附本次 CS 评分复核。它不复制一份练习到另一套统计系统。'],
    ['统一的原因分类','采用 Knowledge、Recall、Interpretation、Condition/Rule、Selection、Reasoning/Modelling/Application、Execution/Calculation、Response Structure、Expression/Marking-point、Time/Strategy 十类。计时器使用同样的稳定代码建议列表，保留旧自由文本卡点。Application 归于指定情境中的推理应用，不额外维护一套含义冲突的 CS 标签。'],
    ['不可覆盖的首次证据','逐题 firstAttempt 保留首次批改的结果、用时、时限与是否无法起步；手动 firstResults 保留首次汇总，后续更正进入 corrections。旧记录在第一次需要保护或修正时建立原始快照，不编造过去的未知结果。已被旧系统覆盖的历史只能从已有备份恢复，不能从当前值逆推出首次失败。'],
    ['减少重复与控制规模','计时器汇总按 timer-session ID 复用逐题数据，每题稳定 ID 去重。分析优先从逐题首次快照重新推导，避免旧客户端重算汇总改变首次正确率。诊断推荐只显示前两项；添加计划是明确点击，不使用循环自动生成任务。'],
  ]},
  {title:'考试诊断与新题验证的使用方法',sections:[
    ['创建与补充诊断','进入 Schedule，在今天、周视图、题库或记录视图中找到 Exam Diagnosis。选择新建考试诊断，填写科目、考试名称、日期、题号、错误事实和训练目标。原因可多选，默认是潜在原因；只有人工确认后才改为已确认。成绩、章节、Cue、题库关联和复测计划可展开补填。'],
    ['Pure Math 的例子','Q10 的事实填写“题目要求 Find f(x)，首次却使用切线方程”。选 Interpretation 和 Selection，目标填写“根据最终要求选择求导、积分或切线”。保存后是待观察，而不是长期薄弱结论。先记录 Repair，解释题目要求、积分的理由与适用条件，再用不同题面的 B 新题计时。'],
    ['Physics 的例子','Q9 填写 Inclined Plane 的方向判断错误。可标潜在 Reasoning/Modelling，训练目标具体写“区分速度、合力与加速度方向”。系统记录用户选择的原因，不从一个错误选项推断整个 Dynamics 章节都不会。实际选择新题和确认题面相关性由用户负责。'],
    ['Repair 与 Feynman 解释','点击记录 Repair 解释，写清原理、研究对象、适用条件、为何原方法不合适、如何修复。熟悉 PQ 与 Cue 用于修复，不能充当独立新题验证。Repair 只改变为已修复待验证，不直接标记能力改善。'],
    ['关联 Transfer Test','先在计时器完成另一道未见题并批改，再点击关联新题验证。候选限制为同科目、已结束、独立尝试的 B 新题或首次作业，排除原题、熟题、完整模拟和已关联的逐题 ID。验证日期不得早于修复或计划日期；备注说明新题如何测试相同目标。不同题面和未见状态仍依赖用户如实确认。'],
    ['状态与后续结果','独立正确且按时显示 ✓ 新题验证通过；正确但超时显示 △；错误、求助、无法起步或 CS 尚有缺失得分点显示 ○。每次 Repair 与 Transfer 都保留，后续失败会重新显示需要修复。单次成功只证明本次迁移，不宣称长期掌握。多个独立新题同类失分提升关注度；已确认的高分值知识缺口可提前优先。'],
    ['把验证安排到日程','先在诊断中保存 Transfer 日期与目标，再点击加入复测日程。同一诊断同一天已有未取消任务时不会重复添加。任务指向未见题方法，不预先暴露 C 类完整卷，也不会自动创建 Cue 或一批练习。'],
  ]},
  {title:'Computer Science 人工评分点分析',sections:[
    ['保留主观题原始答案','在诊断的 CS 原始作答组填写 My Original Answer、Command Word 和答题能力，也可以从已有 Question Bank 作答创建。尚未填写的原始答案可后补，首次填写保存后只读，评分更正不能改变它。答题能力包括 Definition Precision、State/Give、Describe Process、Explain Cause and Effect、Compare/Contrast、Scenario Application、Algorithm/Pseudocode、Trace/Debug。'],
    ['逐点对照官方评分标准','点击人工 MS 对照或修正，填写实际分数，例如 4/6，填入用户提供的 MS 来源或试卷引用，再添加评分点。已关联题库的 markingPoints 可以载入，但全部默认待人工核对。系统不查造官方评分标准、不自动宣称来源已核验，也不将这些点导入 Cue。'],
    ['得分与遗漏的判断','每点填写点值、达到/遗漏/待核对状态和作答依据或等效表达。Knowledge 表示知识缺口，Interpretation 表示没有回答实际要求，Reasoning/Modelling/Application 表示指定情境应用不足，Expression/Marking-point 表示遗漏必要术语、机制或限定条件。判断由人完成，不按字符串是否相同判分。'],
    ['分值规则与人工修正','点值支持不同权重，参考总分受满分上限约束；实际分数由用户根据替代得分、等级制或其他真实规则填写。分值规则和人工修正理由可记录。再次修正追加新复核，旧分数、旧评分点和原始答案仍能查看；统计每道诊断的最新人工复核，不把多次修正当多道新题。'],
    ['CS 的新题验证','CS 诊断设置答题能力后，Transfer 必须附新题的人工实际评分。只有新题独立正确、按时、达到满分，并且没有遗漏或待核对点评价，才显示验证通过。部分得分如 4/6 继续显示需要修复；不能因为计时器选了正确就忽略真实失分。'],
    ['按能力选下一步训练','诊断可以按科目和答题能力筛选；显示平均实际分数、平均满分、遗漏点数量与常见人工失分类型。选定能力后可进入现有计时器，页面提示训练目标，用户选择相应题型和未见题。没有自动生成题目或 AI 判分，本次无需新增模型服务或密钥。'],
    ['Cue 与题库的职责','确认知识缺口时，提示完善已有 Cue 的通用知识。单题 MS 和题面留在 Question Bank 或对应人工复核历史；表达缺口优先选择同能力的新题作答。修复过程保留在诊断，实际练习结果仍存于原练习记录。'],
  ]},
  {title:'练习分析与每周学习负担',sections:[
    ['分类统计','周指标提供全部训练、独立新题、A 熟题修复、C 完整模拟四种范围。科目、Unit、Subsection 分析显示尝试数、按时正确率、平均每题时间、超时数、错误或求助、无法起步和主要卡点。缺失章节显示待补信息，不推断未知章节。'],
    ['改善过程','独立新题长期改善区按课程与知识点展示时间顺序的首次结果。例如 Graph Sketching 连续两次 ○ 后第三次 ✓，过程全部保留。它只纳入独立 B 新题与首次作业，不纳入熟 PQ 或完整卷；同一 session/question ID 只出现一次。重复失分标为线索，少量样本提醒继续观察。'],
    ['可调整的周频率','默认 Pure Math、Mechanics、Physics 每周一次各 25 分钟；Computer Science 每周两次各 20 分钟；Statistics 次数为 0，以新作业与按需训练维持。每周频率可设置 0–7 次，每次 5–120 分钟。设置只影响主动安排，不自动生成额外作业；既有旧轮换函数保留兼容，但新界面按配置工作。'],
    ['学校作业抵扣','新界面按该科目设置的单次时长判断训练次数，首次接触且独立计时的学校作业可计入。已有计时器结果自动作为证据，无需在 Schedule 再录一次。只勾选任务完成不等于有训练证据。手动计划按已计入次数与现有未完成任务数量限制重复添加。'],
    ['计时器保持原有节奏','仍保留题型预设、三档节奏、暂停恢复、分值配时与报告。普通大题可在题目备注手动设 12 或 15 分钟；短题与长题继续按实际需要调整。时间超过所设限时记真实超时，成功结果区分 ✓ 和 △。首次批改后修改复核不会抹除首次失败。'],
    ['StudyGuide 的位置','保留原 How to Learn、Practise、Diagnose、Repair、Transfer 和考试策略。只调整周频率说明并增加 Schedule 诊断、计时器入口，不重构为另一个任务管理器。题库 A 用修复，B 用日常未见题，C 留给完整模拟，用户选择题目时仍需保护陌生度。'],
  ]},
  {title:'兼容 同步与验证结果',sections:[
    ['旧数据兼容与备份','没有 examDiagnoses 的旧状态读取为空数组，没有频率配置时读取可修改的默认值。新数据边界校验包含合法日期、分数上限、唯一 ID、原因枚举和评分点状态；无效诊断或首次快照会报错并保留原本地内容，不静默清空。沿用原学习数据导出、同步中心与历史备份；诊断面板另可导出已保存记录和未保存的表单或评分编辑。'],
    ['并发与旧设备保护','同一诊断依据编辑前的基线进行三方合并，不同字段或独立事件可合并；同字段冲突拒绝本次覆盖，提示导出并重新打开。原始答案、首次来源、历史评分与验证事件不可覆盖。原服务端 Schedule 保护同时用于 Vercel 和 Azure；扩展后拒绝首次快照和诊断历史的丢失，即使客户端持有新的云端版本。'],
    ['通过的验证','诊断与计时相关 38 项单元测试通过；原同步测试 125 项通过。覆盖 A/B/C 与作业分类、超时、CS 部分分和等效表达、诊断关联、修复后验证、重复去重、历史兼容、同字段冲突及旧客户端证据保护。TypeScript、修改文件 Lint、StudyGuide 检查、密钥扫描和 Next.js 生产构建通过。Azure Functions 打包通过，未上传部署。'],
    ['浏览器证据','390px 手机和 1440px 桌面均通过 Pure Math 创建至新题验证、CS 4/6 与遗漏点对照、原始答案只读、离线保存、刷新恢复、多标签页接收更新和无水平溢出检查，页面脚本错误为 0。测试使用独立浏览器上下文、构造数据、本机 Supabase 地址及无效占位值，没有登录真实账户。'],
    ['已知基线失败','完整学习测试 187 项中 185 通过、2 失败；未修改 main 的同两项 Cue 测试也失败。cue-game 的星空渲染测试存在模块加载问题，cue-practice 的浏览器计时器测试在 VM 中缺少 require。完整 Lint 有 5 个错误和 2 个警告；错误在 dida-schedule-ui.browser.mts 与 watch-dida.test.mts，基线复现一致。未修改无关功能来掩盖这些问题。'],
    ['验证的边界','跨设备保护使用合并函数、服务端业务保护与原同步测试验证；真人登录两台设备和真实云端新增诊断往返未执行。生产部署尚未执行；允许上线后应同时更新含 schedule-safety 的 Azure 同步后端，再做非破坏性账号验收。原始旧快照恢复仍使用现有备份，不对当前账户进行破坏性测试。'],
  ]},
  {title:'代码交付与发布条件',sections:[
    ['主要代码位置','src/lib/learning/exam-diagnosis.ts 定义校验、人工评分摘要、推荐、修复和验证状态。src/components/modules/schedule/exam-diagnosis-panel.tsx 提供新面板。schedule-control.ts 和 workspace-reader.ts 扩展可选数据与兼容读取；Schedule 组件只增加原面板旁的入口。'],
    ['已有模块的最小扩展','practice-timer.ts 保存首次逐题快照并推导真实汇总；timed-practice.ts 增加手动首次结果与修正历史、周频率及分类范围；practice-insights.ts 复用章节统计并增加长期新题序列。public/PracticeTimer.html、practice-timer.js 与 practice-engine.js 使用原工作台，增加首次结果说明、统一原因建议与目标提示。'],
    ['同步与版本文件','src/lib/sync/schedule-safety.ts 扩展不可覆盖证据检查，原 Vercel 和 Azure 同步入口共同调用；server.ts 更新拒绝说明。package.json、package-lock.json 与 update-history.ts 更新到 3.23.0。没有新增数据库表、第三方云服务或模型依赖。'],
    ['如何复验','运行 npm run test:diagnosis、npm run test:timed-practice、npm run test:sync、npm run check:study-guide、npm run check:secrets、TypeScript 和生产构建。tests/exam-diagnosis.browser.mts 可在本机启动网站后运行，默认地址为 http://localhost:3123，可用 JACKYUN_TEST_URL 与 JACKYUN_PLAYWRIGHT_PATH 指定地址和 Playwright 安装。'],
    ['未执行事项与原因','没有实施可选 AI 评分或自动生成题目：本次先用可核查的人工语义对照完成核心闭环。没有在线验证真实 MS、替用户选用未见试卷或自动创建 Cue。没有执行正式部署、数据库破坏性变更和真实账号多设备演练。原本地 main 的其他未提交工作完整保留。'],
    ['审查与合并','本次代码和本说明以独立提交交付，目标分支为 main。附件明确要求生产部署事先确认；由于推送 main 可能触发 Vercel 正式发布，最终合并与生产发布需确认后执行。确认后先检查 main 是否新增提交，处理相关冲突，发布网站及同步后端，再核对版本、非破坏性保存、导出和另一设备读取。'],
    ['验收范围','A 与 B 的诊断事实和潜在原因、C 的原始答案及 4/6 人工复核、D 的学校作业抵扣和 E 的独立新题改善序列均有单元或浏览器证据。最终判定依据用户实际作答和人工评分，不把少量样本或熟题重复表现宣称为长期能力提升。'],
  ]},
];
const p=text=>new Paragraph({spacing:{after:130,line:290},children:[new TextRun({text,font:'Microsoft YaHei',size:22})]});
const h=text=>new Paragraph({text,heading:HeadingLevel.HEADING_2,spacing:{before:140,after:100}});
const children=[];
pages.forEach((page,index)=>{if(index)children.push(new Paragraph({children:[new PageBreak()]}));children.push(new Paragraph({text:page.title,heading:index?HeadingLevel.HEADING_1:HeadingLevel.TITLE,spacing:{after:180}}));if(!index)children.push(p('版本 3.23.0   开发与验证日期 2026 年 10 月 15 日'));for(const [title,body] of page.sections)children.push(h(title),p(body));});
const doc=new Document({creator:'JackYun development',title:'JackYun 考试诊断驱动学习闭环开发说明',styles:{default:{document:{run:{font:'Microsoft YaHei',size:22,color:'000000'}}},paragraphStyles:[{id:'Title',name:'Title',basedOn:'Normal',run:{font:'Microsoft YaHei',size:36,bold:true,color:'000000'}},{id:'Heading1',name:'heading 1',basedOn:'Normal',run:{font:'Microsoft YaHei',size:30,bold:true,color:'000000'}},{id:'Heading2',name:'heading 2',basedOn:'Normal',run:{font:'Microsoft YaHei',size:24,bold:true,color:'000000'}}]},sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1080,bottom:1080,left:1080,right:1080}}},children}]});
Packer.toBuffer(doc).then(buffer=>{fs.writeFileSync(path.join(__dirname,'JackYun-3.23.0-Exam-Diagnosis-20261015.docx'),buffer);fs.writeFileSync(path.join(__dirname,'implementation.md'),pages.map(page=>'# '+page.title+'\n\n'+page.sections.map(([title,text])=>'## '+title+'\n\n'+text).join('\n\n')).join('\n\n'));console.log('DOCX and detailed implementation report written');});
