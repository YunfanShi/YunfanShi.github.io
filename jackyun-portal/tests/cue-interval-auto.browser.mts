import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createEmptyScheduleState, type StudyCue } from '../src/lib/learning/schedule-control.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3227';
const seed = createEmptyScheduleState();
seed.settings.tutorialSeenVersion = 1;
seed.cues = Array.from({ length: 3 }, (_, index) => ({
  id: `cue${index}`, subjectId: 'math', subjectName: '数学', unit: '函数', subsection: '',
  type: 'definition', prompt: `间隔回归题 ${index + 1}`, answer: '检索依据', markingPoints: [],
  intervalDays: 0, easeFactor: 2.5, streak: 0, nextReviewDate: '2026-10-29',
  createdAt: '2026-10-20T04:00:00Z', updatedAt: '2026-10-20T04:00:00Z', status: 'unclear',
} as StudyCue));

const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
try {
  const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, timezoneId: 'Asia/Shanghai' });
  await context.addInitScript(value => {
    localStorage.setItem('jackyun_schedule_control_v1', JSON.stringify(value));
    localStorage.setItem('jackyun_settings_learning_preferences', JSON.stringify({ cueGameEnabled: true, cueShuffle: false }));
  }, seed);
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-10-30T12:00:00+08:00') });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/schedule?view=cue&subject=math&filter=due`);
  await page.getByRole('region', { name: 'CUE 学习预览' }).getByRole('button', { name: '开始学习', exact: true }).click({ timeout: 60_000 });
  const session = page.getByRole('dialog').filter({ has: page.locator('[data-cue-study-page]') });
  await session.locator('[data-cue-game-compact="true"] > summary').click();
  const settings = session.locator('[data-cue-practice-settings]');
  await settings.locator('summary').click();
  await settings.getByRole('combobox', { name: '重练触发方式' }).selectOption('time');
  await settings.getByRole('spinbutton', { name: '间隔分钟' }).fill('1');
  await settings.locator('summary').click();

  await page.keyboard.press('3');
  await page.keyboard.press('3');
  const prompt = session.getByRole('region', { name: '触屏学习卡片' });
  assert.ok((await prompt.innerText()).includes('间隔回归题 2'));
  await page.clock.fastForward(60_000);
  assert.ok((await prompt.innerText()).includes('间隔回归题 2'), 'the active unanswered Cue is not interrupted when the timer expires');

  await page.keyboard.press('3');
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}').cueStudyDrafts || {})
    .some((draft: unknown) => (draft as { practice?: { active?: string } }).practice?.active === 'cue0'));
  assert.ok((await prompt.innerText()).includes('间隔回归题 1'), 'the due retry opens automatically after the active Cue is rated');
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
}
console.log('PASS: time-based CUE retries open automatically at the next safe point after the interval expires.');
