import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_AUTH_TEST_URL || 'http://127.0.0.1:3154';
const backend = 'http://127.0.0.1:54329';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Quick task UI regression requires a loopback app');
const session = await (await fetch(`${backend}/_test/session?role=user`)).json();
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
let failNextSave = true;
const payloads = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: base }]);
  const page = await context.newPage();
  page.on('pageerror', error => { throw error; });
  await page.route('**/api/sync/v3**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ syncProtocol: 3, records: [], next: null }) }));
  await page.route('**/api/offline/workspace', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    payloads.push(route.request().postDataJSON());
    if (failNextSave) { failNextSave = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '本机模拟服务暂不可用' }) }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.goto(`${base}/dashboard`);
  const input = page.getByPlaceholder('快速添加一个学习任务…');
  await page.waitForFunction(() => {
    const element = document.querySelector('input[placeholder="快速添加一个学习任务…"]');
    return element?.isConnected && element.getBoundingClientRect().width > 0 && getComputedStyle(element).fontSize !== '';
  });
  await input.waitFor({ state: 'visible' });
  const touchStyle = await input.evaluate(element => ({ fontSize: getComputedStyle(element).fontSize, minHeight: getComputedStyle(element).minHeight }));
  assert.equal(touchStyle.fontSize, '16px');
  assert.ok(parseFloat(touchStyle.minHeight) >= 44);
  await input.fill('共享控件任务回归');
  await page.getByLabel('截止日期').fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  await page.getByLabel('预计').fill('45');
  await page.getByRole('button', { name: '添加' }).click();
  await page.getByText(/Offline mutation failed \(503\)/).waitFor();
  assert.equal(await input.inputValue(), '共享控件任务回归', 'failed save keeps the task draft');

  await page.getByRole('button', { name: '添加' }).click();
  await page.waitForFunction(() => document.querySelector('input[placeholder="快速添加一个学习任务…"]')?.value === '');
  assert.equal(payloads.length, 2);
  assert.equal(payloads[1].kind, 'task.create');
  assert.equal(payloads[1].payload.estimatedMinutes, 45);
  assert.equal(payloads[1].payload.dueDate, new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  await context.close();
  console.log(JSON.stringify({ passed: 4, checks: [
    'Quick task uses 16px mobile text and a 44px minimum touch target',
    'Date and duration remain attached to the task payload',
    'Failed task save preserves title and form data for retry',
    'Successful retry submits once and clears the completed draft',
  ] }));
} finally { await browser.close(); }
