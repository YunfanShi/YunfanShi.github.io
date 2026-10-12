import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createEmptyScheduleState, type StudyCue } from '../src/lib/learning/schedule-control.ts';
import { readQuestionBank } from '../src/lib/learning/question-bank.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3100';
const out = process.env.JACKYUN_SCREENSHOT_DIR || 'artifacts/verification/device-layout';
await mkdir(out, { recursive: true });
const now = new Date();
const cue = (id: string): StudyCue => ({ id, subjectId: 'math', subjectName: '数学', unit: '函数', subsection: '', type: 'definition', prompt: '用自己的话解释函数与映射，以及定义域和值域之间的关系。'+id, answer: '每个输入值对应一个确定的输出值。', markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), status: 'unclear' });
const initial = createEmptyScheduleState();
const seed = { ...initial, cues: [cue('one'), cue('two')], settings: { ...initial.settings, tutorialSeenVersion: 1 }, timetable: { version: 1, name: '设备适配测试课表', courses: [
  { id: 'math', name: '数学', color: '#4285f4', review: false, sessions: [{ day: now.getDay() || 7, start: '09:00', end: '09:45', location: '201' }] },
  { id: 'physics', name: '物理', color: '#34a853', review: false, sessions: [{ day: now.getDay() || 7, start: '10:00', end: '10:40' }] },
] } };
const questionBank={schemaVersion:1,questions:[{id:'q1',subjectId:'math',subjectName:'数学',unit:'函数',subsection:'',type:'single',prompt:'下列哪个选项是函数的定义？',choices:['每个输入对应唯一输出','每个输入对应多个输出'],correctChoices:[0],answer:'每个输入对应唯一输出',markingPoints:[],linkedCueIds:[],code:'MA-001',version:1,createdAt:now.toISOString(),updatedAt:now.toISOString()}],attempts:[],reviews:{},drafts:{'touch-question':{id:'touch-question',mode:'question',task:{key:'touch-question',title:'数学练习',detail:'',type:'special',date:now.toISOString().slice(0,10),durationMinutes:8,subjectId:'math',subjectName:'数学'},items:[{kind:'question',id:'q1'}],index:0,revealed:{},responses:{},assessments:{},updatedAt:now.toISOString()}}};
readQuestionBank(questionBank);
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const results: unknown[] = [];
try {
  for (const [width, height, touch, layout] of [[320,568,true,'phone'],[390,844,true,'phone'],[844,390,true,'phone'],[768,1024,true,'tablet'],[900,900,false,'tablet'],[1024,768,true,'tablet'],[1366,1024,true,'tablet'],[1440,900,false,'desktop']] as const) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, timezoneId: 'Asia/Shanghai' });
    await context.addInitScript(value => localStorage.setItem('jackyun_schedule_control_v1', JSON.stringify(value)), seed);
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date(now.getFullYear(),now.getMonth(),now.getDate(),9,22,30));
    const errors: string[] = []; page.on('pageerror', (e: Error) => errors.push(e.message));
    await page.goto(base+'/schedule');
    await page.locator('[aria-label="课程时间线"]').waitFor();
    await page.waitForFunction(expected => document.documentElement.dataset.workspaceLayout === expected, layout);
    await page.addStyleTag({content:'nextjs-portal { display:none!important; }'});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const quick = page.getByRole('navigation', {name:'快捷导航'});
    assert.equal(await quick.isVisible(), layout !== 'desktop', width+' navigation');
    if (layout !== 'desktop') {
      const nav = page.getByRole('navigation', {name:'日程触控视图'});
      assert.equal(await nav.isVisible(),true);
      assert.equal(await nav.getByRole('button').count(),4);
      const timeline = await page.getByRole('region', {name:'课程时间线'}).boundingBox();
      const tasks = await page.getByRole('heading', {name:'今天要完成', exact:true}).boundingBox();
      if(layout==='phone')assert.ok(timeline!.y<tasks!.y,'phone prioritizes current class');
      if(layout==='tablet')assert.ok(timeline!.x>tasks!.x,'tablet uses two columns');
      await nav.getByRole('button',{name:'周课表',exact:true}).click();
      const week = page.locator('[data-week-agenda]');
      await week.waitFor();
      assert.equal(await week.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'week does not require desktop horizontal scroll');
      assert.equal(await week.getByRole('button').count(),7);
      await nav.getByRole('button',{name:'更多',exact:true}).click();
      await page.getByRole('navigation',{name:'更多日程视图'}).getByRole('button',{name:'设置',exact:true}).click();
      await page.getByRole('heading',{name:'新手教程与功能介绍'}).waitFor();
      await nav.getByRole('button',{name:'今日',exact:true}).click();
      await quick.getByRole('button',{name:'全部',exact:true}).click();
      const drawer=page.getByRole('dialog',{name:'全部功能'});await drawer.waitFor();
      assert.equal(await page.locator('[data-portal-content]').evaluate(el=>el.inert),true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-portal-content]').evaluate(el=>el.inert),false);
    }
    await page.screenshot({path:out+'/schedule-'+width+'.png',animations:'disabled'});
    await page.goto(base+'/schedule?view=cue&subject=math&filter=due');
    const preview=page.getByRole('region',{name:'CUE 学习预览'});await preview.waitFor();
    await preview.getByRole('button',{name:'开始学习',exact:true}).click();
    const session=page.getByRole('dialog').filter({has:page.locator('[data-cue-study-content]')});await session.waitFor();
    if(layout!=='desktop'){
      await session.getByRole('region',{name:'触屏学习卡片'}).waitFor();
      assert.equal(await session.getByRole('button',{name:'学习工具和题目目录'}).isVisible(),true);
      await session.getByRole('button',{name:'翻到答案页',exact:true}).click();
      const rating=session.getByRole('button',{name:'√ 通过',exact:true});
      await rating.waitFor();await page.waitForTimeout(350);await session.screenshot({path:out+'/cue-study-'+width+'.png',animations:'disabled'});assert.ok((await rating.boundingBox())!.height>=44);await rating.click();
      await session.getByRole('button',{name:'退出 Cue 学习并保存进度'}).click();
      const drafts=await page.evaluate(()=>JSON.parse(localStorage.getItem('jackyun_schedule_control_v1')!).cueStudyDrafts);
      assert.ok(Object.values(drafts).some((d: unknown)=>Object.keys((d as {assessments:object}).assessments).length),'assessment persisted');
    }else await session.getByRole('button',{name:'退出 Cue 学习并保存进度'}).click();
    await page.evaluate(value=>localStorage.setItem('jackyun_schedule_questions_v1',JSON.stringify(value)),questionBank);
    await page.goto(base+'/schedule?view=cue&draft=touch-question');
    await page.getByRole('region',{name:'CUE 学习预览'}).getByRole('button',{name:'继续学习',exact:true}).click();
    const unified=page.getByRole('dialog',{name:'学习会话'});await unified.waitFor();
    await unified.getByRole('radio').first().check();
    await unified.getByRole('button',{name:'提交作答并查看答案',exact:true}).click();
    const ratings=layout==='desktop'?unified.locator('[class*="inlineRatings"]'):unified.getByRole('group',{name:'触控掌握评价'});
    const stable=ratings.getByRole('button',{name:'√ 稳定掌握',exact:true});await stable.click();
    assert.equal(await stable.getAttribute('aria-pressed'),'true');
    if(layout!=='desktop'){
      const footer=await stable.boundingBox();assert.ok(footer!.height>=44 && footer!.y+footer!.height<=height,'rating stays within viewport');
      await unified.screenshot({path:out+'/question-study-'+width+'.png',animations:'disabled'});
    }
    await unified.getByRole('button',{name:'退出并保存',exact:true}).click();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('jackyun_schedule_questions_v1')!).drafts['touch-question']);
    assert.equal(saved.assessments['question:q1'],'stable');assert.equal(saved.responses['question:q1'].submitted,true);
    assert.deepEqual(errors,[]);results.push({width,height,touch,layout,passed:true});
    console.log('PASS '+width+'x'+height+' '+layout+' navigation, schedule, CUE persistence');
    await context.close();
  }
} finally { await browser.close();await writeFile(out+'/device-results.json',JSON.stringify(results,null,2)); }
