import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.JACKYUN_AUTH_TEST_URL || 'http://localhost:3153';
const backend = 'http://127.0.0.1:54329';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Fixture tests require a loopback application');
const out = process.env.JACKYUN_UI_ARTIFACTS || 'artifacts/verification/ui-shell-auth';
await mkdir(out, { recursive: true });
const control = async body => { assert.equal((await fetch(`${backend}/_test/control`, { method: 'POST', body: JSON.stringify(body) })).ok, true); };
const calls = async () => (await fetch(`${backend}/_test/calls`)).json();
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const checks = [];
async function account(role = 'user', width = 1440) {
  const session = await (await fetch(`${backend}/_test/session?role=${role}`)).json();
  const context = await browser.newContext({ viewport: { width, height: 950 }, hasTouch: width < 1024, serviceWorkers: 'block' });
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: base }]);
  const page = await context.newPage();
  const errors = [];
  const startupNotices = [];
  // The portal also starts its existing cloud sync engine on authenticated
  // pages. Its real Azure endpoint remains outside this local UI fixture, so
  // satisfy only the read-only v3 manifest request with an empty valid page.
  await context.route('**/api/sync/v3**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ syncProtocol: 3, records: [], next: null }) }));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/tools`);
  // This account fixture intentionally does not model the separate Azure sync
  // service. Dismiss any surfaced sync notice with the real user control.
  const startupNotice = page.getByRole('button', { name: '关闭错误提示', exact: true }).first();
  if (await startupNotice.isVisible().catch(() => false)) {
    startupNotices.push(await page.evaluate(() => window.JackyunErrors?.getNotices().map(item => item.code) ?? []));
    await startupNotice.click();
  }
  await page.getByRole('button', { name: '通知，1 条未读', exact: true }).waitFor();
  if (await startupNotice.isVisible().catch(() => false)) {
    startupNotices.push(await page.evaluate(() => window.JackyunErrors?.getNotices().map(item => item.code) ?? []));
    await startupNotice.click();
  }
  return { context, page, errors, startupNotices };
}
try {
  await control({ reset: true });
  const { context, page, errors } = await account();
  const trigger = page.getByRole('button', { name: /^通知/ });
  const activateNotificationTrigger = async () => {
    // The desktop browser may inject an empty error marker that overlaps the
    // top-right toolbar. Use the accessible keyboard path when it is present.
    if (await page.locator('[data-jackyun-errors=""]').count()) {
      await trigger.focus();
      await trigger.press('Enter');
    } else {
      await trigger.click();
    }
  };
  await activateNotificationTrigger();
  let dialog = page.getByRole('dialog', { name: '通知', exact: true });
  await dialog.getByText('本机通知测试', { exact: true }).waitFor();
  await page.keyboard.press('g'); await page.keyboard.press('d');
  assert.equal(new URL(page.url()).pathname, '/tools');
  await control({ historyDelay: 700 });
  await dialog.getByRole('button', { name: '查看历史', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '此页公告与消息历史', exact: true });
  await dialog.getByText('正在加载历史…').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('通知'));
  await activateNotificationTrigger();
  await dialog.getByText('本机历史通知', { exact: true }).waitFor();
  await control({ historyDelay: 0, historyFail: true });
  await dialog.getByRole('button', { name: '查看未读', exact: true }).click();
  await page.getByRole('dialog', { name: '通知', exact: true }).getByRole('button', { name: '查看历史', exact: true }).click();
  await dialog.getByText('历史加载失败，已加载内容仍保留，请重试。').waitFor();
  assert.equal(await dialog.getByText('本机历史通知', { exact: true }).isVisible(), true);
  await control({ historyFail: false });
  await dialog.getByRole('button', { name: '重试历史', exact: true }).click();
  await dialog.getByRole('button', { name: '重试历史', exact: true }).waitFor({ state: 'hidden' });
  checks.push('Authenticated notification history: loading, close/cancel/reopen, failure retains prior page, retry recovers');

  await dialog.getByRole('button', { name: '查看未读', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '通知', exact: true });
  await control({ dismissDelay: 350, dismissFail: true });
  const before = (await calls()).filter(call => call.path === '/rest/v1/notification_dismissals' && call.method === 'POST').length;
  await dialog.getByRole('button', { name: '一键全读', exact: true }).evaluate(button => { button.click(); button.click(); });
  await dialog.getByText('标记失败，通知仍保留，请重试。').waitFor();
  assert.equal(await dialog.getByText('本机通知测试', { exact: true }).isVisible(), true);
  const after = (await calls()).filter(call => call.path === '/rest/v1/notification_dismissals' && call.method === 'POST').length;
  assert.equal(after - before, 1, 'immediate repeated activation sends one dismissal');
  await control({ dismissFail: false, dismissDelay: 0 });
  await dialog.getByRole('button', { name: '一键全读', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('header button[aria-label="通知"]') !== null);
  const snapshotAfterRead = await page.evaluate(async () => { const response = await fetch('/api/notifications/snapshot?reason=initial'); return { status: response.status, body: await response.json() }; });
  if (snapshotAfterRead.body.unreadCount !== 0) throw new Error(`Fixture did not persist read state: ${JSON.stringify(snapshotAfterRead)}`);
  await dialog.getByText('暂无未读通知', { exact: true }).waitFor({ timeout: 3000 });
  checks.push('Real Next Server Action path: immediate repeat guarded, failure retains notification and unlocks, retry marks read');

  await dialog.getByRole('button', { name: '查看历史', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '此页公告与消息历史', exact: true });
  await dialog.locator('.jy-notification-entry').filter({ hasText: '本机历史通知' }).click();
  const detail = page.getByRole('dialog', { name: '本机历史通知', exact: true });
  await detail.getByText('保留原消息内容 2', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-ui-dialog][data-state="open"]')?.contains(document.activeElement));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('通知'));
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.deepEqual(errors, []);
  checks.push('History to Markdown detail keeps focus inside, Escape restores notification trigger without overlapping dialogs');

  await activateNotificationTrigger();
  const historyDialog = page.getByRole('dialog', { name: '此页公告与消息历史', exact: true });
  await historyDialog.waitFor();
  await historyDialog.getByRole('button', { name: '查看未读', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('[data-ui-dialog]') === null);

  const dialogSamples = [];
  for (let sample = 0; sample < 30; sample++) {
    const started = await page.evaluate(() => performance.now());
    await activateNotificationTrigger();
    await page.getByRole('dialog', { name: '通知', exact: true }).waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    dialogSamples.push(await page.evaluate(start => performance.now() - start, started));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[data-ui-dialog]') === null);
  }
  const sortedDialogSamples = [...dialogSamples].sort((a, b) => a - b);
  const dialogP95 = sortedDialogSamples[Math.ceil(sortedDialogSamples.length * 0.95) - 1];
  if (dialogP95 > 200) throw new Error(`Warm local notification dialog P95 ${dialogP95.toFixed(1)}ms exceeds 200ms`);
  checks.push(`Warm local notification dialog reaches open content and two animation frames in P95 ${dialogP95.toFixed(1)}ms (n=30)`);
  await context.close();

  await control({ reset: true });
  const dashboardSession = await account();
  const statsDelay = 1800;
  await control({ reset: true, statsDelay });
  const dashboardStarted = Date.now();
  await dashboardSession.page.goto(`${base}/dashboard`, { waitUntil: 'commit' });
  await dashboardSession.page.getByRole('heading', { name: '探索你的工作台', exact: true }).waitFor();
  await dashboardSession.page.getByRole('link', { name: '工具箱', exact: true }).waitFor();
  const dashboardUsableMs = Date.now() - dashboardStarted;
  let slowCalls = [];
  const slowCallsDeadline = Date.now() + 1500;
  while (Date.now() < slowCallsDeadline) {
    const recorded = await calls();
    slowCalls = recorded.filter(call => call.path === '/rest/v1/study_tasks' && call.method === 'GET'
      || call.path === '/rest/v1/vocab_words' && call.method === 'HEAD');
    if (slowCalls.length >= 2) break;
    await dashboardSession.page.waitForTimeout(25);
  }
  assert.ok(slowCalls.some(call => call.path === '/rest/v1/study_tasks' && call.method === 'GET'), 'study task overview request reached delayed fixture');
  assert.ok(slowCalls.some(call => call.path === '/rest/v1/vocab_words' && call.method === 'HEAD'), 'vocabulary overview request reached delayed fixture');
  const requestStartedAt = Math.min(...slowCalls.map(call => call.at));
  assert.ok(Date.now() - requestStartedAt < statsDelay - 250, 'overview requests are still inside their configured delay');
  assert.ok(dashboardUsableMs < 1000, `dashboard module link appeared in ${dashboardUsableMs}ms`);
  checks.push(`Dashboard module links usable in ${dashboardUsableMs}ms while overview requests remain delayed for ${statsDelay}ms`);
  await dashboardSession.context.close();

  for (const role of ['user', 'admin', 'beta']) {
    await control({ reset: true });
    const session = await account(role);
    assert.equal(await session.page.locator('#portal-navigation a[href="/admin"]').count(), role === 'admin' ? 1 : 0);
    assert.equal(await session.page.locator('#portal-navigation a[href="/beta"]').count(), role === 'beta' ? 1 : 0);
    if (role === 'user') {
      await session.page.goto(`${base}/admin`);
      assert.equal(new URL(session.page.url()).pathname, '/dashboard', 'regular account cannot enter admin');
    }
    assert.deepEqual(session.errors, []);
    await session.context.close();
  }
  checks.push('Regular/admin/BETA fixture identities show only eligible navigation; regular direct admin request redirects');

  for (const width of [390, 1440]) {
    await control({ reset: true, logoutFail: true });
    const { context, page, errors } = await account('user', width);
    await page.waitForTimeout(500);
    for (let notice = 0; notice < 5; notice++) {
      const startupNotice = page.getByRole('button', { name: '关闭错误提示', exact: true }).first();
      if (!await startupNotice.isVisible().catch(() => false)) break;
      await startupNotice.click();
    }
    if (width < 1024) {
      await page.getByRole('button', { name: '更多页面操作' }).click();
      await page.getByRole('menuitem', { name: '退出', exact: true }).click();
    } else await page.getByRole('button', { name: '退出', exact: true }).click();
    const logout = page.getByRole('dialog', { name: '退出登录', exact: true });
    await logout.waitFor();
    assert.equal(await page.getByRole('menu').count(), 0);
    await page.evaluate(() => localStorage.setItem('ui-fixture-unsaved', '保留本机输入'));
    await logout.getByRole('button', { name: '退出登录', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await logout.isVisible(), true, 'pending logout stays visible');
    await logout.getByRole('alert').waitFor({ timeout: 20000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('ui-fixture-unsaved')), '保留本机输入');
    assert.equal(await logout.getByRole('button', { name: '强制退出', exact: true }).isEnabled(), true);
    await logout.getByRole('button', { name: '取消', exact: true }).click();
    await page.waitForFunction(mobile => document.activeElement?.getAttribute('aria-label') === (mobile ? '更多页面操作' : '退出'), width < 1024);
    assert.deepEqual(errors, []);
    await context.close();
  }
  checks.push('Desktop/mobile logout: menu closes, pending Escape guarded, auth failure leaves local data and allows cancel/retry, focus restored');
  await writeFile(`${out}/results.json`, JSON.stringify({ base, checks, measurement: { kind: 'warm local Dialog only; click to visible DialogContent plus two requestAnimationFrame callbacks', samples: dialogSamples, p95Ms: dialogP95, sampleCount: dialogSamples.length, thresholdMs: 200, networkIncluded: false }, limitations: ['Loopback fixture uses real Next proxy, pages, actions and installed Supabase clients; not production Auth or RLS', 'No real cloud or physical devices', 'FeatureKey entitlement matrix is not covered without privileged fixture client'] }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally { await browser.close(); }
