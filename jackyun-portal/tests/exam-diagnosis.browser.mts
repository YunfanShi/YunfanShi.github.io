import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createEmptyScheduleState } from '../src/lib/learning/schedule-control.ts';
import { applyPracticeSession, type PracticeSession } from '../src/lib/learning/practice-timer.ts';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const url=process.env.JACKYUN_TEST_URL || 'http://localhost:3123';
const out='artifacts/verification/exam-diagnosis';await mkdir(out,{recursive:true});
const results:unknown[]=[];
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
  for(const width of [390,1440]) {
    let seed=createEmptyScheduleState();seed.settings.tutorialSeenVersion=1;
    const session:PracticeSession={id:'transfer',date:'2026-10-15',subject:'Pure Math',source:'B',independent:true,scope:'New independent graph',mode:'exam',index:0,finished:true,updatedAt:1,questions:[{id:'new-q',name:'New graph Q3',typeId:'math',typeName:'Graph Sketching',limitSeconds:720,elapsedMs:600000,startedAt:null,result:'correct',blocked:false,node:'Graph Sketching',cause:'',retest:''}]};
    seed=applyPracticeSession(seed,session);
    const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Shanghai'});
    await context.addInitScript(seed=>{if(!localStorage.getItem('jackyun_schedule_control_v1'))localStorage.setItem('jackyun_schedule_control_v1',JSON.stringify(seed));},seed);
    const page=await context.newPage();const errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
    await page.goto(url+'/schedule');const panel=page.getByRole('region',{name:'考试诊断与新题验证'});await panel.waitFor({timeout:60000});
    await panel.getByRole('button',{name:'新建考试诊断',exact:true}).click();
    let form=panel.getByRole('form',{name:'考试诊断表单'});
    await form.getByLabel('考试名称',{exact:true}).fill('First Monthly Test');await form.getByLabel('题号或 Question Reference').fill('Q10');
    await form.getByLabel('Knowledge Node',{exact:true}).fill('Graph Sketching');await form.getByLabel('已确认的错误事实').fill('Find f(x) was interpreted as a tangent equation');
    await form.getByLabel('Interpretation 审题',{exact:true}).check();await form.getByLabel('Selection 方法选择',{exact:true}).check();await form.getByLabel('下一步训练目标').fill('Choose integration or tangent based on the requested output');
    await page.screenshot({path:`${out}/math-form-${width}.png`,fullPage:false});await form.getByRole('button',{name:'保存诊断',exact:true}).click();await form.waitFor({state:'hidden'});
    const math=panel.locator('article').filter({has:page.getByRole('heading',{name:'Pure Math · First Monthly Test · Q10',exact:true})});
    await math.getByText(/待观察/).waitFor();await math.getByRole('button',{name:'记录 Repair 解释'}).click();
    let eventForm=panel.getByRole('form',{name:'修复与新题验证表单'});await eventForm.getByRole('textbox').fill('Explain the requested function and why integration reverses differentiation; retain original mistake.');await eventForm.getByRole('button',{name:'保存修复说明'}).click();await eventForm.waitFor({state:'hidden'});
    await math.getByText(/已修复，待新题验证/).waitFor();await math.getByRole('button',{name:'关联新题验证'}).click();
    eventForm=panel.getByRole('form',{name:'修复与新题验证表单'});await eventForm.getByLabel('另一道独立新题').selectOption('transfer:new-q');await eventForm.getByRole('textbox').fill('Different unseen graph independently completed without assistance and within 12 minutes');await eventForm.getByRole('button',{name:'保存新题验证'}).click();await eventForm.waitFor({state:'hidden'});await math.getByText(/✓ 新题验证通过/).first().waitFor();
    await panel.getByRole('button',{name:'新建考试诊断',exact:true}).click();form=panel.getByRole('form',{name:'考试诊断表单'});await form.getByLabel('科目',{exact:true}).selectOption('Computer Science');await form.getByLabel('考试名称',{exact:true}).fill('CAIE 9618 practice');await form.getByLabel('题号或 Question Reference').fill('Explain Q6');await form.getByLabel('已确认的错误事实').fill('Necessary condition was omitted');await form.getByLabel('下一步训练目标').fill('Explain cause and effect in a new scenario');
    await form.getByText('CS 原始作答与答题能力',{exact:true}).click();await form.getByLabel('My Original Answer').fill('This is my original answer with equivalent wording.');await form.getByLabel('Command Word',{exact:true}).fill('Explain');await form.getByLabel('答题能力',{exact:true}).selectOption('Explain Cause and Effect');await form.getByRole('button',{name:'保存诊断',exact:true}).click();await form.waitFor({state:'hidden'});
    const cs=panel.locator('article').filter({has:page.getByRole('heading',{name:'Computer Science · CAIE 9618 practice · Explain Q6',exact:true})});await cs.getByRole('button',{name:'人工 MS 对照或修正'}).click();
    const ms=panel.getByRole('form',{name:'人工评分点复核'});await ms.getByLabel('本次实际分数').fill('4');await ms.getByLabel('本题满分').fill('6');await ms.getByLabel('MS 来源或试卷引用').fill('Synthetic test points supplied for UI testing, not an official MS');await ms.getByLabel('分值规则与人工修正理由').fill('Equivalent semantic expression accepted, maximum six marks');await ms.getByRole('button',{name:'添加评分点'}).click();
    await ms.getByLabel('官方评分点').fill('Test necessary condition');await ms.getByLabel('点值',{exact:true}).fill('2');await ms.getByLabel('人工判断').selectOption('missing');await ms.getByLabel('作答依据或等效表达').fill('Not covered in the original answer');await ms.getByLabel('失分原因').selectOption('expression');await ms.getByRole('button',{name:'保存人工复核'}).click();await ms.waitFor({state:'hidden'});
    await cs.getByText('实际得分：4/6',{exact:true}).waitFor();await cs.getByText('人工 MS 对照与复核历史',{exact:true}).click();await cs.getByText(/○ 遗漏/).waitFor();
    await cs.getByRole('button',{name:'完善信息'}).click();form=panel.getByRole('form',{name:'考试诊断表单'});await form.getByText('CS 原始作答与答题能力',{exact:true}).click();assert.equal(await form.getByLabel('My Original Answer').getAttribute('readonly'),'');await form.getByRole('button',{name:'取消',exact:true}).click();
    await context.setOffline(true);await cs.getByRole('button',{name:'记录 Repair 解释'}).click();eventForm=panel.getByRole('form',{name:'修复与新题验证表单'});await eventForm.getByRole('textbox').fill('Offline repair explanation retains original answer and MS');await eventForm.getByRole('button',{name:'保存修复说明'}).click();await eventForm.waitFor({state:'hidden'});
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('jackyun_schedule_control_v1')!).examDiagnoses.some((d:{subject:string;events:unknown[]})=>d.subject==='Computer Science'&&d.events.length===1));await context.setOffline(false);await page.reload();await cs.getByText(/Offline repair explanation/).waitFor({timeout:30000});await math.getByText(/✓ 新题验证通过/).first().waitFor();
    const other=await context.newPage();await other.goto(url+'/schedule');const otherPanel=other.getByRole('region',{name:'考试诊断与新题验证'});await otherPanel.waitFor({timeout:30000});await cs.getByRole('button',{name:'记录 Repair 解释'}).click();eventForm=panel.getByRole('form',{name:'修复与新题验证表单'});await eventForm.getByRole('textbox').fill('Second tab receives appended repair');await eventForm.getByRole('button',{name:'保存修复说明'}).click();await eventForm.waitFor({state:'hidden'});await otherPanel.getByText(/Second tab receives appended repair/).waitFor({timeout:30000});
    await panel.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/diagnosis-${width}.png`,fullPage:false});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
    await panel.getByLabel('答题能力筛选').selectOption('Explain Cause and Effect');assert.equal(await math.isVisible(),false);assert.ok(await panel.getByRole('link',{name:'开始 Explain Cause and Effect 新题训练 →'}).isVisible());await panel.getByLabel('答题能力筛选').selectOption('');
    const timed=page.getByRole('region',{name:'练习记录与本周指标',exact:true});await timed.getByRole('button',{name:'A 熟题修复',exact:true}).click();assert.ok((await timed.locator('[data-practice-metrics]').textContent())?.includes('0 题'));await timed.getByRole('button',{name:'C 完整模拟',exact:true}).click();assert.ok((await timed.locator('[data-practice-metrics]').textContent())?.includes('0 题'));await timed.getByRole('button',{name:'独立新题',exact:true}).click();assert.ok((await timed.locator('[data-practice-metrics]').textContent())?.includes('1 题'));
    const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('jackyun_schedule_control_v1')!));assert.equal(data.examDiagnoses.length,2);assert.equal(data.examDiagnoses.find((d:{subject:string})=>d.subject==='Computer Science').originalAnswer,'This is my original answer with equivalent wording.');
    results.push({width,mathTransfer:'verified',csScore:'4/6',originalAnswer:'retained',offlineSave:true,reload:true,multipleTabs:true,pageErrors:errors});await context.close();
  }
} finally {await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));
