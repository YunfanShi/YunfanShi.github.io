import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createEmptyScheduleState, dateKey, saveCueStudyDraft, type StudyCue } from '../src/lib/learning/schedule-control.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'C:/Users/syf26/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3100';
const screenshots = process.env.JACKYUN_SCREENSHOT_DIR || 'artifacts/verification/cue-roadmap';
await mkdir(screenshots, { recursive: true });
const now = new Date(); const today = dateKey(now);
const cue = (id: string, subjectId = 'math'): StudyCue => ({ id, subjectId, subjectName: subjectId === 'math' ? '数学' : '英语', unit: '函数', subsection: '', type: 'definition', prompt: `检索 ${id}`, answer: '参考答案', markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), status: 'unclear' });
const state = { ...createEmptyScheduleState(), cueReviews: [{ id: 'r1', cueId: 'one', status: 'unclear' as const, reviewedAt: now.toISOString(), nextReviewDate: today }, { id: 'r2', cueId: 'two', status: 'partial' as const, reviewedAt: new Date(now.getTime() - 20 * 86400000).toISOString(), nextReviewDate: today }], cues: [cue('one'), cue('two'), cue('three', 'english')], settings: { ...createEmptyScheduleState().settings, tutorialSeenVersion: 1 } };
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript((seed: unknown) => localStorage.setItem('jackyun_schedule_control_v1', JSON.stringify(seed)), state);
    const page = await context.newPage(); const errors: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.goto(base + '/dashboard');
    const board = page.getByRole('region', { name: '今天的 CUE' });
    await board.getByText('待学 2 · 新增／修改 2 · 薄弱 2', { exact: true }).waitFor();
    assert.ok((await board.boundingBox()).y < 230, 'CUE is above the AI section');
    await page.screenshot({ path: `${screenshots}/dashboard-${width}.png`, animations: 'disabled' });
    await board.getByRole('link', { name: '查看待学', exact: true }).first().click();
    const preview = page.getByRole('region', { name: 'CUE 学习预览' });
    await preview.getByText('当前范围 2 条 CUE · 预计 8 分钟。', { exact: true }).waitFor();
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('jackyun_schedule_control_v1')!).cueStudyDrafts);
    assert.equal(Object.keys(before || {}).length, 0, 'preview does not create sessions');
    await preview.getByRole('button', { name: '开始学习', exact: true }).click();
    await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}').cueStudyDrafts || {}).length === 1);
    await page.screenshot({ path: `${screenshots}/study-${width}.png`, animations: 'disabled' });
    // Navigate within the same schedule route: query changes must open preview.
    await page.goto(base + '/schedule');
    try { await page.locator('nav[aria-label="日程视图"]').waitFor({ timeout: 10000 }); } catch (cause) { await page.screenshot({ path: `${screenshots}/failure-${width}.png` }); console.log(errors, await page.locator('body').innerText()); throw cause; }
    await page.locator('nav[aria-label="日程视图"]').getByRole('button', { name: /学习记录/ }).click();
    await page.getByRole('combobox', { name: '统计时间范围' }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: '统计时间范围' }).inputValue(), '7');
    await page.getByText(/近 7 天 · 当前范围 1 次/).waitFor();
    await page.getByRole('combobox', { name: '统计时间范围' }).selectOption('30');
    await page.getByText(/近 30 天 · 当前范围 2 次/).waitFor();
    await page.getByRole('combobox', { name: '表现图学科' }).selectOption('math');
    await page.screenshot({ path: `${screenshots}/insights-${width}.png`, animations: 'disabled' });
    await page.getByRole('link', { name: '练习本科薄弱内容', exact: true }).click();
    await page.getByRole('region', { name: 'CUE 学习预览' }).getByRole('heading', { name: /薄弱练习/ }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS CUE dashboard, subject scope, explicit start at ${width}px (${today})`);
    await context.close();
  }
  const completedState = saveCueStudyDraft({ ...state, cues: state.cues.map(cue => cue.subjectId === 'math' ? { ...cue, status: 'stable', lastReviewedAt: now.toISOString(), nextReviewDate: dateKey(new Date(now.getTime() + 86400000)) } : cue) }, { id: 'done-draft', task: { key: 'done-draft', title: '数学学习', subjectId: 'math', subjectName: '数学', type: 'special', detail: '', date: today, durationMinutes: 8, cueIds: ['one', 'two'] }, cueIds: ['one', 'two'], index: 0, revealed: false, assessments: { one: 'stable', two: 'stable' }, updatedAt: now.toISOString() });
  const doneContext = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await doneContext.addInitScript(seed => { if (!localStorage.getItem('jackyun_schedule_control_v1')) localStorage.setItem('jackyun_schedule_control_v1', JSON.stringify(seed)); }, completedState);
  const donePage = await doneContext.newPage();
  await donePage.goto(base + '/schedule?view=cue&draft=done-draft');
  await donePage.getByRole('region', { name: 'CUE 学习预览' }).getByRole('button', { name: '继续学习' }).click();
  await donePage.getByRole('button', { name: '完成学习并保存记录', exact: true }).click();
  const completion = donePage.getByRole('dialog', { name: '本次学习完成' });
  await completion.waitFor(); await completion.getByText('CUE 2 条 · 题目 0 题', { exact: true }).waitFor();
  const saved = await donePage.evaluate(() => JSON.parse(localStorage.getItem('jackyun_schedule_control_v1')!));
  assert.equal(Object.keys(saved.cueStudyDrafts).length, 0); assert.equal(saved.learningRecords.length, 1);
  await donePage.screenshot({ path: `${screenshots}/completion-390.png`, animations: 'disabled' });
  await completion.getByRole('link', { name: '返回首页' }).click();
  await donePage.getByRole('region', { name: '今天的 CUE' }).waitFor();
  console.log('PASS resumed Cue completion persists record, clears draft, shows feedback and returns to dashboard');
  await doneContext.close();
} finally { await browser.close(); }
