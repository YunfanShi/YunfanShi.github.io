import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createEmptyScheduleState, type StudyCue} from '../src/lib/learning/schedule-control.ts';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.JACKYUN_TEST_URL || 'http://localhost:3239';
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
 for (const scenario of Array.from({length:Number(process.env.JACKYUN_SAVE_REGRESSION_RUNS || 1)},()=>[{width:1440,trigger:'questions'},{width:820,trigger:'time'}]).flat()) {
 const context=await browser.newContext({viewport:{width:scenario.width,height:1000},hasTouch:scenario.width<1024,timezoneId:'Asia/Shanghai'});
 const page=await context.newPage();const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/schedule?view=cue');
 await page.getByRole('region',{name:'CUE 学习预览'}).waitFor({timeout:60000});
 const seed=createEmptyScheduleState();seed.settings.tutorialSeenVersion=1;
 const now=new Date().toISOString();
 seed.cues=Array.from({length:120},(_,i)=>({id:`save-cue-${i}`,subjectId:i<100?'math':'english',subjectName:i<100?'数学':'英语',unit:'函数',subsection:'',type:'definition',prompt:`保存测试题 ${i+1}`,answer:`答案 ${i+1}`,examStatus:'tested',examHistory:'CAIE 9702 · 2025 · Paper 22 · Q3(b)',sourceKind:'book',source:'Cambridge Physics · 3rd edition',sourceLocation:`P${i+1} Q2`,sourceUrl:'https://example.com/book',markingPoints:[],intervalDays:0,easeFactor:2.5,streak:0,createdAt:now,updatedAt:now,status:'unclear'} as StudyCue));
 await page.evaluate(async value=>{
  const saved=new Promise<void>(resolve=>{const listener=(e:Event)=>{if((e as CustomEvent).detail.state==='saved'){window.removeEventListener('jackyun-local-durability',listener);resolve();}};window.addEventListener('jackyun-local-durability',listener);});
  localStorage.setItem('jackyun_schedule_control_v1',JSON.stringify(value));
  localStorage.setItem('jackyun_settings_learning_preferences',JSON.stringify({cueGameEnabled:true,cueShuffle:false,cueAmbientMotion:false,cueCelebrationMotion:false}));
  await saved;
 },seed);
 await page.reload();
 await page.getByRole('region',{name:'CUE 学习预览'}).getByRole('button',{name:'开始学习',exact:true}).click({timeout:60000});
 const session=page.getByRole('dialog').filter({has:page.locator('[data-cue-study-page]')});await session.waitFor();
 const settings=session.locator('[data-cue-practice-settings]');await settings.locator('summary').click();
 await settings.getByRole('combobox',{name:'重练触发方式'}).selectOption(scenario.trigger);
 await settings.getByRole('spinbutton',{name:scenario.trigger==='questions'?'间隔题数':'间隔分钟'}).fill('1');await settings.locator('summary').click();
 if(scenario.trigger==='time') await page.clock.install();
 await page.keyboard.press('3');await page.keyboard.press('3');
 await page.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}').cueStudyDrafts || {}).some((d:unknown)=>(d as {index:number}).index===1));
 if(scenario.trigger==='time') await page.clock.fastForward(61000);
 await page.keyboard.press('3');await page.waitForTimeout(1000);
 assert.equal(await session.locator('[data-cue-practice-mode="automatic"]').count(),0,'first rating must stay on current card even when retry is due');
 await page.keyboard.press('3');
 await session.locator('[data-cue-practice-mode="automatic"]').waitFor();
 console.log('PASS second confirmation starts due retry');

 if(scenario.trigger==='time') await page.clock.resume();
 await session.getByRole('button',{name:'返回本轮',exact:true}).click();
 assert.match(await session.locator('[data-cue-source]').innerText(),/Cambridge Physics.*P\d+ Q2/);
 await session.getByRole('button',{name:'隐藏游戏侧栏',exact:true}).click();
 assert.equal(await session.getByRole('button',{name:'展开游戏侧栏',exact:true}).count(),1);
 assert.equal(await session.getByRole('progressbar',{name:'下一组星座进度'}).count(),0);
 await session.getByRole('button',{name:'展开游戏侧栏',exact:true}).click();
 if(scenario.width<1024) await session.locator('details[data-cue-game-compact] > summary').click();
 await session.getByRole('progressbar',{name:'下一组星座进度'}).waitFor();
 await session.locator('details[data-cue-actions] > summary').click();
 await session.getByRole('button',{name:'结束本轮学习并保存',exact:true}).click();
 await session.waitFor({state:'detached',timeout:10000});
 await page.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}').cueStudyDrafts || {}).length===0);
 await page.reload();
 await page.getByRole('region',{name:'CUE 学习预览'}).waitFor();
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}'));
 assert.equal(stored.learningRecords.length,1,'completion must survive reload');
 assert.equal(Object.keys(stored.cueStudyDrafts || {}).length,0,'completed draft must stay removed');
 assert.equal(stored.cueReviews.length,2,'saving must not duplicate reviews');
 if(scenario.width<1024) { assert.deepEqual(errors,[]); console.log('PASS touch timer retry, game toggle, save and reload'); await context.close(); continue; }
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 if(scenario.width<1024) await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'Cue 管理',exact:true}).click();
 await page.getByRole('button',{name:'复制全部科目 CUE JSON',exact:true}).click();
 const copied=JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()));
 assert.equal(copied.cues.length,120); assert.equal(new Set(copied.cues.map((cue:{subjectName:string})=>cue.subjectName)).size,2); assert.equal(copied.cues[0].sourceLocation,'P1 Q2');
 if(scenario.width===1440) {
  await page.getByRole('button',{name:'导入 CUE 并逐条对比',exact:true}).click();
  const exchange=page.getByRole('dialog',{name:'导入外部 CUE 并逐条对比'});
  const edited={...copied,cues:[{...copied.cues[0],source:'ChatGPT · verified discussion',examStatus:'not-tested',examHistory:'Checked 2020–2025 papers'}]};
  await exchange.locator('input[type=file]').setInputFiles({name:'cue-analysis.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(edited))});
  await exchange.getByRole('combobox',{name:'处理方式'}).selectOption('update');
  await exchange.getByRole('button',{name:'应用所选操作',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}').cues[0].examStatus==='not-tested');
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}'));
  assert.equal(after.cues[0].source,'ChatGPT · verified discussion');assert.equal(after.cueReviews.length,2);
  assert.equal(after.learningRecords.length,1,'exchange metadata updates preserve saved learning');
  await exchange.getByRole('button',{name:'关闭',exact:true}).last().click();
 }
 assert.match(await page.getByRole('dialog',{name:'知识 CUE 管理',exact:true}).locator('[data-cue-source]').first().innerText(),/ChatGPT.*verified discussion[\s\S]*尚未考过/);
 await page.screenshot({path:'/tmp/cue-repair-manager.png'});
 assert.deepEqual(errors,[]);console.log(`PASS ${scenario.width}px: completion persists once, draft clears, game toggles, all subjects copy with metadata`);
 await context.close();
 }
} finally {await browser.close();}
