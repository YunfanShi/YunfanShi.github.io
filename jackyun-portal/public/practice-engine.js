(function(root){
  'use strict';
  const modes=['relaxed','normal','exam'];
  const legacyProfiles={
    math:[['快速题','选择、代数变形、基础运算',2],['常规题','函数、三角、微积分、数列',6],['证明题','恒等式、几何、推导',8],['综合题','跨章节、多步骤建模',12],['长综合','完整大题、复杂应用',15]],
    mechanics:[['快速题','概念与选择',2],['常规计算','运动学、力、动量、功与能',6],['作图建模','受力图、平衡、连接体',8],['综合题','多阶段运动、碰撞与动力学',12]],
    physics:[['选择题','概念、单位、数量级',2],['解释题','定义、因果与图像',4],['结构计算','力电热波、公式与单位',7],['实验题','不确定度、图表、实验评价',10],['综合题','多知识点结构大题',14]],
    statistics:[['快速题','概率选择、数据摘要',2],['常规题','排列组合、分布与相关',6],['推断题','假设检验、置信区间',9],['综合题','概率建模、多步骤统计',12]],
    cs:[['概念题','定义、比较、数据表示',3],['代码跟踪','trace、逻辑、查询、输出',6],['算法题','伪代码、编程、数据结构',10],['设计评价','系统、网络、安全、复杂度',12]],
    science:[['选择题','概念与基础判断',2],['短答题','定义、过程、方程',4],['结构计算','化学计量、遗传、定量应用',7],['实验材料','数据分析、实验与评价',10],['综合解释','机制、联系与长答',14]],
    humanities:[['短答题','概念、事实、定位',3],['材料分析','证据、来源、图表',8],['解释比较','因果、比较与分析',12],['评价论述','论点、证据、权衡',15],['长文写作','完整论述或作文',30]],
    ielts:[['Listening','单节不暂停不回拨；按音频调整',10],['Reading','单篇文章含题组',20],['Writing Task 1','描述图表或书信',20],['Writing Task 2','议论文',40],['Speaking','独立新题口语练习',3]],
    general:[['快速题','选择、基础检索',2],['短答题','定义、解释',4],['常规题','结构题、计算',7],['综合题','多步骤应用',12],['长答题','评价、论述',15]]
  };
  const presetRevision='mixed-alevel-2026-v1';
  const source=(id)=>'https://www.cambridgeinternational.org/Images/'+id+'-syllabus.pdf';
  const edexcelSource='https://qualifications.pearson.com/content/dam/pdf/International%20Advanced%20Level/Mathematics/2018/Specification-and-Sample-Assessment/international-a-level-maths-spec.pdf';
  const papers={
    math:{label:'Edexcel IAL P1–P4',minutes:90,marks:75,url:edexcelSource},
    mechanics:{label:'Edexcel IAL M1–M3',minutes:90,marks:75,url:edexcelSource},
    statistics:{label:'Edexcel IAL S1–S3',minutes:90,marks:75,url:edexcelSource},
    further:{label:'Edexcel IAL FP1–FP3',minutes:90,marks:75,url:edexcelSource},
    furtherMechanics:{label:'Edexcel IAL M2/M3',minutes:90,marks:75,url:edexcelSource},
    furtherStatistics:{label:'Edexcel IAL S2/S3',minutes:90,marks:75,url:edexcelSource},
    scienceMCQ:{label:'9702/9701/9700 P1',minutes:75,marks:40,url:source('664565-2025-2027')},
    scienceAS:{label:'9702/9701/9700 P2',minutes:75,marks:60,url:source('664565-2025-2027')},
    scienceA2:{label:'9702/9701/9700 P4',minutes:120,marks:100,url:source('664565-2025-2027')},
    sciencePractical:{label:'9702/9701/9700 P3',minutes:120,marks:40,url:source('664565-2025-2027')},
    sciencePlanning:{label:'9702/9701/9700 P5',minutes:75,marks:30,url:source('664565-2025-2027')},
    csTheory:{label:'9618 P1/P3',minutes:90,marks:75,url:source('697372-2026')},
    csAlgorithm:{label:'9618 P2',minutes:120,marks:75,url:source('697372-2026')},
    csPractical:{label:'9618 P4',minutes:150,marks:75,url:source('697372-2026')},
    econMCQ:{label:'9708 P1',minutes:60,marks:30,url:source('697423-2026-2028')},
    econA2MCQ:{label:'9708 P3',minutes:75,marks:30,url:source('697423-2026-2028')},
    economics:{label:'9708 P2/P4',minutes:120,marks:60,url:source('697423-2026-2028')},
    businessAS:{label:'9609 P1',minutes:75,marks:40,url:source('697371-2026-2028')},
    businessData:{label:'9609 P2',minutes:90,marks:60,url:source('697371-2026-2028')},
    businessDecision:{label:'9609 P3',minutes:105,marks:60,url:source('697371-2026-2028')},
    businessStrategy:{label:'9609 P4',minutes:75,marks:40,url:source('697371-2026-2028')},
    historySource:{label:'9489 P1/P3',minutes:75,marks:40,url:source('697368-2026-2027')},
    historyEssay:{label:'9489 P2/P4',minutes:105,marks:60,url:source('697368-2026-2027')},
    geography:{label:'9696 P1–P4',minutes:90,marks:60,url:source('664556-2025-2026')},
    englishReading:{label:'9093 P1/P3/P4',minutes:135,marks:50,url:source('635901-2024-2026')},
    englishWriting:{label:'9093 P2',minutes:120,marks:50,url:source('635901-2024-2026')}
  };
  // Representative marks are training choices, not a claim of fixed official question durations.
  const definitions={
    math:[['短计算 · 3分','代数、三角、函数小问',3,'math'],['常规计算 · 5分','微积分、数列、坐标几何',5,'math'],['推导证明 · 6分','恒等式、证明、show that',6,'math'],['结构整题 · 8分','多小问结构题',8,'math'],['长综合 · 12分','建模与跨章节整题',12,'math']],
    mechanics:[['短计算 · 3分','力、速度、能量小问',3,'mechanics'],['受力建模 · 5分','受力图、平衡、连接体',5,'mechanics'],['常规整题 · 8分','运动学、动力学、动量',8,'mechanics'],['综合整题 · 12分','多阶段运动、功与能',12,'mechanics']],
    statistics:[['短计算 · 3分','数据摘要、概率小问',3,'statistics'],['分布计算 · 5分','排列组合、二项、正态',5,'statistics'],['结构整题 · 8分','S1 概率建模或 S2/S3 推断',8,'statistics'],['长综合 · 12分','抽样、检验、估计、多步骤',12,'statistics']],
    further:[['短推导 · 4分','矩阵、复数、向量',4,'further'],['常规题 · 6分','级数、微分方程、积分',6,'further'],['证明整题 · 10分','进一步纯数结构题',10,'further'],['长综合 · 15分','多步骤证明与应用',15,'further']],
    furtherMechanics:[['短计算 · 4分','圆周、转动、平衡',4,'furtherMechanics'],['常规整题 · 8分','碰撞、简谐、动力学',8,'furtherMechanics'],['长综合 · 12分','进一步力学整题',12,'furtherMechanics']],
    furtherStatistics:[['短计算 · 4分','分布、期望、方差',4,'furtherStatistics'],['推断整题 · 8分','检验与估计',8,'furtherStatistics'],['长综合 · 12分','进一步统计整题',12,'furtherStatistics']],
    physics:[['选择题 · 1分','P1 单道 MCQ',1,'scienceMCQ'],['AS 小问 · 3分','定义、解释、图像或计算',3,'scienceAS'],['AS 整题 · 8分','P2 结构问答',8,'scienceAS'],['A2 整题 · 10分','P4 多小问结构题',10,'scienceA2'],['实验操作 · 20分','P3 半份实验卷；含操作时间',20,'sciencePractical'],['实验设计 · 15分','P5 计划、数据、不确定度',15,'sciencePlanning']],
    chemistry:[['选择题 · 1分','P1 单道 MCQ',1,'scienceMCQ'],['AS 小问 · 3分','方程、计量、解释',3,'scienceAS'],['AS 整题 · 8分','P2 结构问答',8,'scienceAS'],['A2 整题 · 10分','P4 机理、平衡、综合',10,'scienceA2'],['实验操作 · 20分','P3 半份实验卷；含操作时间',20,'sciencePractical'],['实验设计 · 15分','P5 计划、分析、评价',15,'sciencePlanning']],
    biology:[['选择题 · 1分','P1 单道 MCQ',1,'scienceMCQ'],['AS 小问 · 3分','定义、过程、结构功能',3,'scienceAS'],['AS 整题 · 8分','P2 结构问答',8,'scienceAS'],['A2 整题 · 10分','P4 遗传、机制、数据联系',10,'scienceA2'],['实验操作 · 20分','P3 半份实验卷；含操作时间',20,'sciencePractical'],['实验设计 · 15分','P5 计划、分析、评价',15,'sciencePlanning']],
    cs:[['理论短答 · 3分','P1/P3 定义、比较、数据表示',3,'csTheory'],['理论解释 · 6分','P1/P3 网络、安全、系统',6,'csTheory'],['代码跟踪 · 5分','P2 trace、逻辑、输出',5,'csAlgorithm'],['伪代码算法 · 10分','P2 算法、数据结构',10,'csAlgorithm'],['上机实现 · 15分','P4 完整代码与测试证据',15,'csPractical']],
    economics:[['AS 选择 · 1分','P1 单道 MCQ',1,'econMCQ'],['A2 选择 · 1分','P3 单道 MCQ',1,'econA2MCQ'],['数据小问 · 4分','P2/P4 数据、图形、解释',4,'economics'],['分析小问 · 8分','分析因果与图形',8,'economics'],['评价小问 · 12分','权衡、结论与评价',12,'economics'],['论述整题 · 20分','完整论述或数据题组',20,'economics']],
    business:[['AS 短答 · 5分','P1 完整短答题',5,'businessAS'],['数据小问 · 8分','P2 应用、分析与计算',8,'businessData'],['AS 论述 · 20分','P1 完整两部分论述',20,'businessAS'],['决策分析 · 12分','P3 案例中的分析评价',12,'businessDecision'],['战略论述 · 20分','P4 一道完整案例论述',20,'businessStrategy']],
    history:[['材料比较 · 15分','P1 两份材料比较',15,'historySource'],['材料评价 · 25分','P1 多来源证据评价',25,'historySource'],['纲要解释 · 10分','P2 两部分题的解释小问',10,'historyEssay'],['纲要论述 · 20分','P2 论述小问',20,'historyEssay'],['深度论述 · 30分','P4 一道完整论述',30,'historyEssay'],['史学解释 · 40分','P3 完整解释题',40,'historySource']],
    geography:[['数据小问 · 4分','图表、地图、解释',4,'geography'],['数据整题 · 10分','P1/P2 数据或 P3/P4 结构题',10,'geography'],['评价论述 · 20分','P3/P4 一道论述',20,'geography'],['结构整题 · 30分','P1/P2 Section B',30,'geography']],
    english:[['阅读写作 · 10分','P1 定向写作小问',10,'englishReading'],['比较分析 · 15分','P1 比较小问',15,'englishReading'],['反思评论 · 10分','P2 写作评论',10,'englishWriting'],['短篇写作 · 15分','P2 定向写作',15,'englishWriting'],['长篇写作 · 25分','P2 连续写作',25,'englishWriting'],['语言分析 · 25分','P1/P3/P4 完整分析或论述',25,'englishReading']]
  };
  const profiles=Object.fromEntries(Object.entries(definitions).map(([key,rows])=>[key,rows.map(([name,description,marks,id])=>[name,description,marks*papers[id].minutes/papers[id].marks])]));
  function family(name){const n=name.toLowerCase();const further=/further|高数|进阶|9231/.test(n);return /mechan|力学/.test(n)?(further?'furtherMechanics':'mechanics'):/stat|统计/.test(n)?(further?'furtherStatistics':'statistics'):further?'further':/math|pure|数学|纯数|9709/.test(n)?'math':/phys|物理|9702/.test(n)?'physics':/computer|computing|\bcs\b|计算机|9618/.test(n)?'cs':/chem|化学|9701/.test(n)?'chemistry':/bio|生物|9700/.test(n)?'biology':/econom|经济|9708/.test(n)?'economics':/business|商科|商业|9609/.test(n)?'business':/hist|历史|9489/.test(n)?'history':/geo|地理|9696/.test(n)?'geography':/english|英语语言|9093/.test(n)?'english':'unknown';}
  function presets(subject){const key=family(subject);return (definitions[key]||[]).map(([name,description,marks,paperId],i)=>{const paper=papers[paperId],pace=paper.minutes/paper.marks;const url=/chem/i.test(key)?source('664563-2025-2027'):/bio/i.test(key)?source('664560-2025-2027'):paper.url;return {id:'alevel-'+key+'-'+i,name,description:description+' · '+paper.label+' · 卷面平均配时',marks,paperId,minutesPerMark:pace,source:url,seconds:{exam:Math.round(marks*pace*60),normal:Math.round(marks*pace*1.2*60),relaxed:Math.round(marks*pace*1.5*60)}};});}
  function upgradeConfig(value){const config=structuredClone(value);let changed=false;for(const [name,list] of Object.entries(config.subjects)){let matched=0;const keep=list.filter(t=>{const old=Object.entries(legacyProfiles).some(([key,rows])=>rows.some(([title,description,minutes],i)=>t.id===key+'-'+i&&t.name===title&&t.description===description&&modes.every(mode=>t.seconds[mode]===Math.round(minutes*(mode==='exam'?1:mode==='normal'?1.2:1.5)*60))));if(old)matched++;return !old;});if(matched){changed=true;const defaults=presets(name);config.subjects[name]=[...defaults.filter(t=>!keep.some(k=>k.id===t.id)),...keep];if(!config.subjects[name].length)delete config.subjects[name];}}return {config,changed};}
  function elapsed(q,now){return q.elapsedMs+(q.startedAt===null?0:Math.max(0,now-q.startedAt));}
  function settle(s,now){const copy=structuredClone(s);const q=copy.questions[copy.index];if(q.startedAt!==null){q.elapsedMs=elapsed(q,now);q.startedAt=now;}copy.updatedAt=now;return copy;}
  function toggle(s,now){const copy=settle(s,now),q=copy.questions[copy.index];q.startedAt=q.startedAt===null?now:null;return copy;}
  function switchQuestion(s,index,now){const copy=settle(s,now),q=copy.questions[copy.index],running=q.startedAt!==null;q.startedAt=null;copy.index=index;copy.questions[index].startedAt=running?now:null;return copy;}
  function question(index,type,mode){return {id:crypto.randomUUID(),name:'第 '+(index+1)+' 题',typeId:type.id,typeName:type.name,limitSeconds:type.seconds[mode],elapsedMs:0,startedAt:null,result:'pending',blocked:false,node:'',cause:'',retest:''};}
  function status(q,now){if(q.result==='pending')return 'pending';if(q.result!=='correct')return 'red';return elapsed(q,now)>q.limitSeconds*1000?'yellow':'green';}
  function color(q,now,thresholds={green:30,red:10}){const limit=q.limitSeconds*1000,remain=limit-elapsed(q,now);return remain<0?'overtime':remain*100<=limit*thresholds.red?'red':remain*100<=limit*thresholds.green?'yellow':'green';}
  function report(s,now){const questions=s.questions.filter(q=>elapsed(q,now)>0||q.result!=='pending');const counts={green:0,yellow:0,red:0,pending:0};questions.forEach(q=>counts[status(q,now)]++);const groups={};for(const q of questions){const g=groups[q.typeName]??{name:q.typeName,count:0,slow:0,failed:0};g.count++;g.slow+=Number(elapsed(q,now)>q.limitSeconds*1000);g.failed+=Number(status(q,now)==='red');groups[q.typeName]=g;}return {questions,counts,totalMs:s.questions.reduce((n,q)=>n+elapsed(q,now),0),weaknesses:Object.values(groups).filter(g=>g.slow||g.failed).sort((a,b)=>(b.failed+b.slow)-(a.failed+a.slow))};}
  root.PracticeEngine={modes,profiles,papers,presetRevision,presets,family,upgradeConfig,elapsed,settle,toggle,switchQuestion,question,status,color,report};
})(globalThis);
