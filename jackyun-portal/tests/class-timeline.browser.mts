import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createEmptyScheduleState } from '../src/lib/learning/schedule-control.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3100';
const seed = { ...createEmptyScheduleState(), settings: { ...createEmptyScheduleState().settings, tutorialSeenVersion: 1 }, timetable: { version: 1, name: '测试课表', courses: [
  { id: 'math', name: '数学', color: '#4285f4', review: false, sessions: [{ day: 1, start: '09:00', end: '09:45', location: '教室 201', teacher: '王老师' }] },
  { id: 'physics', name: '物理', color: '#34a853', review: false, sessions: [{ day: 1, start: '10:00', end: '10:40' }] },
] } };
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, timezoneId: 'Asia/Shanghai' });
    await context.addInitScript(value => localStorage.setItem('jackyun_schedule_control_v1', JSON.stringify(value)), seed);
    const page = await context.newPage(); const errors: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-12T09:22:30+08:00') });
    await page.clock.pauseAt(new Date('2026-10-12T09:22:30+08:00'));
    await page.goto(base + '/schedule');
    const timeline = page.getByRole('region', { name: '课程时间线' });
    await timeline.getByRole('timer').waitFor();
    assert.equal(await timeline.getByRole('timer').innerText(), '22:30');
    await timeline.getByText('09:00 — 09:45 · 共 45 分钟', { exact: true }).waitFor();
    assert.equal(await timeline.getByRole('progressbar').getAttribute('aria-valuenow'), '50');
    const viewNavigation = page.locator(width < 1024 ? 'nav[aria-label="日程触控视图"]' : 'nav[aria-label="日程视图"]');
    await viewNavigation.locator('button').filter({ hasText: '周课表' }).click();
    await page.locator('[data-week-agenda]').waitFor();
    await viewNavigation.locator('button').filter({ hasText: '今日' }).click();
    await timeline.getByRole('timer').waitFor();
    assert.equal(await timeline.getByRole('timer').innerText(), '22:30', 'switching to the week view and back should preserve the live class countdown');
    if (width < 1024) {
      await viewNavigation.locator('button').filter({ hasText: '更多' }).click();
      await page.locator('nav[aria-label="更多日程视图"]').locator('button').filter({ hasText: '设置' }).click();
    } else {
      await viewNavigation.locator('button').filter({ hasText: '设置' }).click();
    }
    await page.getByRole('heading', { name: '运行模式', exact: true }).waitFor();
    await viewNavigation.locator('button').filter({ hasText: '今日' }).click();
    await timeline.getByRole('timer').waitFor();
    assert.equal(await timeline.getByRole('timer').innerText(), '22:30', 'unmounting the timetable panel should not reset the class countdown');
    await timeline.screenshot({ path: `artifacts/verification/cue-roadmap/timeline-${width}.png` });
    await page.getByRole('button', { name: '下一日期', exact: true }).click();
    await timeline.getByRole('heading', { name: '当日课表', exact: true }).waitFor();
    assert.equal(await timeline.getByRole('timer').count(), 0);
    await page.getByRole('button', { name: '回到今天', exact: true }).click();
    await timeline.getByRole('timer').waitFor();
    await page.clock.runFor(1000); assert.equal(await timeline.getByRole('timer').innerText(), '22:29');
    await page.clock.setSystemTime(new Date('2026-10-12T09:45:00+08:00')); await page.clock.runFor(1000);
    await timeline.getByRole('status').getByText('课间休息', { exact: true }).waitFor();
    assert.equal(await timeline.getByRole('timer').innerText(), '14:59');
    await page.clock.setSystemTime(new Date('2026-10-12T10:00:00+08:00')); await page.clock.runFor(1000);
    await timeline.getByRole('heading', { name: '物理', exact: true }).waitFor();
    await page.clock.setSystemTime(new Date('2026-10-12T10:40:00+08:00')); await page.clock.runFor(1000);
    await timeline.getByRole('status').getByText('今日课程已结束').waitFor(); assert.equal(await timeline.getByRole('timer').count(), 0);
    await page.clock.setSystemTime(new Date('2026-10-13T00:00:00+08:00')); await page.clock.runFor(1000);
    await timeline.getByRole('heading', { name: '当日课表', exact: true }).waitFor(); assert.equal(await timeline.getByRole('timer').count(), 0);
    assert.deepEqual(errors, []); console.log(`PASS live timetable ${width}px current class, timing, progress and automatic boundaries`);
    await context.close();
  }
  const holiday = await browser.newContext({ timezoneId: 'Asia/Shanghai' });
  await holiday.addInitScript(value => localStorage.setItem('jackyun_schedule_control_v1', JSON.stringify(value)), { ...seed, settings: { ...seed.settings, mode: 'holiday' } });
  const page = await holiday.newPage(); await page.goto(base + '/schedule');
  const timeline = page.getByRole('region', { name: '课程时间线' }); await timeline.getByText(/假日模式已暂停/).waitFor();
  assert.equal(await timeline.getByRole('timer').count(), 0); await holiday.close(); console.log('PASS holiday mode suppresses course countdown');
} finally { await browser.close(); }
