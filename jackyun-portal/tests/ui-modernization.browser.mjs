import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const JSZip = require('jszip');
const base = process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3150';
const out = process.env.JACKYUN_UI_ARTIFACTS || 'artifacts/verification/ui-modernization';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const checks = [];
const pass = name => checks.push(name);
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    const start = window.setInterval, stop = window.clearInterval;
    window.__uiIntervals = new Map();
    window.setInterval = (fn, delay, ...args) => { const id = start(fn, delay, ...args); window.__uiIntervals.set(id, delay); return id; };
    window.clearInterval = id => { window.__uiIntervals.delete(id); stop(id); };
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/_next/static/chunks/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.continue().catch(() => {});
  });
  await page.goto(base + '/tools', { waitUntil: 'domcontentloaded' });
  const panel = () => page.getByRole('tabpanel');
  const tab = name => page.getByRole('tab', { name, exact: true });
  await page.getByLabel('输入文本', { exact: true }).fill('JackYun 草稿');
  await page.getByText('10 字符', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('输入文本', { exact: true }).inputValue(), 'JackYun 草稿', 'text typed before client chunks hydrate is preserved');
  await context.unroute('**/_next/static/chunks/**');
  await page.getByRole('button', { name: '转大写', exact: true }).click();
  assert.equal(await page.getByLabel('输出结果').inputValue(), 'JACKYUN 草稿');
  await tab('文本工具').focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await tab('文本工具').getAttribute('aria-selected'), 'true');
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'tab' && document.activeElement?.textContent.includes('时间同步'));
  await page.keyboard.press('Enter');
  await page.getByLabel('Unix 时间戳', { exact: true }).fill('1717200000');
  await panel().getByRole('button', { name: '转换', exact: true }).first().click();
  await panel().getByText('2024-06-01 00:00:00 UTC', { exact: true }).waitFor();
  await panel().getByRole('button', { name: '东京 (JST)', exact: true }).click();
  const timeIntervals = await page.evaluate(() => [...window.__uiIntervals.values()].filter(n => n === 1000).length);
  await tab('文本工具').click();
  assert.equal(await page.getByLabel('输入文本', { exact: true }).inputValue(), 'JackYun 草稿');
  assert.equal(await page.getByLabel('输出结果').inputValue(), 'JACKYUN 草稿');
  assert.equal(await page.getByLabel('Unix 时间戳', { exact: true }).count(), 0);
  const hiddenIntervals = await page.evaluate(() => [...window.__uiIntervals.values()].filter(n => n === 1000).length);
  assert.equal(hiddenIntervals, timeIntervals - 1);
  await tab('时间同步').click();
  assert.equal(await page.getByLabel('Unix 时间戳', { exact: true }).inputValue(), '1717200000');
  assert.equal(await panel().getByRole('button', { name: '东京 (JST)', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByLabel('Unix 时间戳', { exact: true }).fill('1e100');
  await panel().getByRole('button', { name: '转换', exact: true }).first().click();
  await panel().getByText('无效的 Unix 时间戳', { exact: true }).waitFor();
  pass('Text/time drafts and outputs survive unmount; manual keyboard tabs; hidden clock interval removed; invalid range handled');

  await tab('学习与日常').click();
  await page.getByLabel('总页数', { exact: true }).fill('245');
  await tab('文本工具').click(); await tab('学习与日常').click();
  assert.equal(await page.getByLabel('总页数', { exact: true }).inputValue(), '245');
  pass('Study calculator session inputs survive switching');

  await tab('剪贴板').click();
  await page.getByLabel('文本内容', { exact: true }).fill('保留我的输入');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => { throw new Error('denied'); }, writeText: async () => { throw new Error('denied'); } } }));
  await panel().getByRole('button', { name: '粘贴', exact: true }).click();
  await panel().getByRole('alert').getByText(/原文本已保留/).waitFor();
  assert.equal(await page.getByLabel('文本内容', { exact: true }).inputValue(), '保留我的输入');
  await page.evaluate(() => {
    window.__pasteCalls = 0;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: () => { window.__pasteCalls++; return new Promise(resolve => { window.__pasteResolve = resolve; }); } } });
  });
  await panel().getByRole('button', { name: '粘贴', exact: true }).dblclick();
  assert.equal(await page.evaluate(() => window.__pasteCalls), 1);
  await page.getByLabel('文本内容', { exact: true }).fill('较新的输入');
  await page.evaluate(() => window.__pasteResolve('过期剪贴板'));
  await page.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'));
  assert.equal(await page.getByLabel('文本内容', { exact: true }).inputValue(), '较新的输入');
  await panel().getByRole('button', { name: '粘贴', exact: true }).click();
  await tab('文本工具').click(); await page.evaluate(() => window.__pasteResolve('已隐藏的响应'));
  await tab('剪贴板').click();
  assert.equal(await page.getByLabel('文本内容', { exact: true }).inputValue(), '较新的输入');
  await panel().getByRole('button', { name: '清空', exact: true }).click();
  await page.getByRole('dialog', { name: '清空剪贴板文本', exact: true }).waitFor();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await page.getByLabel('文本内容', { exact: true }).inputValue(), '较新的输入');
  pass('Mocked clipboard denial retains input; duplicate read blocked; edited/hidden stale responses ignored; native confirmation cancel preserves text');

  const exportChunks = [];
  const serverHtml = await (await fetch(base + '/tools')).text();
  const chunkDirectory = serverHtml.includes('turbopack') ? '.next/dev/static/chunks' : '.next/static/chunks';
  const runtimeChunks = await readdir(chunkDirectory, { recursive: true });
  for (const file of runtimeChunks) {
    if (!file.endsWith('.js')) continue;
    const source = await readFile(`${chunkDirectory}/${file}`, 'utf8');
    if (source.includes('由 Markdown 转换生成的 Word 文档')) exportChunks.push('/_next/static/chunks/' + file.replaceAll('\\', '/'));
  }
  assert.ok(exportChunks.length > 0, 'Find the actual browser export chunk for the lazy-load assertion');
  await tab('Markdown 转 Word').click();
  await page.getByLabel('Markdown 编辑', { exact: true }).fill('# UI 回归\n\n保留导出内容\n\n| 项目 | 状态 |\n| --- | --- |\n| 草稿 | 保留 |');
  await page.getByLabel('输出文件名').fill('UI回归文档');
  await panel().locator('input[type=file]').setInputFiles({ name: 'ui-fixture.md', mimeType: 'text/markdown', buffer: Buffer.from('# UI 回归\n\n保留导出内容\n\n| 项目 | 状态 |\n| --- | --- |\n| 草稿 | 保留 |') });
  await panel().getByText('已选择: ui-fixture.md', { exact: true }).waitFor();
  await tab('文本工具').click(); await tab('Markdown 转 Word').click();
  assert.equal(await page.getByLabel('输出文件名').inputValue(), 'UI回归文档');
  assert.match(await page.getByLabel('Markdown 编辑', { exact: true }).inputValue(), /保留导出内容/);
  await panel().getByText('已选择: ui-fixture.md', { exact: true }).waitFor();
  assert.equal(await page.evaluate(chunks => performance.getEntriesByType('resource').some(r => chunks.includes(new URL(r.name).pathname)), exportChunks), false);
  const downloaded = page.waitForEvent('download');
  await panel().getByRole('button', { name: /下载为 \.docx$/ }).click();
  const download = await downloaded;
  assert.equal(download.suggestedFilename(), 'UI回归文档.docx');
  const zip = await JSZip.loadAsync(await readFile(await download.path()));
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /保留导出内容/); assert.match(xml, /<w:tbl>/);
  assert.equal(await page.evaluate(chunks => performance.getEntriesByType('resource').some(r => chunks.includes(new URL(r.name).pathname)), exportChunks), true);
  pass('Markdown drafts retained; export chunk fetched only on download; real generated DOCX contains expected paragraphs and table');

  await tab('文本工具').click();
  for (const theme of ['light', 'gray', 'dark']) {
    await page.evaluate(t => { document.documentElement.dataset.theme = t; document.documentElement.style.colorScheme = t === 'light' ? 'light' : 'dark'; }, theme);
    await page.getByRole('button', { name: '使用说明', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '工具箱使用说明' });
    await dialog.waitFor();
    const colors = await dialog.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
    assert.notEqual(colors.background, colors.color);
    await page.keyboard.press('g'); await page.keyboard.press('d');
    assert.equal(new URL(page.url()).pathname, '/tools');
    for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true); }
    await page.screenshot({ path: `${out}/dialog-${theme}.png` });
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    await page.waitForFunction(() => document.activeElement?.textContent === '使用说明');
    assert.equal(await page.getByRole('button', { name: '使用说明', exact: true }).evaluate(el => el === document.activeElement), true);
  }
  pass('Three root themes, modal focus trap/restore, Escape, global shortcut suppression');
  // A nested theme is the difficult Portal case; fullscreen must contain the overlay.
  await page.evaluate(() => { const root = document.querySelector('[role="tablist"]').parentElement.parentElement; root.dataset.theme = 'dark'; });
  await page.getByRole('button', { name: '使用说明', exact: true }).click();
  assert.equal(await page.getByRole('dialog', { name: '工具箱使用说明' }).evaluate(el => el.closest('[data-theme]')?.getAttribute('data-theme')), 'dark');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const button = document.createElement('button'); button.id = 'ui-fullscreen-test'; button.textContent = '进入测试全屏';
    button.onclick = () => document.querySelector('[data-portal-main]').requestFullscreen();
    document.body.append(button);
  });
  await page.locator('#ui-fullscreen-test').click();
  await page.getByRole('button', { name: '使用说明', exact: true }).click();
  assert.equal(await page.getByRole('dialog', { name: '工具箱使用说明' }).evaluate(el => document.fullscreenElement?.contains(el)), true);
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
  await page.locator('#ui-fullscreen-test').evaluate(el => el.remove());
  pass('Nested-theme and fullscreen Portal container');

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(base + '/tools');
  await mobilePage.getByRole('tab', { name: '剪贴板', exact: true }).tap();
  await mobilePage.getByLabel('文本内容', { exact: true }).waitFor();
  await mobilePage.getByRole('tab', { name: '文本工具', exact: true }).tap();
  await mobilePage.getByLabel('输入文本', { exact: true }).fill('移动端草稿');
  await mobilePage.getByText('5 字符', { exact: true }).waitFor();
  for (const trigger of await mobilePage.getByRole('tab').all()) {
    const box = await trigger.boundingBox();
    assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= 390);
  }
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await mobilePage.getByLabel('输入文本', { exact: true }).evaluate(el => getComputedStyle(el).fontSize), '16px');
  assert.ok(await mobilePage.getByRole('tab', { name: '文本工具', exact: true }).evaluate(el => getComputedStyle(el).transitionDuration.split(',').every(value => parseFloat(value) <= 0.001)));
  await mobilePage.getByRole('tab', { name: '剪贴板', exact: true }).tap();
  await mobilePage.getByLabel('文本内容', { exact: true }).waitFor();
  await mobilePage.getByRole('tab', { name: '文本工具', exact: true }).tap();
  await mobilePage.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.includes('文本工具'));
  assert.equal(await mobilePage.getByLabel('输入文本', { exact: true }).inputValue(), '移动端草稿');
  await mobilePage.screenshot({ path: `${out}/tools-mobile.png`, fullPage: true });
  await mobileContext.close();
  pass('Fresh 390px mobile/touch context, visible 44px targets, tap switching, 16px entry, reduced motion; emulation only');
  await context.setOffline(true);
  await tab('剪贴板').click(); await tab('文本工具').click();
  assert.equal(await page.getByLabel('输入文本', { exact: true }).inputValue(), 'JackYun 草稿');
  await context.setOffline(false);
  pass('Already loaded panels remain usable offline without clearing session drafts');
  await page.goto(base + '/admin');
  assert.match(new URL(page.url()).pathname, /login|unauthorized/);
  pass('Anonymous admin access still redirected');
  const cold = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const coldPage = await cold.newPage();
  const timeChunk = runtimeChunks.find(file => file.endsWith('.js') && file.includes('time-sync') && file.includes('tsx'));
  assert.ok(timeChunk, 'Find the actual lazy time-sync chunk for the retry regression');
  let allowTimeChunk = false;
  await coldPage.route(`**/_next/static/chunks/${timeChunk.replaceAll('\\', '/')}**`, async route => {
    if (!allowTimeChunk) await route.abort('failed');
    else await route.continue();
  });
  // Dismiss unrelated background notices as a user would so the lazy-panel
  // retry flow only observes the targeted chunk failure.
  const closeNotice = coldPage.getByRole('button', { name: '关闭错误提示', exact: true }).first();
  await coldPage.addLocatorHandler(closeNotice, async () => { await closeNotice.click(); });
  await coldPage.goto(base + '/tools');
  await coldPage.getByRole('button', { name: '使用说明', exact: true }).click();
  await coldPage.getByRole('dialog', { name: '工具箱使用说明' }).waitFor();
  await coldPage.keyboard.press('Escape');
  await coldPage.getByLabel('输入文本', { exact: true }).fill('加载失败也保留');
  await coldPage.getByRole('tab', { name: '时间同步', exact: true }).click();
  const retryPanel = coldPage.getByRole('tabpanel', { name: '时间同步' }).getByRole('button', { name: '重试加载', exact: true });
  await coldPage.removeLocatorHandler(closeNotice);
  await retryPanel.waitFor();
  await coldPage.getByRole('tab', { name: '文本工具', exact: true }).click();
  assert.equal(await coldPage.getByLabel('输入文本', { exact: true }).inputValue(), '加载失败也保留');
  await coldPage.getByRole('tab', { name: '时间同步', exact: true }).click();
  allowTimeChunk = true;
  await retryPanel.click();
  await coldPage.getByLabel('Unix 时间戳', { exact: true }).waitFor();
  pass('Targeted lazy chunk failure stays inside the panel; other drafts survive; retry loads a fresh wrapper');
  await cold.close();
  assert.deepEqual(errors, []);
  await writeFile(`${out}/results.json`, JSON.stringify({ browser: browser.version(), checks, pageErrors: errors, limits: ['Anonymous local mode with placeholder environment', 'Clipboard error/race cases mocked; DOCX download real', 'No live backend sync or physical Android/iOS validation', 'Offline test covers already loaded modules, not first offline chunk download'] }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks }));
  await context.close();
} finally { await browser.close(); }
