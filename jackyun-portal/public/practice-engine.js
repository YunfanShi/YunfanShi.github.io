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
  const specialties={
    math:[['函数与图像','复合、反函数、变换与定义域',6,'math'],['三角方程与恒等式','弧度、解方程与恒等变形',6,'math'],['数列与二项展开','递推、求和、展开与近似',6,'math'],['指数与对数','模型、方程与线性化',6,'math'],['微分与最优化','导数、切线、变化率与极值',8,'math'],['积分与微分方程','面积、换元、分部积分与可分离方程',8,'math'],['坐标几何与向量','直线、圆、空间位置与夹角',8,'math'],['数值方法与证明','迭代、根的定位、反证与演绎',6,'math']],
    mechanics:[['运动学与图像','匀变速、速度时间图与微积分',8,'mechanics'],['牛顿定律与连接体','摩擦、斜面、滑轮与约束',8,'mechanics'],['平衡与力矩','共点力、杆与支点',8,'mechanics'],['动量与碰撞','冲量、恢复系数与多阶段碰撞',8,'mechanics'],['功、能与功率','能量守恒与阻力',8,'mechanics'],['抛体运动','二维运动与轨迹',8,'mechanics'],['质心与稳定性','复合体、悬挂与倾覆',8,'mechanics'],['圆周、简谐与弹性','M3 圆周运动、振动、弹簧与弹性绳',10,'mechanics']],
    statistics:[['数据、相关与回归','摘要、编码、离散程度与解释',6,'statistics'],['排列组合与条件概率','计数、树图、独立性与贝叶斯',6,'statistics'],['随机变量与分布','期望、方差、二项与泊松',8,'statistics'],['正态与连续分布','标准化、密度、分布函数与近似',8,'statistics'],['抽样与估计','抽样分布、无偏估计与置信区间',8,'statistics'],['假设检验','单尾双尾、显著性与结论',8,'statistics'],['卡方与相关检验','拟合优度、独立性与相关',8,'statistics'],['双样本推断','S3 均值、比例与差值推断',10,'statistics']],
    further:[['复数与矩阵','极形式、根、变换与逆矩阵',8,'further'],['级数与归纳证明','递推、求和与数学归纳',8,'further'],['微分方程与极坐标','一阶二阶方程、极坐标曲线',10,'further'],['双曲函数与进一步积分','反函数、代换与递推积分',10,'further'],['向量与几何','平面、直线、距离与交点',10,'further']],
    physics:[['定义与解释','精确定义、因果链与物理过程',4,'scienceAS'],['图像与数据计算','斜率、面积、单位、估计与规律',6,'scienceAS'],['力学与材料','运动、受力、能量、弹性与流体',8,'scienceAS'],['电路与电磁','电路、电场、磁场与感应',10,'scienceA2'],['波与光学','干涉、衍射、驻波与多普勒',8,'scienceAS'],['热学与气体','气体、热力学与动理论',10,'scienceA2'],['引力、振动与场','轨道、势能、简谐与场的比较',10,'scienceA2'],['量子、核与医学','光子、衰变、成像与粒子',10,'scienceA2'],['天文与宇宙','距离、红移与宇宙模型',8,'scienceA2'],['不确定度与实验评价','误差传播、作图、改进与局限',6,'sciencePlanning']],
    cs:[['数据表示与编码','进制、补码、浮点、图像、声音与压缩',6,'csTheory'],['逻辑电路与布尔代数','真值表、逻辑门与化简',6,'csTheory'],['硬件、处理器与操作系统','体系结构、存储、调度与虚拟内存',6,'csTheory'],['网络、通信与安全','协议、拓扑、路由、加密与风险',6,'csTheory'],['数据库与 SQL','关系建模、规范化、查询与事务',8,'csTheory'],['软件开发与测试','生命周期、翻译、测试与调试',6,'csTheory'],['数据结构与算法','数组、链表、栈、队列、树、查找与排序',10,'csAlgorithm'],['递归与面向对象','递归跟踪、类、继承与多态',10,'csPractical'],['文件处理与异常','文本二进制文件、输入校验与异常',10,'csPractical'],['完整程序与测试证据','实现、边界测试与结果验证',20,'csPractical'],['人工智能与伦理','机器学习、自动化、隐私与社会影响',6,'csTheory']],
    chemistry:[['计量与物理化学','物质的量、热化学、速率与平衡',8,'scienceAS'],['无机与周期性','结构、键合、周期与过渡金属',8,'scienceAS'],['有机机理与合成','反应机理、路线设计与官能团',10,'scienceA2'],['分析与谱图','质谱、红外、NMR 与鉴定',10,'scienceA2'],['电化学与离子平衡','电极电势、酸碱与溶度积',10,'scienceA2']],
    biology:[['细胞、分子与酶','结构功能、膜运输与酶',8,'scienceAS'],['运输、免疫与交换','植物动物运输、病原与气体交换',8,'scienceAS'],['遗传与生物技术','遗传计算、调控、测序与工程',10,'scienceA2'],['能量与稳态','光合、呼吸、神经激素与稳态',10,'scienceA2'],['生态、进化与数据','种群、选择、生物多样性与统计',10,'scienceA2']],
    economics:[['图形与计算','弹性、成本、市场和宏观图形',8,'economics'],['微观政策评价','市场失灵、干预、企业与效率',12,'economics'],['宏观与国际评价','增长、通胀、贸易、汇率与发展',12,'economics']],
    business:[['财务与定量分析','比率、投资评价、预测与决策',12,'businessDecision'],['市场与运营案例','营销、生产、质量与供应链',12,'businessDecision'],['组织与人力资源','管理、激励、组织与变革',12,'businessDecision']],
    history:[['来源可靠性与效用','作者、背景、目的、互证与局限',25,'historySource'],['因果与重要性评价','解释原因、结果与相对作用',20,'historyEssay']],
    geography:[['自然过程与案例','水文、地貌、气候、风险与环境',20,'geography'],['人文与发展案例','人口、迁移、城市、全球化与发展',20,'geography']],
    english:[['文本形式与语域','受众、目的、结构与语言选择',25,'englishReading'],['语言习得与变化','理论、数据、全球英语与演变',25,'englishReading']]
  };
  specialties.furtherMechanics=specialties.mechanics.map(([n,d,m])=>[n,d,m,'furtherMechanics']);
  specialties.furtherStatistics=specialties.statistics.map(([n,d,m])=>[n,d,m,'furtherStatistics']);
  const familyLabels={math:'纯数 · Edexcel IAL',mechanics:'力学 · Edexcel IAL',statistics:'统计 · Edexcel IAL',further:'进一步纯数 · Edexcel IAL',furtherMechanics:'进一步力学 · Edexcel IAL',furtherStatistics:'进一步统计 · Edexcel IAL',physics:'物理 · CAIE 9702',cs:'计算机 · CAIE 9618',chemistry:'化学 · CAIE 9701',biology:'生物 · CAIE 9700',economics:'经济 · CAIE 9708',business:'商业 · CAIE 9609',history:'历史 · CAIE 9489',geography:'地理 · CAIE 9696',english:'英语语言 · CAIE 9093',custom:'自定义考试配置'};
  const profiles=Object.fromEntries(Object.entries(definitions).map(([key,rows])=>[key,rows.map(([name,description,marks,id])=>[name,description,marks*papers[id].minutes/papers[id].marks])]));
  function family(name){const n=name.toLowerCase();const further=/further|高数|进阶|9231/.test(n);return /mechan|力学/.test(n)?(further?'furtherMechanics':'mechanics'):/stat|统计/.test(n)?(further?'furtherStatistics':'statistics'):further?'further':/math|pure|数学|纯数|9709/.test(n)?'math':/phys|物理|9702/.test(n)?'physics':/computer|computing|\bcs\b|计算机|9618/.test(n)?'cs':/chem|化学|9701/.test(n)?'chemistry':/bio|生物|9700/.test(n)?'biology':/econom|经济|9708/.test(n)?'economics':/business|商科|商业|9609/.test(n)?'business':/hist|历史|9489/.test(n)?'history':/geo|地理|9696/.test(n)?'geography':/english|英语语言|9093/.test(n)?'english':'unknown';}
  function inferCourse(course){const named=family(course.name);if(named!=='unknown')return named;const short=family(course.shortName||'');if(short!=='unknown')return short;const n=(course.name+' '+(course.shortName||'')).trim();return /\b(?:M[1-3]|WME0[1-3])\b/i.test(n)?'mechanics':/\b(?:S[1-3]|WST0[1-3])\b/i.test(n)?'statistics':/\b(?:FP[1-3]|WFM0[1-3])\b/i.test(n)?'further':/\b(?:P[1-4]|WMA1[1-4])\b/i.test(n)?'math':'unknown';}
  function presets(subject){const key=Object.hasOwn(familyLabels,subject)?subject:family(subject);if(key==='custom')return [{id:'custom-basic-choice',name:'基础选择题',description:'请按你的考试卷别调整时间',seconds:{exam:120,normal:144,relaxed:180}},{id:'custom-basic-long',name:'基础大题',description:'请按实际分值与卷面配时调整',seconds:{exam:600,normal:720,relaxed:900}}];const original=definitions[key]||[];if(!original.length)return [];const choice=original.find(row=>/选择/.test(row[0]));const long=original.find(row=>/整题/.test(row[0]))||original.at(-1);const bases=[['基础选择题',choice?'单道选择题':'自测选择；本卷无独立选择题，以 1 分卷面平均节奏估算',1,choice?.[3]||original[0][3]],['基础大题',long[1],long[2],long[3]]];const rows=[...original,...(specialties[key]||[]),...bases];return rows.map(([name,description,marks,paperId],i)=>{const paper=papers[paperId],pace=paper.minutes/paper.marks;const url=/chem/i.test(key)?source('664563-2025-2027'):/bio/i.test(key)?source('664560-2025-2027'):paper.url;const base=i>=rows.length-2;return {id:base?'alevel-'+key+'-basic-'+(i===rows.length-2?'choice':'long'):'alevel-'+key+'-'+i,name,description:description+' · '+paper.label+' · 卷面平均配时',marks,paperId,minutesPerMark:pace,source:url,seconds:{exam:Math.round(marks*pace*60),normal:Math.round(marks*pace*1.2*60),relaxed:Math.round(marks*pace*1.5*60)}};});}
  function courseKey(courseId,key){return courseId+'|'+key;}
  function courseTypes(config,course){const binding=config.courseBindings?.[course.id];if(!binding)return [];const key=courseKey(course.id,binding.family),defaults=presets(binding.family),stored=config.courseTypes?.[key]||config.subjects?.[course.name]||[];return [...defaults.map(t=>stored.find(s=>s.id===t.id)||t),...stored.filter(t=>!defaults.some(d=>d.id===t.id))];}
  function bindCourses(value,courses){const config=structuredClone(value);config.courseBindings??={};config.courseTypes??={};let changed=false;for(const course of courses){let binding=config.courseBindings[course.id];if(!binding){const key=inferCourse(course);if(key==='unknown')continue;binding=config.courseBindings[course.id]={family:key,name:course.name,source:'auto'};changed=true;}const key=courseKey(course.id,binding.family);if(!config.courseTypes[key]){config.courseTypes[key]=courseTypes(config,{...course,name:binding.name});changed=true;}if(binding.name!==course.name){binding.name=course.name;changed=true;}}return {config,changed};}
  function upgradeConfig(value){const config=structuredClone(value);let changed=false;for(const [name,list] of Object.entries(config.subjects)){let matched=0;const keep=list.filter(t=>{const old=Object.entries(legacyProfiles).some(([key,rows])=>rows.some(([title,description,minutes],i)=>t.id===key+'-'+i&&t.name===title&&t.description===description&&modes.every(mode=>t.seconds[mode]===Math.round(minutes*(mode==='exam'?1:mode==='normal'?1.2:1.5)*60))));if(old)matched++;return !old;});if(matched){changed=true;const defaults=presets(name);config.subjects[name]=[...defaults.filter(t=>!keep.some(k=>k.id===t.id)),...keep];if(!config.subjects[name].length)delete config.subjects[name];}}return {config,changed};}
  function elapsed(q,now){return q.elapsedMs+(q.startedAt===null?0:Math.max(0,now-q.startedAt));}
  function settle(s,now){const copy=structuredClone(s);const q=copy.questions[copy.index];if(q.startedAt!==null){q.elapsedMs=elapsed(q,now);q.startedAt=now;}copy.updatedAt=now;return copy;}
  function toggle(s,now){const copy=settle(s,now),q=copy.questions[copy.index];q.startedAt=q.startedAt===null?now:null;return copy;}
  function switchQuestion(s,index,now){const copy=settle(s,now),q=copy.questions[copy.index],running=q.startedAt!==null;q.startedAt=null;copy.index=index;copy.questions[index].startedAt=running?now:null;return copy;}
  function question(index,type,mode){return {id:crypto.randomUUID(),name:'第 '+(index+1)+' 题',typeId:type.id,typeName:type.name,limitSeconds:type.seconds[mode],elapsedMs:0,startedAt:null,result:'pending',blocked:false,node:'',cause:'',retest:''};}
  function status(q,now){if(q.firstAttempt)q={...q,...q.firstAttempt,startedAt:null};if(q.result==='pending')return 'pending';if(q.result!=='correct'||q.blocked)return 'red';return elapsed(q,now)>q.limitSeconds*1000?'yellow':'green';}
  function color(q,now,thresholds={green:30,red:10}){const limit=q.limitSeconds*1000,remain=limit-elapsed(q,now);return remain<0?'overtime':remain*100<=limit*thresholds.red?'red':remain*100<=limit*thresholds.green?'yellow':'green';}
  function report(s,now){const questions=s.questions.filter(q=>elapsed(q,now)>0||q.result!=='pending');const counts={green:0,yellow:0,red:0,pending:0};questions.forEach(q=>counts[status(q,now)]++);const groups={};for(const original of questions){const q=original.firstAttempt?{...original,...original.firstAttempt,startedAt:null}:original;const g=groups[q.typeName]??{name:q.typeName,count:0,slow:0,failed:0};g.count++;g.slow+=Number(elapsed(q,now)>q.limitSeconds*1000);g.failed+=Number(status(q,now)==='red');groups[q.typeName]=g;}return {questions,counts,totalMs:s.questions.reduce((n,q)=>n+elapsed(q,now),0),weaknesses:Object.values(groups).filter(g=>g.slow||g.failed).sort((a,b)=>(b.failed+b.slow)-(a.failed+a.slow))};}
  root.PracticeEngine={modes,profiles,papers,presetRevision,presets,family,familyLabels,inferCourse,courseKey,courseTypes,bindCourses,upgradeConfig,elapsed,settle,toggle,switchQuestion,question,status,color,report};
})(globalThis);
