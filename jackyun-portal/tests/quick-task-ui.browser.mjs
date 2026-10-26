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
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error));
  await page.route('**/api/sync/v3**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ syncProtocol: 3, records: [], next: null }) }));
  await page.route('**/api/offline/workspace', async route => {
    if (route.request().method() === 'GET' && new URL(route.request().url()).searchParams.has('receipt')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ receipt: null }) });
    }
    if (route.request().method() !== 'POST') return route.continue();
    const payload = route.request().postDataJSON();
    payloads.push(payload);
    if (failNextSave) { failNextSave = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '本机模拟服务暂不可用' }) }); }
    await new Promise(resolve => setTimeout(resolve, 250));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ operationId: payload.operationId, requestHash: payload.requestHash, state: 'confirmed' }) });
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
  const addButton = page.getByRole('button', { name: '添加', exact: true });
  await page.waitForFunction(() => {
    const field = document.querySelector('input[placeholder="快速添加一个学习任务…"]');
    const button = field?.closest('form')?.querySelector('button[type="submit"]');
    return field?.value === '共享控件任务回归' && button instanceof HTMLButtonElement && !button.disabled;
  });
  const failedResponse = page.waitForResponse(response => response.url().includes('/api/offline/workspace') && response.request().method() === 'POST' && response.status() === 503, { timeout: 10_000 });
  await addButton.click();
  await page.getByText('已记录，联网后同步').first().waitFor();
  await page.waitForFunction(() => document.querySelector('input[placeholder="快速添加一个学习任务…"]')?.value === '');
  await page.evaluate(() => window.dispatchEvent(new Event('jackyun-sync-retry')));
  await failedResponse;
  const retryConfirmed = page.waitForResponse(response => response.url().includes('/api/offline/workspace') && response.request().method() === 'POST' && response.status() === 200, { timeout: 45_000 });
  assert.equal(await page.getByText(/Offline mutation failed|本机模拟服务暂不可用/).count(), 0, 'recoverable 503 details stay out of the user-facing task flow');

  const pending = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('jackyun-offline-workspace', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = () => {
        const rows = read.result.filter(row => row.kind === 'task.create' && row.payload?.title === '共享控件任务回归');
        db.close();
        resolve(rows);
      };
    };
  }));
  assert.equal(pending.length, 1, '503 leaves exactly one durable operation in the local outbox');
  assert.equal(pending[0].attemptCount, 1);
  assert.equal(payloads[0].operationId, pending[0].id);
  assert.equal(payloads[0].kind, 'task.create');
  assert.equal(payloads[0].payload.estimatedMinutes, 45);
  assert.equal(payloads[0].payload.dueDate, new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));

  const receiptResponse = await retryConfirmed;
  assert.ok(receiptResponse, 'background retry receives a successful confirmation');
  assert.equal(payloads.length, 2, 'the queued operation is retried once without a second user submission');
  assert.equal(payloads[1].operationId, payloads[0].operationId, 'retry reuses the original idempotency key');
  const remaining = await page.evaluate(operationId => new Promise((resolve, reject) => {
    const request = indexedDB.open('jackyun-offline-workspace', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = () => {
        const rows = read.result.filter(row => row.id === operationId);
        db.close();
        resolve(rows.length);
      };
    };
  }), payloads[0].operationId);
  assert.equal(remaining, 0, 'a matching confirmed receipt clears the local operation');
  assert.deepEqual(pageErrors.map(error => error.message), [], 'the task flow has no uncaught browser errors');
  await context.close();
  console.log(JSON.stringify({ passed: 4, checks: [
    'Quick task uses 16px mobile text and a 44px minimum touch target',
    'Date and duration remain attached to the task payload',
    'Recoverable 503 is queued durably without exposing an error message or losing the task',
    'Background retry reuses the original operation ID without a second user submission',
  ] }));
} finally { await browser.close(); }
