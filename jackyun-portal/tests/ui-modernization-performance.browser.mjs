import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const output = process.argv[3] || 'artifacts/verification/ui-modernization/performance.json';
fs.mkdirSync(path.dirname(output), { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3150') + '/tools');
    await page.getByPlaceholder('在此输入文本...').waitFor();
    await page.getByPlaceholder('在此输入文本...').fill('draft baseline');
    const tab = async name => (await page.getByRole('tab', { name, exact: true }).count()) ? page.getByRole('tab', { name, exact: true }) : page.getByRole('button', { name: new RegExp(name + '$') });
    await (await tab('时间同步')).click();
    await page.getByText('Unix 时间戳', { exact: true }).waitFor();
    await (await tab('文本工具')).click();
    const draftRetained = await page.getByPlaceholder('在此输入文本...').inputValue() === 'draft baseline';
    const samples = [];
    for (let i = 0; i < 50; i++) {
      await page.evaluate(() => {
        window.__sample = null;
        document.addEventListener('pointerdown', () => {
          const start = performance.now();
          const check = () => {
            const ready = [...document.querySelectorAll('p,span')].some(el => el.textContent === 'Unix 时间戳' && el.getClientRects().length);
            if (ready) requestAnimationFrame(() => requestAnimationFrame(() => { window.__sample = performance.now() - start; }));
            else requestAnimationFrame(check);
          };
          check();
        }, { once: true, capture: true });
      });
      await (await tab('时间同步')).click();
      await page.waitForFunction(() => window.__sample !== null);
      samples.push(await page.evaluate(() => window.__sample));
      await (await tab('文本工具')).click();
    }
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('/_next/') && r.name.includes('.js')).map(r => ({ url: new URL(r.name).pathname, transferSize: r.transferSize, encodedBodySize: r.encodedBodySize })));
    const sorted = [...samples].sort((a,b) => a-b);
    const result = { mode: process.argv[2] || 'baseline', browser: browser.version(), viewport: '1440x1000', node: process.version, environment: 'Windows desktop; production webpack; anonymous; placeholder Supabase; no CPU/network throttling; service workers blocked', metric: 'Pointerdown capture to required time-panel DOM visible plus two RAFs; lab frame proxy, not actual presentation trace or INP', samples, median: sorted[24], p95: sorted[47], max: sorted[49], draftRetained, resources, totalEncodedJSBytes: resources.reduce((s,r)=>s+r.encodedBodySize,0), errors };
    fs.writeFileSync(output, JSON.stringify(result,null,2));
    await page.screenshot({ path: output.replace('.json','.png'), fullPage: true });
    console.log(JSON.stringify({ ...result, samples: undefined, resources: undefined }));
    await context.close();
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
