import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createEmptyScheduleState, type StudyCue } from '../src/lib/learning/schedule-control.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3228';
const now = '2026-11-01T04:00:00.000Z';
const seed = createEmptyScheduleState();
seed.settings.tutorialSeenVersion = 1;
seed.cues = [{ id: 'answer-draft-cue', subjectId: 'math', subjectName: '数学', unit: '函数', subsection: '', type: 'definition', prompt: '请解释函数定义', answer: '函数定义参考答案', markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: now, updatedAt: now, status: 'unclear' } as StudyCue];

const browser = await chromium.launch({ headless: true, ...(process.env.JACKYUN_BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.JACKYUN_BROWSER_EXECUTABLE_PATH } : { channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' }) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Shanghai' });
  await context.addInitScript(value => {
    localStorage.setItem('jackyun_schedule_control_v1', JSON.stringify(value));
    localStorage.setItem('jackyun_settings_learning_preferences', JSON.stringify({ cueGameEnabled: false, cueShuffle: false }));
  }, seed);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`${base}/schedule?view=cue&subject=math&filter=due`);
  await page.getByRole('region', { name: 'CUE 学习预览' }).getByRole('button', { name: '开始学习', exact: true }).click();
  const session = page.getByRole('dialog').filter({ has: page.locator('[data-cue-study-content]') });
  await session.waitFor();
  await page.keyboard.press('~');
  const panel = page.getByRole('complementary', { name: 'CUE 答题卡' });
  const answer = panel.getByRole('textbox', { name: 'CUE 我的作答' });
  await answer.fill('定义草稿第一版');
  await page.waitForTimeout(900);
  await answer.fill('定义草稿第二版，包含更多推导过程');
  await page.waitForTimeout(900);
  assert.equal(await panel.getByText('本机版本 3/3').count(), 1);
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('jackyun_schedule_control_v1') || '{}')).cueAnswerCards?.length ?? 0, 0, 'unsubmitted answer text stays out of synchronized schedule state');
  await panel.getByRole('button', { name: '恢复较旧版本' }).click();
  assert.equal(await answer.inputValue(), '定义草稿第一版');
  await panel.getByRole('button', { name: '恢复较新版本' }).click();
  assert.equal(await answer.inputValue(), '定义草稿第二版，包含更多推导过程');
  await panel.getByRole('button', { name: '关闭答题卡' }).click();
  await page.keyboard.press('~');
  assert.equal(await panel.getByRole('textbox', { name: 'CUE 我的作答' }).inputValue(), '定义草稿第二版，包含更多推导过程');
  await panel.getByRole('button', { name: '写完了，对照答案' }).click();
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}').cueAnswerCards || []).some((card: { text?: string }) => card.text === '定义草稿第二版，包含更多推导过程'));
  assert.deepEqual(pageErrors, []);
  console.log('PASS answer drafts save locally while typing, restore versions, and remain after closing the panel');
  await context.close();
} finally {
  await browser.close();
}
