import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3100';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const results = [];
async function discover(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await discover(file);
    else if (entry.name === 'page.tsx') {
      const route = '/' + path.relative('src/app', path.dirname(file)).split(path.sep).filter(part => part && !part.startsWith('(')).join('/');
      if (!route.includes('[')) results.push({ route });
    }
  }
}
await discover('src/app');
for (const entry of await readdir('public')) if (entry.endsWith('.html')) results.push({ route: '/' + entry });
const failures = [];
try {
  let index = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    while (index < results.length) {
      const result = results[index++];
      const errors = [];
      const listen = error => errors.push(error.message);
      page.on('pageerror', listen);
      try {
        const response = await page.goto(base + result.route, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(300);
        result.status = response?.status(); result.finalPath = new URL(page.url()).pathname; result.errors = errors;
        if (result.status >= 500 || errors.length) failures.push(result);
      } catch (error) { result.error = error.message; failures.push(result); }
      page.off('pageerror', listen);
    }
    await context.close();
  }));
  const output = process.env.JACKYUN_PAGE_REPORT || '../docs/workspace-3.5-route-check.json';
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ mode: 'guest, production build, phone viewport; protected pages may redirect to login', count: results.length, failures: failures.length, routes: results }, null, 2));
  console.log(JSON.stringify({ pages: results.length, failures }, null, 2));
  assert.equal(failures.length, 0, 'page status or runtime errors');
} finally { await browser.close(); }
