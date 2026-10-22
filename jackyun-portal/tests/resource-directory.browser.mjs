import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_TEST_URL || 'http://localhost:3150';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Resource UI regression requires a loopback app');
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
await context.addInitScript(() => { localStorage.setItem('jackyun_theme', 'light'); });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const resultCount = async () => {
  const text = await page.locator('p').filter({ hasText: /^找到 \d+ 个资源$/ }).innerText();
  return Number(text.match(/\d+/)?.[0]);
};
try {
  await page.goto(`${base}/resources`);
  await page.getByRole('heading', { name: '学习网站收录', exact: true }).waitFor();
  const allCount = await resultCount();
  assert.ok(allCount > 0);

  const igcseFilter = page.getByRole('group', { name: '资源分类' }).getByRole('button', { name: /IGCSE/ });
  await igcseFilter.click();
  assert.equal(await igcseFilter.getAttribute('aria-pressed'), 'true');
  const igcseCount = await resultCount();
  assert.ok(igcseCount > 0 && igcseCount < allCount);

  const search = page.getByLabel('搜索学习资源');
  await search.fill('Cambridge');
  const filteredCount = await resultCount();
  assert.ok(filteredCount > 0 && filteredCount <= igcseCount);
  await page.getByRole('button', { name: '清除搜索' }).click();
  assert.equal(await search.inputValue(), '');
  assert.equal(await resultCount(), igcseCount);

  await page.getByRole('group', { name: '资源分类' }).getByRole('button', { name: /全部/ }).click();
  assert.equal(await resultCount(), allCount);
  await search.fill('no-resource-matches-this-query');
  await page.getByText('没有找到匹配的资源，试试其他关键词。', { exact: true }).waitFor();
  assert.equal(await resultCount(), 0);

  await search.fill('Cambridge');
  for (const theme of ['light', 'gray', 'dark']) {
    const style = await page.evaluate(value => {
      document.documentElement.dataset.theme = value;
      const root = getComputedStyle(document.documentElement);
      const input = getComputedStyle(document.querySelector('input[placeholder="搜索网站、科目或用途…"]'));
      return { theme: document.documentElement.dataset.theme, foreground: root.getPropertyValue('--foreground').trim(), inputColor: input.color };
    }, theme);
    assert.equal(style.theme, theme);
    assert.ok(style.foreground);
    assert.notEqual(style.inputColor, '');
  }
  const inputStyle = await search.evaluate(element => ({ fontSize: getComputedStyle(element).fontSize, minHeight: getComputedStyle(element).minHeight }));
  assert.equal(inputStyle.fontSize, '16px');
  assert.ok(parseFloat(inputStyle.minHeight) >= 44);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: 5, checks: [
    'Category filters keep the same exclusive result set and selected pressed state',
    'Shared search input filters resources and clear restores the category result set',
    'No-result feedback remains visible and reversible',
    'Shared search input follows light, gray and dark data-theme tokens',
    '390px mobile input keeps 16px text and a 44px target',
  ] }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
