import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_AUTH_TEST_URL || 'http://127.0.0.1:3154';
const backend = process.env.JACKYUN_UI_BACKEND_URL || 'http://127.0.0.1:54329';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname) || !['localhost', '127.0.0.1'].includes(new URL(backend).hostname)) {
  throw new Error('Admin announcement CRUD regression requires loopback app and fixture');
}
const session = await (await fetch(`${backend}/_test/session?role=admin`)).json();
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const control = async (payload) => fetch(`${backend}/_test/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });

try {
  await control({ reset: true, announcementWriteDelay: 0, announcementWriteFail: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: base }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`${base}/admin/announcements`);
  await page.getByText('暂无符合条件的公告', { exact: true }).waitFor();
  await page.getByRole('button', { name: '新建公告', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: '新建公告' });
  await dialog.waitFor();
  const title = dialog.locator('label').filter({ hasText: /^标题/ }).locator('input');
  const body = dialog.locator('label').filter({ hasText: /^公告内容/ }).locator('textarea');
  await title.fill('本机公告 CRUD 验证');
  await body.fill('验证管理面板创建、编辑与启停行为。');
  await dialog.getByRole('button', { name: '保存公告', exact: true }).click();
  await page.getByRole('status').getByText('公告已保存', { exact: true }).waitFor();

  let item = page.locator('[data-scroll-region] article').filter({ hasText: '本机公告 CRUD 验证' });
  await item.waitFor();
  await item.getByRole('button', { name: '编辑 / 预览', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '编辑公告' });
  await dialog.waitFor();
  await dialog.locator('label').filter({ hasText: /^标题/ }).locator('input').fill('已编辑的本机公告');
  await dialog.locator('label').filter({ hasText: /^公告内容/ }).locator('textarea').fill('编辑后重新读取并显示。');
  await dialog.getByRole('button', { name: '保存公告', exact: true }).click();
  await page.getByRole('status').getByText('公告已保存', { exact: true }).waitFor();

  item = page.locator('[data-scroll-region] article').filter({ hasText: '已编辑的本机公告' });
  await item.waitFor();
  await item.getByRole('button', { name: '停用', exact: true }).click();
  await item.getByText('已停用', { exact: true }).waitFor();
  await item.getByRole('button', { name: '启用', exact: true }).click();
  await item.getByText('展示中', { exact: true }).waitFor();

  await item.getByRole('button', { name: '删除', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-jackyun-dialog="confirm"]')?.shadowRoot?.querySelector('dialog')?.open);
  await page.evaluate(() => {
    const button = [...document.querySelector('[data-jackyun-dialog="confirm"]').shadowRoot.querySelectorAll('button')].find((element) => element.textContent === '取消');
    button.click();
  });
  await item.waitFor();
  await item.getByRole('button', { name: '删除', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-jackyun-dialog="confirm"]')?.shadowRoot?.querySelector('dialog')?.open);
  await page.evaluate(() => {
    const button = [...document.querySelector('[data-jackyun-dialog="confirm"]').shadowRoot.querySelectorAll('button')].find((element) => element.textContent === '确认继续');
    button.click();
  });
  await item.waitFor({ state: 'detached' });

  const stored = await (await fetch(`${backend}/_test/calls`)).json();
  assert.equal(stored.filter((call) => call.path === '/rest/v1/rpc/create_site_notification' && call.method === 'POST').length, 1);
  assert.equal(stored.filter((call) => call.path === '/rest/v1/rpc/update_site_notification' && call.method === 'POST').length, 3, 'edit, disable and enable should each update the same announcement');
  assert.equal(stored.filter((call) => call.path === '/rest/v1/rpc/delete_site_notification' && call.method === 'POST').length, 1, 'only the confirmed delete should reach the server');
  assert.deepEqual(errors, []);
  console.log('PASS admin announcement create, edit, disable, re-enable and confirm/cancel delete against the local stateful fixture');
  await context.close();
} finally {
  await control({ reset: true, announcementWriteDelay: 0, announcementWriteFail: false });
  await browser.close();
}
