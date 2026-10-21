import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.JACKYUN_TEST_URL || 'http://localhost:3153';
const out = process.env.JACKYUN_UI_ARTIFACTS || 'artifacts/verification/navigation-feedback';
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.route('**/schedule**', async route => {
    await new Promise(resolve => setTimeout(resolve, 2500));
    await route.continue().catch(() => {});
  });

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    if (width === 1440) {
      const button = page.locator('.jy-button:visible:not(:disabled)').first();
      const motion = await button.evaluate(element => {
        const style = getComputedStyle(element);
        return { properties: style.transitionProperty, duration: style.transitionDuration };
      });
      assert.ok(motion.properties.includes('transform'), `shared button animates its press/hover feedback: ${JSON.stringify(motion)}`);
      assert.ok(motion.duration.split(',').some(value => Number.parseFloat(value) <= 0.12), `shared button feedback stays short: ${JSON.stringify(motion)}`);
      await button.hover();
      assert.notEqual(await button.evaluate(element => getComputedStyle(element).transform), 'none', 'shared button hover uses a transform-only visual response');
    }
    const schedule = width < 1024
      ? page.locator('nav[aria-label="快捷导航"] a[href="/schedule"]')
      : page.locator('aside nav a[href="/schedule"]').first();
    await schedule.click();
    const toast = page.locator('.jy-navigation-pending');
    await toast.waitFor({ state: 'visible' });
    const geometry = await toast.evaluate(element => {
      const box = element.getBoundingClientRect();
      const iconElement = element.querySelector('.jy-navigation-pending-spinner');
      const icon = iconElement.getBoundingClientRect();
      const close = element.querySelector('.jy-navigation-pending-close').getBoundingClientRect();
      const message = element.querySelector('.jy-navigation-pending-message').getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        toastLeft: box.left,
        toastRight: box.right,
        toastCenter: box.left + box.width / 2,
        iconCenter: icon.top + icon.height / 2,
        messageCenter: message.top + message.height / 2,
        closeCenter: close.top + close.height / 2,
        spinnerBorder: getComputedStyle(iconElement).borderTopWidth,
        toastHeight: box.height,
        animationName: getComputedStyle(element).animationName,
      };
    });
    assert.ok(geometry.toastLeft >= 0 && geometry.toastRight <= width, `toast fits ${width}px viewport: ${JSON.stringify(geometry)}`);
    assert.ok(Math.abs(geometry.toastCenter - width / 2) < 1, `toast is horizontally centered: ${JSON.stringify(geometry)}`);
    assert.ok(Math.abs(geometry.iconCenter - geometry.messageCenter) < 2, `spinner and text align: ${JSON.stringify(geometry)}`);
    assert.equal(geometry.spinnerBorder, '2px', 'CSS spinner is visibly drawn without an icon-font glyph');
    assert.ok(Math.abs(geometry.closeCenter - geometry.messageCenter) < 2, `close button and text align: ${JSON.stringify(geometry)}`);
    assert.equal(geometry.animationName, 'jy-navigation-pending-in');
    if (width === 1440) await page.screenshot({ path: `${out}/navigation-feedback.png` });
    await toast.getByRole('button', { name: '关闭导航提示' }).click();
    assert.equal(await toast.count(), 0, 'toast closes immediately');
  }

  const reducedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.route('**/schedule**', async route => {
    await new Promise(resolve => setTimeout(resolve, 2500));
    await route.continue().catch(() => {});
  });
  await reducedPage.goto(`${base}/settings`, { waitUntil: 'domcontentloaded' });
  await reducedPage.waitForTimeout(500);
  await reducedPage.locator('nav[aria-label="快捷导航"] a[href="/schedule"]').click();
  const reducedToast = reducedPage.locator('.jy-navigation-pending');
  await reducedToast.waitFor({ state: 'visible' });
  assert.equal(await reducedToast.evaluate(element => getComputedStyle(element).animationName), 'none');
  assert.equal(await reducedToast.locator('.jy-navigation-pending-spinner').evaluate(element => getComputedStyle(element).animationName), 'none');
  await reducedContext.close();
  console.log('PASS: centered, vertically aligned navigation feedback at 1440px and 390px; close is immediate; reduced motion disables entry animation.');
} finally {
  await browser.close();
}
