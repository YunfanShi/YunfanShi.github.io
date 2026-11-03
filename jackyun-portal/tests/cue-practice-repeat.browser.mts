import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createEmptyScheduleState, type StudyCue } from '../src/lib/learning/schedule-control.ts';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.JACKYUN_PLAYWRIGHT_PATH||'playwright');
const base=process.env.JACKYUN_TEST_URL||'http://127.0.0.1:3227';
const seed=createEmptyScheduleState();
seed.settings.tutorialSeenVersion=1;
seed.cues=Array.from({length:3},(_,i)=>({
  id:`repeat-${i}`,subjectId:'math',subjectName:'数学',unit:'函数',subsection:'',type:'definition',
  prompt:`循环重练题 ${i+1}`,answer:'记忆依据',markingPoints:[],intervalDays:0,easeFactor:2.5,streak:0,
  nextReviewDate:'2026-10-29',createdAt:'2026-10-20T04:00:00Z',updatedAt:'2026-10-20T04:00:00Z',status:'unclear',
} as StudyCue));
const browser=await chromium.launch({headless:true,channel:process.env.JACKYUN_BROWSER_CHANNEL||'msedge'});
try {
  const context=await browser.newContext({viewport:{width:820,height:1180},hasTouch:true,timezoneId:'Asia/Shanghai'});
  await context.addInitScript(value=>{
    localStorage.setItem('jackyun_schedule_control_v1',JSON.stringify(value));
    localStorage.setItem('jackyun_settings_learning_preferences',JSON.stringify({cueGameEnabled:true,cueShuffle:false}));
  },seed);
  const page=await context.newPage();
  await page.clock.install({time:new Date('2026-10-30T12:00:00+08:00')});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/schedule?view=cue&subject=math&filter=due`);
  await page.getByRole('region',{name:'CUE 学习预览'}).getByRole('button',{name:'开始学习',exact:true}).click({timeout:60_000});
  const session=page.getByRole('dialog').filter({has:page.locator('[data-cue-study-page]')});
  const settings=session.locator('[data-cue-practice-settings]');
  await settings.locator('summary').click();
  await settings.getByRole('checkbox',{name:'自动进入间隔重练'}).setChecked(false);
  await settings.getByRole('combobox',{name:'重练触发方式'}).selectOption('time');
  await settings.getByRole('spinbutton',{name:'间隔分钟'}).fill('5');
  await settings.locator('summary').click();
  const prompt=session.getByRole('region',{name:'触屏学习卡片'});
  const rail=session.locator('[aria-label="Cue 学习进度"]');
  await rail.evaluate(element=>{element.style.flexWrap='nowrap';element.style.width='100px';element.style.overflowX='auto';});
  await rail.locator('button').nth(1).evaluate((button:HTMLButtonElement)=>button.click());
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}').cueStudyDrafts || {})
    .some((draft: unknown) => (draft as { index?: number }).index === 1));
  assert.equal(await rail.evaluate(element=>element.scrollLeft),0,'changing to the next visible Cue does not recenter the progress rail');
  await rail.locator('button').nth(0).evaluate((button:HTMLButtonElement)=>button.click());
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}').cueStudyDrafts || {})
    .some((draft: unknown) => (draft as { index?: number }).index === 0));
  await page.keyboard.press('3');
  await page.keyboard.press('3');
  const earlyDirectory=session.locator('details[data-cue-practice-directory]');
  await earlyDirectory.locator('summary').click();
  const earlyRetry=earlyDirectory.getByRole('button',{name:/循环重练题 1.*可手动重练/});
  assert.equal(await earlyRetry.isEnabled(),true,'a learner can manually enter a pending retry before its interval');
  await earlyRetry.click();
  assert.ok((await session.locator('[data-cue-practice-mode="manual"]').innerText()).includes('不受间隔限制'));
  await session.getByRole('button',{name:'返回本轮'}).click();
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}').cueStudyDrafts || {})
    .some((draft: unknown) => (draft as { practice?: { respectIntervalsAfterManual?: boolean } }).practice?.respectIntervalsAfterManual));
  await earlyDirectory.locator('summary').click();
  for(let i=0;i<2;i++){await page.keyboard.press('3');await page.keyboard.press('3');}
  const repeatButton=session.getByRole('button',{name:'继续重练全部题'});
  await repeatButton.waitFor({timeout:10_000});
  assert.equal(await repeatButton.isEnabled(),true);
  await repeatButton.click();
  assert.ok((await session.locator('[data-cue-practice-mode="manual"]').innerText()).includes('手动重练'), 'learner-started retries are clearly labeled separately');
  assert.equal(await session.locator('[data-cue-practice-remaining]').innerText(),'还需重练 3 条');
  assert.ok((await prompt.innerText()).includes('循环重练题 1'));
  const directory=session.locator('details[data-cue-practice-directory]');
  await directory.locator('summary').click();
  await page.keyboard.press('1');
  await directory.getByRole('button',{name:/重练已通过 X1/}).waitFor({timeout:10_000});
  await directory.getByRole('button',{name:/重练已通过 X1/}).click();
  await page.keyboard.press('1');
  await directory.getByRole('button',{name:/重练已通过 X2/}).waitFor({timeout:10_000});
  await page.keyboard.press('3');
  await directory.getByRole('button',{name:/未通过 · 优先重练/}).waitFor({timeout:10_000});
  const failed=await directory.getByRole('button',{name:/未通过 · 优先重练/}).first();
  assert.match(await failed.getAttribute('class')||'',/border-rose-300|bg-rose-50/);
  await settings.locator('summary').click();
  await settings.getByRole('checkbox',{name:'自动进入间隔重练'}).setChecked(true);
  await settings.locator('summary').click();
  await session.getByRole('button',{name:'返回本轮'}).click();
  await page.waitForFunction(() => {
    const saved=JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}');
    const drafts=[...Object.values(saved.cueStudyDrafts || {}),...(saved.cueStudyDraft ? [saved.cueStudyDraft] : [])] as {practice?:{respectIntervalsAfterManual?:boolean}}[];
    return drafts.some(draft=>draft.practice?.respectIntervalsAfterManual&&!draft.practice.mode);
  });
  const deferred=await page.evaluate(() => {
    const saved=JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}');
    return [...Object.values(saved.cueStudyDrafts || {}),...(saved.cueStudyDraft ? [saved.cueStudyDraft] : [])]
      .map((draft: unknown) => (draft as { practice?: { completed?: number; pending?: { after: number }[]; mode?: boolean; active?: string; respectIntervalsAfterManual?: boolean } }).practice)
      .find(practice => practice?.respectIntervalsAfterManual&&!practice.mode);
  });
  assert.ok(!deferred?.mode,'returning from manual practice restores ordinary study');
  assert.equal(deferred?.active,undefined);
  assert.ok(deferred?.pending?.every(item=>item.after>deferred.completed!), 'remaining retries are deferred after manual practice');
  await page.clock.fastForward(60_000);
  assert.equal(await session.locator('[data-cue-practice-mode="automatic"]').count(),0,'manual retries do not immediately restart automatically');
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('PASS: completed rounds loop through passed Cues, count X1/X2, and move failed retries to the red priority queue.');
} finally { await browser.close(); }
