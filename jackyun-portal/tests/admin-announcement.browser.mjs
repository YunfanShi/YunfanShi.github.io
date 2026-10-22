import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_AUTH_TEST_URL || 'http://127.0.0.1:3154';
const backend = process.env.JACKYUN_UI_BACKEND_URL || 'http://127.0.0.1:54329';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname) || !['localhost', '127.0.0.1'].includes(new URL(backend).hostname)) {
  throw new Error('Admin announcement regression requires loopback app and fixture');
}

const session = await (await fetch(`${backend}/_test/session?role=admin`)).json();
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const control = async (payload) => fetch(`${backend}/_test/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });

try {
  await control({ reset: true, announcementWriteDelay: 500, announcementWriteFail: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: base }]);
  const page = await context.newPage();
  page.setDefaultTimeout(5_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`${base}/admin/announcements`);
  await page.getByText('暂无符合条件的公告', { exact: true }).waitFor();
  await page.getByRole('button', { name: '新建公告', exact: true }).waitFor();
  await page.getByRole('button', { name: '新建公告', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建公告' });
  await dialog.waitFor();
  const title = dialog.locator('label').filter({ hasText: /^标题/ }).locator('input');
  const body = dialog.locator('label').filter({ hasText: /^公告内容/ }).locator('textarea');
  await title.fill('故障恢复草稿验证');
  await body.fill('保存失败时，这段内容应保留，供管理员重试。');
  const save = dialog.getByRole('button', { name: '保存公告', exact: true });
  await save.click();
  const saving = dialog.getByRole('button', { name: '保存中…', exact: true });
  await saving.waitFor();
  assert.equal(await saving.isDisabled(), true, 'save button should be disabled while the server action is pending');
  await dialog.getByRole('alert').filter({ hasText: 'Fixture announcement write unavailable' }).waitFor();
  assert.equal(await title.inputValue(), '故障恢复草稿验证', 'failed save should retain the title');
  assert.equal(await body.inputValue(), '保存失败时，这段内容应保留，供管理员重试。', 'failed save should retain the body');

  const calls = await (await fetch(`${backend}/_test/calls`)).json();
  assert.equal(calls.filter((call) => call.path === '/rest/v1/rpc/create_site_notification' && call.method === 'POST').length, 1, 'pending submission should produce one server mutation');
  assert.deepEqual(errors, [], 'failed save should not crash the admin page');
  await context.close();
  console.log('PASS admin announcement form keeps the draft after a failed save and sends one mutation');
} finally {
  await control({ reset: true, announcementWriteDelay: 0, announcementWriteFail: false });
  await browser.close();
}
