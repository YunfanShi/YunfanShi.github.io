import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_AUTH_TEST_URL || 'http://127.0.0.1:3154';
const backend = process.env.JACKYUN_UI_BACKEND_URL || 'http://127.0.0.1:54329';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Admin UI smoke test requires a loopback app');
const session = await (await fetch(`${backend}/_test/session?role=admin`)).json();
const routes = ['/admin', '/admin/users', '/admin/content', '/admin/ai', '/admin/network', '/admin/tickets', '/admin/announcements', '/admin/access', '/admin/system', '/admin/enforcer', '/admin/update-hub'];
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768 });
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: base }]);
    await context.route('**/api/sync/v3**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ syncProtocol: 3, records: [], next: null }) }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const route of routes) {
      const response = await page.goto(`${base}${route}`);
      assert.equal(response?.status(), 200, `${route} should render for the admin fixture`);
      assert.equal(new URL(page.url()).pathname, route, `${route} should remain accessible to the admin fixture`);
      const nav = page.getByRole('navigation', { name: '后台导航', exact: true });
      await nav.locator(`a[href="${route}"]`).first().waitFor({ state: 'attached' });
      assert.ok(await nav.locator(`a[href="${route}"][aria-current="page"]`).count() >= 1, `${route} should be marked current in admin navigation`);
      await page.locator('[data-scroll-region]').waitFor();
      const content = await page.locator('[data-scroll-region]').innerText();
      assert.doesNotMatch(content, /管理员页面暂时无法加载|暂时无法加载运营数据|服务未配置|内容加载失败/, `${route} should not fall back to an admin service error`);
      if (route === '/admin') assert.match(content, /用户总数/, 'dashboard overview should render a valid empty fixture payload');
      if (width === 390) {
        const undersizedControls = await page.locator('.admin-shell :is(button, [role="button"], summary, input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select)').evaluateAll(elements => elements
          .filter(element => {
            const style = getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0 && element.getBoundingClientRect().height < 44;
          })
          .map(element => ({ tag: element.tagName, text: element.textContent?.trim().slice(0, 40), height: element.getBoundingClientRect().height })));
        assert.deepEqual(undersizedControls, [], `${route} should keep visible touch controls at least 44px high`);
      }
      console.log(`PASS ${route} admin shell and route navigation at ${width}px`);
    }
    assert.deepEqual(errors, [], `admin pages should not throw client exceptions at ${width}px`);
    await context.close();
  }

  for (const role of ['user', 'beta']) {
    const unauthorizedSession = await (await fetch(`${backend}/_test/session?role=${role}`)).json();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(unauthorizedSession)).toString('base64url')}`, url: base }]);
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(`${base}${route}`);
      assert.equal(new URL(page.url()).pathname, '/dashboard', `${role} fixture must be redirected from ${route}`);
    }
    await context.close();
  }

  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const guestPage = await guestContext.newPage();
  await guestPage.goto(`${base}/admin/tickets`);
  assert.equal(new URL(guestPage.url()).pathname, '/login', 'guest must be redirected to login before admin routes render');
  assert.equal(new URL(guestPage.url()).searchParams.get('next'), '/admin/tickets');
  await guestContext.close();
  console.log('PASS all admin routes reject regular/BETA fixtures and preserve guest next path');
} finally {
  await browser.close();
}
