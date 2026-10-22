import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createEmptyScheduleState, type StudyCue } from '../src/lib/learning/schedule-control.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3227';
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const seed = createEmptyScheduleState();
seed.settings.tutorialSeenVersion = 1;
seed.cues = Array.from({ length: 4 }, (_, index) => ({
  id: `route-cue-${index + 1}`,
  subjectId: 'math',
  subjectName: '数学',
  unit: '函数',
  subsection: '',
  type: 'definition',
  prompt: `路由恢复题目 ${index + 1}`,
  answer: `答案依据 ${index + 1}`,
  markingPoints: [],
  intervalDays: 0,
  easeFactor: 2.5,
  streak: 0,
  createdAt: '2026-10-13T04:00:00Z',
  updatedAt: '2026-10-13T04:00:00Z',
  status: 'unclear',
} as StudyCue));

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(value => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
    if (localStorage.getItem('jackyun_schedule_control_v1') === null) localStorage.setItem('jackyun_schedule_control_v1', JSON.stringify(value));
    if (localStorage.getItem('jackyun_settings_learning_preferences') === null) localStorage.setItem('jackyun_settings_learning_preferences', JSON.stringify({ cueGameEnabled: false, cueShuffle: false }));
  }, seed);
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(`${base}/schedule?view=cue&subject=math&filter=due`);
  for (const label of [/Cue 管理/, /添加任务/, /导入课表/]) {
    const action = page.getByRole('button', { name: label });
    assert.ok(await action.evaluate(element => element.getBoundingClientRect().height >= 44), `${label} stays at least 44px tall on desktop`);
    assert.equal(await action.evaluate(element => getComputedStyle(element).touchAction), 'manipulation', `${label} uses immediate touch activation`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const label of [/添加任务/, '打开日程管理']) {
    const action = page.getByRole('button', { name: label });
    assert.ok(await action.isVisible(), `${label} remains reachable in the mobile schedule header`);
    assert.ok(await action.evaluate(element => element.getBoundingClientRect().height >= 44), `${label} stays at least 44px tall on mobile`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('region', { name: 'CUE 学习预览' }).getByRole('button', { name: '开始学习', exact: true }).click({ timeout: 60_000 });
  const session = page.getByRole('dialog').filter({ has: page.locator('[data-cue-study-page]') });
  await session.waitFor();
  const fullscreen = session.getByRole('button', { name: '全屏', exact: true });
  await fullscreen.click();
  const fullscreenHelp = page.getByRole('dialog', { name: '减少浏览器工具栏占用' });
  await fullscreenHelp.waitFor();
  assert.ok(await fullscreenHelp.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  }), 'fullscreen help stays above the real learning session');
  await fullscreenHelp.getByRole('button', { name: '关闭全屏帮助', exact: true }).click();
  await fullscreenHelp.waitFor({ state: 'hidden' });
  assert.ok(await session.isVisible(), 'closing help preserves the learning session');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '全屏');
  await fullscreen.evaluate(element => (element as HTMLElement).blur());
  await page.keyboard.press('Space');
  await page.keyboard.press('1');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}');
    return Object.values(state.cueStudyDrafts || {}).some((draft: unknown) => {
      const value = draft as { index?: number; cueIds?: string[]; assessments?: Record<string, string> };
      return value.index === 1 && value.cueIds?.length === 4 && Object.keys(value.assessments || {}).length === 1;
    });
  });
  const beforeNavigation = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}');
    return Object.values(state.cueStudyDrafts || {}).find((draft: unknown) => (draft as { index?: number }).index === 1) as { cueIds: string[]; assessments: Record<string, string> };
  });
  const firstCueId = beforeNavigation.cueIds[0];
  const currentCueId = beforeNavigation.cueIds[1];
  const firstCueNumber = firstCueId.match(/route-cue-(\d+)/)?.[1];
  const currentCueNumber = currentCueId.match(/route-cue-(\d+)/)?.[1];
  assert.ok(firstCueNumber && currentCueNumber, 'saved CUE ids should match the seeded fixture');
  assert.equal(beforeNavigation.assessments[firstCueId], 'stable');
  const currentCard = session.locator('[data-cue-definition]');
  await currentCard.getByText(`路由恢复题目 ${currentCueNumber}`).waitFor({ timeout: 5_000 });
  await page.waitForTimeout(500);
  const settledBeforeNavigation = await page.evaluate(() => JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}'));
  assert.ok(Object.values(settledBeforeNavigation.cueStudyDrafts || {}).some((draft: unknown) => (draft as { index?: number }).index === 1), 'the current draft write should settle before navigating away');

  await page.goto(`${base}/dashboard`);
  await page.goto(`${base}/schedule?view=cue&subject=math&filter=due`);
  await page.getByRole('region', { name: 'CUE 学习预览' }).getByRole('button', { name: '继续学习', exact: true }).click({ timeout: 10_000 });
  const resumed = page.getByRole('dialog').filter({ has: page.locator('[data-cue-study-page]') });
  await resumed.waitFor();
  const resumedCard = resumed.locator('[data-cue-definition]');
  await resumedCard.getByText(`路由恢复题目 ${currentCueNumber}`).waitFor({ timeout: 5_000 });
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}'));
  const draft = Object.values(restored.cueStudyDrafts)[0] as { index: number; assessments: Record<string, string> };
  assert.equal(draft.index, 1);
  assert.equal(draft.assessments[firstCueId], 'stable');
  assert.deepEqual(pageErrors, [], 'CUE progress should survive leaving and returning to its route');
  console.log('PASS CUE assessment and current item survive route leave and return at 1440px');
  await context.close();
} finally {
  await browser.close();
}
