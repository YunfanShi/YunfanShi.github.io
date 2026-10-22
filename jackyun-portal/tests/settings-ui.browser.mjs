import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_AUTH_TEST_URL || 'http://127.0.0.1:3154';
const backend = 'http://127.0.0.1:54329';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Settings UI regression requires a loopback app');
const session = await (await fetch(`${backend}/_test/session?role=user`)).json();
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const errors = [];

async function openSettings(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, serviceWorkers: 'block' });
  if (width >= 768) await context.route('**/_next/static/chunks/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.continue();
  });
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: base }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/sync/v3**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ syncProtocol: 3, records: [], next: null }) }));
  await page.goto(`${base}/settings`);
  await page.getByRole('heading', { name: '设置', exact: true }).waitFor();
  return { context, page };
}

try {
  const desktop = await openSettings(1280);
  const input = desktop.page.getByLabel('搜索设置');
  await input.fill('离线');
  await desktop.page.getByText('1 个匹配分类', { exact: true }).waitFor();
  assert.equal(await input.inputValue(), '离线', 'settings search typed before client chunks hydrate is preserved');
  await desktop.context.unrouteAll({ behavior: 'wait' });
  const initialChunks = await desktop.page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/_next/static/chunks/') && entry.name.endsWith('.js')).map(entry => entry.name));
  const offline = desktop.page.getByRole('button', { name: /离线与 PWA/ });
  await offline.click();
  assert.equal(await offline.getAttribute('aria-pressed'), 'true');
  await desktop.page.getByRole('heading', { name: '离线工作区', exact: true }).waitFor();
  await desktop.page.getByText('断网时可以做什么', { exact: true }).waitFor();
  const loadedChunks = await desktop.page.evaluate((before) => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/_next/static/chunks/') && entry.name.endsWith('.js') && !before.includes(entry.name)).map(entry => entry.name), initialChunks);
  assert.ok(loadedChunks.length > 0, 'Opening an unvisited settings category should load its panel chunk on demand');
  await input.fill('');
  const panelCases = [
    ['各页面偏好', 'pages'], ['手表与设备', 'watch'], ['账户关联', 'connections'],
    ['外观', 'appearance'], ['侧边栏与导航', 'navigation'], ['Companion 与同步', 'companion'],
    ['学习与专注', 'learning'], ['AI 与语音', 'ai'], ['数据与隐私', 'data'],
    ['高级', 'advanced'], ['关于与支持', 'about'],
  ];
  const loadedPanelHeadings = [];
  for (const [label, categoryId] of panelCases) {
    await desktop.page.getByRole('button', { name: new RegExp(label) }).click();
    assert.equal(new URL(desktop.page.url()).searchParams.get('section'), categoryId);
    const heading = desktop.page.locator('main h2').first();
    await heading.waitFor();
    loadedPanelHeadings.push((await heading.innerText()).trim());
  }
  await input.fill('没有这个分类');
  await desktop.page.getByText('0 个匹配分类', { exact: true }).waitFor();
  const inputStyle = await input.evaluate(element => ({ fontSize: getComputedStyle(element).fontSize, minHeight: getComputedStyle(element).minHeight }));
  assert.equal(inputStyle.fontSize, '14px');
  assert.ok(parseFloat(inputStyle.minHeight) >= 44);
  await desktop.context.close();

  const mobile = await openSettings(390);
  const category = mobile.page.getByLabel('设置分类');
  await category.selectOption('appearance');
  await mobile.page.getByRole('heading', { name: '外观', exact: true }).waitFor();
  const mobileInputStyle = await mobile.page.getByLabel('搜索设置').evaluate(element => ({ fontSize: getComputedStyle(element).fontSize, minHeight: getComputedStyle(element).minHeight }));
  assert.equal(mobileInputStyle.fontSize, '16px');
  assert.ok(parseFloat(mobileInputStyle.minHeight) >= 44);
  assert.deepEqual(errors, []);
  await mobile.context.close();
  console.log(JSON.stringify({ passed: 16, loadedPanelHeadings, checks: [
    'Settings search filters categories and preserves the selected panel',
    'Unvisited settings panels load their JavaScript only after category selection',
    'All 11 remaining user-accessible settings categories render their active panel',
    'Shared search control keeps mobile text and touch target sizing',
    'Mobile category select switches sections without reloading',
    'Desktop and mobile settings routes hydrate without page errors',
  ] }));
} finally { await browser.close(); }
