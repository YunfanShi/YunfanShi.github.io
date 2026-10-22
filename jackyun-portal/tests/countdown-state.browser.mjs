import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_AUTH_TEST_URL || 'http://127.0.0.1:3154';
const backend = process.env.JACKYUN_UI_BACKEND_URL || 'http://127.0.0.1:54329';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname) || !['localhost', '127.0.0.1'].includes(new URL(backend).hostname)) {
  throw new Error('Countdown state regression requires loopback app and fixture');
}

const session = await (await fetch(`${backend}/_test/session?role=user`)).json();
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: base }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));

  await page.goto(`${base}/countdown`);
  const frame = page.frameLocator('iframe[title="倒计时"]');
  await frame.locator('html[data-legacy-workspace]').waitFor();
  await frame.locator('.settings-btn').click();
  const settings = frame.locator('#settings-modal');
  await settings.waitFor({ state: 'visible' });
  await settings.locator('#new-title').fill('UI 状态回归倒计日');
  const target = new Date(Date.now() + 7 * 86_400_000);
  target.setSeconds(0, 0);
  const localDate = new Date(target.getTime() - target.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await settings.locator('#new-date').fill(localDate);
  await settings.locator('.add-btn').click();
  await settings.locator('.event-item').filter({ hasText: 'UI 状态回归倒计日' }).waitFor();

  const initial = await page.evaluate(() => ({
    events: JSON.parse(localStorage.getItem('jack_countdown_events') || '[]'),
    sortMode: localStorage.getItem('jack_countdown_sort_mode'),
  }));
  assert.equal(initial.events.length, 1);
  assert.equal(initial.events[0].title, 'UI 状态回归倒计日');
  assert.equal(initial.sortMode, 'date');

  await page.goto(`${base}/dashboard`);
  await page.goto(`${base}/countdown`);
  await frame.locator('html[data-legacy-workspace]').waitFor();
  await frame.locator('.settings-btn').click();
  await frame.locator('#event-list-container .event-item').filter({ hasText: 'UI 状态回归倒计日' }).waitFor();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('jack_countdown_events') || '[]'));
  assert.deepEqual(restored.map(event => event.title), ['UI 状态回归倒计日']);
  assert.deepEqual(errors, [], 'countdown event should survive iframe remount without browser errors');
  console.log('PASS countdown event survives iframe remount at 1440px');
  await context.close();
} finally {
  await browser.close();
}
