import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

// Run against a local guest workspace. Supply the bundled Playwright path when
// it is not installed locally; no cloud credentials or database writes needed.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const base = process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3100';
const screenshots = process.env.JACKYUN_SCREENSHOT_DIR;
if (screenshots) await mkdir(screenshots, { recursive: true });
let checks = 0;
try {
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [844, 390], [1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 1024 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
    // Next's development indicator occupies the same bottom-left space as Home.
    // Hide development chrome only; uncaught application errors still fail below.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.locator('[data-portal-main]').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}: page overflow`);
    const nav = page.getByRole('navigation', { name: '快捷导航' });
    if (width < 1024) {
      assert.equal(await nav.isVisible(), true);
      const navBox = await nav.boundingBox();
      const aiBox = await page.getByRole('button', { name: '打开 JackYun AI 悬浮窗' }).boundingBox();
      assert.ok(aiBox.y + aiBox.height <= navBox.y, `${width}: AI overlaps navigation`);
      const mainBox = await page.locator('[data-portal-main]').boundingBox();
      assert.ok(mainBox.y + mainBox.height <= navBox.y, `${width}: content behind navigation`);
      await nav.getByRole('button', { name: '全部', exact: true }).click();
      const drawer = page.getByRole('dialog', { name: '全部功能' });
      await drawer.waitFor();
      assert.equal(await page.locator('[data-portal-content]').evaluate((el) => el.inert), true);
      assert.equal(await page.getByRole('button', { name: '关闭导航菜单', exact: true }).evaluate((el) => el === document.activeElement), true);
      await page.getByRole('searchbox', { name: '搜索功能' }).fill('词汇');
      assert.equal(await drawer.getByRole('link').count(), 1);
      await page.getByRole('searchbox', { name: '搜索功能' }).fill('不存在的功能');
      assert.equal(await drawer.getByRole('status').innerText(), '没有找到匹配的功能');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-portal-content]').evaluate((el) => el.inert), false);
      await page.getByRole('button', { name: '打开 JackYun AI 悬浮窗' }).click();
      await page.locator('.portal-mobile-ai-panel').waitFor();
      const panel = await page.locator('.portal-mobile-ai-panel').boundingBox();
      assert.equal(Math.round(panel.width), width);
      assert.equal(Math.round(panel.height), height);
      if (screenshots && width === 390) await page.screenshot({ path: `${screenshots}/mobile-3.4-ai.png` });
      await page.getByRole('button', { name: '关闭 AI 对话窗口' }).click();
      await nav.getByRole('link', { name: '设置', exact: true }).click();
      await page.getByRole('combobox', { name: '设置分类' }).waitFor();
      const categories = page.getByRole('combobox', { name: '设置分类' });
      assert.equal(await categories.locator('option[value="redemption"]').count(), 0);
      await page.getByPlaceholder('搜索设置…').fill('主题');
      assert.equal(await categories.locator('option[value="appearance"]').count(), 1);
      assert.ok(await categories.locator('option').count() <= 2);
      await categories.selectOption('appearance');
      assert.equal(await page.getByRole('heading', { name: '外观', exact: true }).isVisible(), true);
      await page.getByPlaceholder('搜索设置…').fill('');
      // Emulate an iOS keyboard viewport; also exercise Android resizes-content.
      await page.getByPlaceholder('搜索设置…').focus();
      await page.evaluate(() => {
        const viewport = window.visualViewport;
        Object.defineProperty(viewport, 'height', { configurable: true, value: innerHeight - 240 });
        viewport.dispatchEvent(new Event('resize'));
      });
      assert.equal(await nav.isVisible(), false);
      assert.equal(await page.locator('.portal-mobile-ai-launcher').isVisible(), false);
      await page.evaluate(() => {
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: visualViewport.height });
        window.dispatchEvent(new Event('resize'));
      });
      assert.equal(await nav.isVisible(), false);
      await page.evaluate((originalHeight) => {
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
        delete visualViewport.height;
        visualViewport.dispatchEvent(new Event('resize'));
      }, height);
      assert.equal(await nav.isVisible(), true);
      await nav.getByRole('link', { name: '首页', exact: true }).click();
      await page.waitForURL('**/dashboard');
      await page.waitForFunction(() => {
        const content = document.querySelector('[data-portal-main] > .page-enter');
        return content && getComputedStyle(content).opacity === '1';
      });
      assert.equal(await page.locator('[data-portal-main]').evaluate((el) => el.scrollTop), 0);
      if (screenshots) await page.screenshot({ path: `${screenshots}/mobile-3.4-${width}.png` });
      checks += 1;
    } else {
      assert.equal(await nav.isVisible(), false);
      assert.equal(await page.locator('#portal-navigation').isVisible(), true);
      if (screenshots) await page.screenshot({ path: `${screenshots}/mobile-3.4-${width}.png` });
      checks += 1;
    }
    assert.deepEqual(errors, [], `${width}: browser exceptions`);
    await page.close();
    console.log(`PASS ${width} × ${height}`);
  }
  console.log(`PASS ${checks} viewport scenarios with responsive and interaction checks`);
} finally {
  await browser.close();
}
