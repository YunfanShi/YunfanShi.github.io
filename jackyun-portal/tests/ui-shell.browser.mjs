import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.JACKYUN_TEST_URL || 'http://localhost:3152';
const out = process.env.JACKYUN_UI_ARTIFACTS || 'artifacts/verification/ui-shell';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const checks = [];
const dismissedNotices = [];
try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 1024, colorScheme: 'dark', serviceWorkers: 'block' });
    await context.addInitScript(() => {
      localStorage.setItem('jackyun_theme', 'light');
      Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // The placeholder backend can display a real, dismissible error notice.
    // Close it through its public control rather than hiding overlays or forcing clicks.
    const closeNotice = page.getByRole('button', { name: '关闭错误提示', exact: true }).first();
    await page.addLocatorHandler(closeNotice, async () => {
      dismissedNotices.push(await page.locator('[data-jackyun-errors]').innerText());
      await closeNotice.click();
    });
    await page.goto(`${base}/tools`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /文本工具/ }).waitFor();
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const menu = page.getByRole('button', { name: '更多页面操作' });
    const drawer = page.getByRole('button', { name: '打开导航菜单' });
    if (width < 1024) {
      await page.waitForFunction(() => document.querySelector('[data-navigation-drawer]')?.inert === true);
      await drawer.click();
      const sidebar = page.locator('[data-navigation-drawer][data-open="true"]');
      await sidebar.waitFor();
      const before = new URL(page.url()).pathname;
      await page.keyboard.press('g'); await page.keyboard.press('d');
      assert.equal(new URL(page.url()).pathname, before, 'global shortcuts must not navigate beneath drawer');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '打开导航菜单');
      await menu.focus(); await page.keyboard.press('ArrowDown');
      await page.getByRole('menu').waitFor();
      await page.keyboard.press('End');
      await page.waitForFunction(() => document.activeElement?.textContent === '全屏');
      await page.keyboard.press('Enter');
      const help = page.getByRole('dialog', { name: '减少浏览器工具栏占用' });
      await help.waitFor();
      assert.equal(await page.getByRole('menu').count(), 0, 'menu closes while help stays mounted');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '更多页面操作');
      await menu.click();
      await page.getByRole('menuitem', { name: '切换到灰色主题' }).click();
    } else {
      assert.equal(await menu.isVisible(), false);
      assert.equal(await drawer.isVisible(), false);
      await page.getByRole('button', { name: '切换到灰色主题' }).click();
      await page.getByRole('button', { name: '全屏', exact: true }).click();
      await page.getByRole('dialog', { name: '减少浏览器工具栏占用' }).waitFor();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '全屏');
    }
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'gray');
    assert.equal(await page.evaluate(() => localStorage.getItem('jackyun_theme')), 'gray');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    const nextTheme = width < 1024 ? page.getByRole('menuitem', { name: '切换到亮色主题' }) : page.getByRole('button', { name: '切换到亮色主题' });
    if (width < 1024) await menu.click();
    await nextTheme.click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}: horizontal overflow`);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${out}/shell-${width}.png` });
    checks.push({ width, result: 'passed', coverage: 'drawer/shortcuts, menu keyboard, fullscreen fallback lifecycle, focus restore, DOM theme hydration, no overflow; guest only' });
    await context.close();
  }
  const storageContext = await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' });
  await storageContext.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) { return key === 'jackyun_nav_usage_pending' ? '{}' : get.call(this, key); };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'jackyun_nav_usage_pending') throw new DOMException('Storage unavailable', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  const storagePage = await storageContext.newPage();
  const storageErrors = [];
  storagePage.on('pageerror', error => storageErrors.push(error.message));
  await storagePage.goto(base + '/tools');
  await storagePage.locator('aside a[href="/resources"]').first().click();
  await storagePage.waitForURL('**/resources');
  await storagePage.getByRole('heading', { name: '学习网站收录', exact: true }).waitFor();
  assert.deepEqual(storageErrors, [], 'corrupt or full navigation analytics storage must not crash the shell');
  checks.push({ width: 1440, result: 'passed', coverage: 'navigation with corrupt analytics queue and storage write failure' });
  await storageContext.close();
  await writeFile(`${out}/results.json`, JSON.stringify({ base, checks, dismissedNotices, limitations: ['Mock guest configuration; authenticated notifications/logout are not covered', 'Desktop Edge emulation; no physical Android/iOS validation', 'Not a production performance measurement'] }, null, 2));
  console.log(JSON.stringify(checks, null, 2));
} finally { await browser.close(); }
