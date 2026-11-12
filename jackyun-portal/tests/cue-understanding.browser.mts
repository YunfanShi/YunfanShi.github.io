import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createEmptyScheduleState,type StudyCue} from '../src/lib/learning/schedule-control.ts';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.JACKYUN_TEST_URL??'http://127.0.0.1:3239';
const out=process.env.JACKYUN_SCREENSHOT_DIR??'artifacts/verification/cue-understanding';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.JACKYUN_BROWSER_CHANNEL??'chrome'});
const results:unknown[]=[];
try {
 for (const width of [1440,390]) {
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width===390,timezoneId:'Asia/Shanghai'});
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const openManager=async()=>{await page.getByRole('button',{name:width<1024?'管理 CUE':'Cue 管理',exact:true}).click();};
  try {
  await page.goto(base+'/schedule?view=cue');await page.getByRole('region',{name:'CUE 学习预览'}).waitFor({timeout:60000});
  const seed=createEmptyScheduleState();seed.settings.tutorialSeenVersion=1;
  seed.learningCatalog=[{id:'physics',name:'Physics',units:[{name:'Forces',subsections:[]}],materialProgress:{}}];
  const now=new Date().toISOString();seed.cues=[{id:'deep-test',subjectId:'physics',subjectName:'Physics',unit:'Forces',subsection:'',prompt:'Define resultant force',answer:'Vector sum of forces',type:'definition',markingPoints:[],status:'partial',createdAt:now,updatedAt:now,intervalDays:0,easeFactor:2.5,streak:0} as StudyCue];
  await page.evaluate(async value=>{
   const saved=new Promise<void>(resolve=>{const handler=(e:Event)=>{if((e as CustomEvent).detail.state==='saved'){window.removeEventListener('jackyun-local-durability',handler);resolve();}};window.addEventListener('jackyun-local-durability',handler);});
   localStorage.setItem('jackyun_schedule_control_v1',JSON.stringify(value));localStorage.setItem('jackyun_settings_learning_preferences',JSON.stringify({cueGameEnabled:false,cueShuffle:false}));await saved;
  },seed);
  await page.reload();await openManager();
  const manager=page.getByRole('dialog',{name:'知识 CUE 管理'});await manager.getByRole('button',{name:'编辑 Cue',exact:true}).click();
  { const details=manager.locator('details').filter({hasText:'Deep Understanding · 只补实际理解漏洞'});if(await details.getAttribute('open')===null)await details.locator('summary').click(); }
  await manager.getByLabel('理解漏洞',{exact:true}).fill('Pythagoras was used for non-perpendicular vectors');
  await manager.getByLabel('Conditions 何时适用 问题',{exact:true}).fill('When can Pythagoras combine force components?');
  await manager.getByLabel('Conditions 何时适用 参考解释',{exact:true}).fill('DEEP_REFERENCE_ONLY when the components are perpendicular.');
  await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('jackyun_cue_manager_editor_draft_v1')??'{}').deepUnderstanding?.conditions?.answer?.startsWith('DEEP_REFERENCE_ONLY'));
  await page.reload();await openManager();
  { const details=manager.locator('details').filter({hasText:'Deep Understanding · 只补实际理解漏洞'});if(await details.getAttribute('open')===null)await details.locator('summary').click(); }
  assert.equal(await manager.getByLabel('Conditions 何时适用 参考解释',{exact:true}).inputValue(),'DEEP_REFERENCE_ONLY when the components are perpendicular.');
  await manager.getByRole('button',{name:'保存修改',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('jackyun_schedule_control_v1')??'{}').cues?.[0]?.deepUnderstanding?.conditions?.answer?.startsWith('DEEP_REFERENCE_ONLY'));
  await manager.getByRole('button',{name:'关闭',exact:true}).click();
  await page.reload();const preview=page.getByRole('region',{name:'CUE 学习预览'});await preview.getByRole('button',{name:'开始学习',exact:true}).click();
  const session=page.getByRole('dialog').filter({has:page.locator('[data-cue-study-page]')});const training=session.locator('[data-cue-understanding]');
  await training.locator('summary').click();
  assert.equal(await training.locator('[data-deep-cue-answer]').count(),0);
  const reveal=training.getByRole('button',{name:'核对Conditions 何时适用参考解释',exact:true});assert.equal(await reveal.isDisabled(),true);
  await training.getByLabel('Conditions 何时适用 我的回答',{exact:true}).fill('The two components must be perpendicular.');await reveal.click();
  await training.getByText('DEEP_REFERENCE_ONLY when the components are perpendicular.',{exact:true}).waitFor();
  await training.getByRole('button',{name:'隐藏Conditions 何时适用参考解释',exact:true}).click();
  await training.getByLabel('本次主要卡点',{exact:true}).selectOption('conditions');await training.getByLabel('本次使用独立训练规则',{exact:true}).check();
  await training.getByLabel('已知 所求 已有尝试',{exact:true}).fill('Known vectors, asked for resultant. I drew the components and need to check the angle.');
  await training.getByRole('button',{name:'生成本级 AI 指令',exact:true}).click();
  assert.match(await training.getByLabel('复制给 AI 的训练指令').inputValue(),/最小必要提示/);
  assert.match(await training.innerText(),/实际使用 0 次/);
  await training.getByRole('button',{name:'记录实际已用提示并隐藏指令',exact:true}).click();
  assert.equal(await training.getByLabel('复制给 AI 的训练指令').count(),0);
  await page.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('jackyun_schedule_control_v1')??'{}').cueStudyDrafts??{}).some((d:unknown)=>(d as {trainingEvidence?:Record<string,{hints?:unknown[]}>}).trainingEvidence?.['deep-test']?.hints?.length===1));
  await page.reload();await page.getByRole('region',{name:'CUE 学习预览'}).getByRole('button',{name:'继续学习',exact:true}).click();await training.locator('summary').click();
  assert.equal(await training.getByLabel('Conditions 何时适用 我的回答',{exact:true}).inputValue(),'The two components must be perpendicular.');assert.match(await training.innerText(),/实际使用 1 次/);assert.equal(await training.locator('[data-deep-cue-answer]').count(),0);
  await training.screenshot({path:`${out}/deep-cue-${width}.png`});
  assert.deepEqual(errors,[]);results.push({width,editorDraftRestored:true,savedContentRestored:true,answerHiddenUntilAttempt:true,promptGenerationNotCounted:true,actualHintRecorded:true,studyDraftRestored:true,errors});await context.close();
  } catch(error) {await page.screenshot({path:`${out}/failure-${width}.png`,fullPage:true});await writeFile(`${out}/failure-${width}.txt`,await page.locator('body').innerText());throw error;}
 }
} finally {await browser.close();await writeFile(out+'/results.json',JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));
