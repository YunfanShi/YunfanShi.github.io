(function(root){
  'use strict';
  const modes=['relaxed','normal','exam'];
  const profiles={
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
  function family(name){const n=name.toLowerCase();return /ielts/.test(n)?'ielts':/mechan|力学/.test(n)?'mechanics':/stat|统计/.test(n)?'statistics':/math|数学|纯数/.test(n)?'math':/phys|物理/.test(n)?'physics':/computer|computing|\bcs\b|计算机/.test(n)?'cs':/chem|bio|化学|生物/.test(n)?'science':/hist|geo|english|econom|business|文学|历史|地理|经济|语文/.test(n)?'humanities':'general';}
  function presets(subject){return profiles[family(subject)].map(([name,description,exam],i)=>({id:family(subject)+'-'+i,name,description,seconds:{exam:exam*60,normal:Math.round(exam*1.2*60),relaxed:Math.round(exam*1.5*60)}}));}
  function elapsed(q,now){return q.elapsedMs+(q.startedAt===null?0:Math.max(0,now-q.startedAt));}
  function settle(s,now){const copy=structuredClone(s);const q=copy.questions[copy.index];if(q.startedAt!==null){q.elapsedMs=elapsed(q,now);q.startedAt=now;}copy.updatedAt=now;return copy;}
  function toggle(s,now){const copy=settle(s,now),q=copy.questions[copy.index];q.startedAt=q.startedAt===null?now:null;return copy;}
  function switchQuestion(s,index,now){const copy=settle(s,now),q=copy.questions[copy.index],running=q.startedAt!==null;q.startedAt=null;copy.index=index;copy.questions[index].startedAt=running?now:null;return copy;}
  function question(index,type,mode){return {id:crypto.randomUUID(),name:'第 '+(index+1)+' 题',typeId:type.id,typeName:type.name,limitSeconds:type.seconds[mode],elapsedMs:0,startedAt:null,result:'pending',blocked:false,node:'',cause:'',retest:''};}
  function status(q,now){if(q.result==='pending')return 'pending';if(q.result!=='correct')return 'red';return elapsed(q,now)>q.limitSeconds*1000?'yellow':'green';}
  function color(q,now,thresholds={green:30,red:10}){const limit=q.limitSeconds*1000,remain=limit-elapsed(q,now);return remain<0?'overtime':remain*100<=limit*thresholds.red?'red':remain*100<=limit*thresholds.green?'yellow':'green';}
  function report(s,now){const questions=s.questions.filter(q=>elapsed(q,now)>0||q.result!=='pending');const counts={green:0,yellow:0,red:0,pending:0};questions.forEach(q=>counts[status(q,now)]++);const groups={};for(const q of questions){const g=groups[q.typeName]??{name:q.typeName,count:0,slow:0,failed:0};g.count++;g.slow+=Number(elapsed(q,now)>q.limitSeconds*1000);g.failed+=Number(status(q,now)==='red');groups[q.typeName]=g;}return {questions,counts,totalMs:s.questions.reduce((n,q)=>n+elapsed(q,now),0),weaknesses:Object.values(groups).filter(g=>g.slow||g.failed).sort((a,b)=>(b.failed+b.slow)-(a.failed+a.slow))};}
  root.PracticeEngine={modes,profiles,presets,family,elapsed,settle,toggle,switchQuestion,question,status,color,report};
})(globalThis);
