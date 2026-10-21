import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createEmptyScheduleState, type StudyCue } from '../src/lib/learning/schedule-control.ts';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.JACKYUN_PLAYWRIGHT_PATH||'playwright');
const base=process.env.JACKYUN_TEST_URL||'http://127.0.0.1:3227';const out='artifacts/verification/cue-session-settings';await mkdir(out,{recursive:true});
const seed=createEmptyScheduleState();seed.settings.tutorialSeenVersion=1;
seed.cues=Array.from({length:10},(_,i)=>({id:`cue${i}`,subjectId:'math',subjectName:'数学',unit:'函数',subsection:'',type:'definition',prompt:`题号 ${i+1} 独立检索`,answer:'答题依据',markingPoints:[],intervalDays:0,easeFactor:2.5,streak:0,createdAt:'2026-10-13T04:00:00Z',updatedAt:'2026-10-13T04:00:00Z',status:'unclear'} as StudyCue));
const browser=await chromium.launch({headless:true,channel:process.env.JACKYUN_BROWSER_CHANNEL||'msedge'});const results=[];
try {
  for(const automatic of [false,true]) {
    const context=await browser.newContext({viewport:{width:820,height:1180},hasTouch:true,timezoneId:'Asia/Shanghai'});
    await context.addInitScript(value=>{localStorage.setItem('jackyun_schedule_control_v1',JSON.stringify(value));localStorage.setItem('jackyun_settings_learning_preferences',JSON.stringify({cueGameEnabled:true,cueShuffle:false}));},seed);
    const page=await context.newPage();const errors:string[]=[];page.on('pageerror',(error:Error)=>errors.push(error.message));
    await page.goto(base+'/schedule?view=cue&subject=math&filter=due');
    await page.getByRole('region',{name:'CUE 学习预览'}).getByRole('button',{name:'开始学习',exact:true}).click({timeout:60000});
    const session=page.getByRole('dialog').filter({has:page.locator('[data-cue-study-page]')});
    await session.locator('[data-cue-game-compact="true"] > summary').click();
    await session.getByRole('button',{name:/星空收藏 ·/}).click();
    const album=page.getByRole('dialog',{name:'星空收藏册',exact:true});await album.waitFor();await album.getByRole('button',{name:'关闭收藏',exact:true}).click();
    await session.getByRole('button',{name:/星空商店 ·/}).click();const shop=page.getByRole('dialog',{name:'星空商店',exact:true});await shop.waitFor();await shop.getByRole('button',{name:'返回学习',exact:true}).click();
    await session.locator('[data-cue-game-compact="true"] > summary').click();
    const settings=session.locator('[data-cue-practice-settings]');await settings.locator('summary').click();
    await settings.getByRole('spinbutton',{name:'间隔题数'}).fill('2');
    await settings.getByRole('checkbox',{name:'自动进入间隔重练'}).setChecked(automatic);await settings.locator('summary').click();
    await page.keyboard.press('3');await page.keyboard.press('3');
    for(let i=0;i<2;i++){await page.keyboard.press('1');await page.keyboard.press('1');}
    const prompt=session.getByRole('region',{name:'触屏学习卡片'});
    assert.ok((await prompt.innerText()).includes(automatic?'题号 1':'题号 4'));
    assert.ok(await session.getByRole('region',{name:'本轮重练目录'}).isVisible());
    if(automatic)await page.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('jackyun_schedule_control_v1')||'{}').cueStudyDrafts||{}).some((draft:unknown)=>(draft as {practice?:{active?:string}}).practice?.active==='cue0'));
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('jackyun_schedule_control_v1')||'{}'));
    const draft=Object.values(stored.cueStudyDrafts)[0] as {practice:{active?:string},automaticPractice?:unknown,practicePolicy?:unknown};
    assert.equal(draft.practice.active,automatic?'cue0':undefined);assert.equal(draft.automaticPractice,undefined);assert.equal(draft.practicePolicy,undefined);
    await settings.locator('summary').click();await settings.getByRole('combobox',{name:'重练触发方式'}).selectOption('time');await settings.getByRole('spinbutton',{name:'间隔分钟'}).fill('3');
    await settings.locator('summary').click();await page.screenshot({path:`${out}/${automatic?'automatic':'manual'}-tablet.png`,animations:'disabled'});
    await session.getByRole('button',{name:'退出 Cue 学习并保存进度'}).click();
    const summary=page.getByRole('button',{name:'收起学习成果'});if(await summary.isVisible())await summary.click();
    await page.getByRole('region',{name:'CUE 学习预览'}).getByRole('button',{name:/继续/}).click();
    const reopened=page.getByRole('dialog').filter({has:page.locator('[data-cue-study-page]')});await reopened.locator('[data-cue-practice-settings] summary').click();
    assert.equal(await reopened.getByRole('checkbox',{name:'自动进入间隔重练'}).isChecked(),true);
    assert.equal(await reopened.getByRole('combobox',{name:'重练触发方式'}).inputValue(),'questions');
    results.push({automatic,insertedExpectedCue:true,noticeRetained:true,sessionOnly:true,errors});assert.deepEqual(errors,[]);await context.close();
  }
  const context=await browser.newContext();await context.addInitScript(value=>{if(!localStorage.getItem('jackyun_schedule_control_v1'))localStorage.setItem('jackyun_schedule_control_v1',JSON.stringify(value));},seed);
  const page=await context.newPage();await page.goto(base+'/schedule');await page.getByRole('navigation',{name:'日程视图',exact:true}).getByRole('button',{name:/设置/}).click();const toggle=page.getByRole('checkbox',{name:'自动生成每日学习任务'});await toggle.waitFor();await toggle.uncheck();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('jackyun_schedule_control_v1')||'{}').settings?.automaticTasksEnabled===false);await page.reload();await page.getByRole('navigation',{name:'日程视图',exact:true}).getByRole('button',{name:/设置/}).click();await toggle.waitFor();assert.equal(await toggle.isChecked(),false);
  results.push({dailyTaskSettingPersists:true});await context.close();
  const response=await browser.newContext();assert.equal((await response.request.get(base+'/api/integrations/dida365/schedule-sync?accountId=11111111-1111-4111-8111-111111111111')).status(),401);await response.close();
} finally {await browser.close();await writeFile(out+'/results.json',JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));
