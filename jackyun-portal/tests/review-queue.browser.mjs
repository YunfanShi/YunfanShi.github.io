import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { webpack } = require('next/dist/compiled/webpack/webpack');
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'C:/Users/syf26/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir = path.resolve('artifacts/verification/cue-roadmap/review-fixture'); await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, 'entry.tsx'), `import { createRoot } from 'react-dom/client'; import ReviewSession from '@/components/modules/review/review-session'; import OfflineWorkspaceSync from '@/components/layout/offline-workspace-sync'; (window as any).startSync = () => { const host = document.createElement('div'); document.body.appendChild(host); createRoot(host).render(<OfflineWorkspaceSync userId="fixture-user" />); }; createRoot(document.getElementById('root')!).render(<ReviewSession userId="fixture-user" initialSnapshot={(window as any).snapshot} />);`);
await new Promise((resolve, reject) => webpack({ mode: 'development', devtool: false, entry: path.join(dir, 'entry.tsx'), output: { path: dir, filename: 'bundle.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': path.resolve('src') } }, module: { rules: [{ test: /\.tsx?$/, use: path.resolve('tests/support/typescript-browser-loader.cjs') }] } }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
const server = createServer(async (request, response) => {
  if (request.url === '/bundle.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(await readFile(path.join(dir, 'bundle.js'))); }
  else { response.setHeader('Content-Type', 'text/html'); response.end('<html lang="zh"><meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const reviewItem = id => ({ id, user_id: 'fixture-user', subject: '数学', question_text: `题目 ${id}`, correct_answer: '答案', interval_days: 1, ease_factor: 2.5, streak: 0, status: 'active' });
try {
  for (const total of [0, 50, 51, 120]) {
    const context = await browser.newContext(); const page = await context.newPage();
    let remaining = Array.from({ length: total }, (_, i) => reviewItem(String(i))); let failNext = false;
    const snapshot = () => ({ dueItems: remaining.slice(0, 50), dueCount: remaining.length, activeCount: remaining.length, masteredCount: 0, verifiedAt: new Date().toISOString() });
    await page.addInitScript(seed => window.snapshot = seed, snapshot());
    await page.route('**/api/offline/workspace', async route => { const payload = route.request().postDataJSON().payload; remaining = remaining.filter(item => item.id !== payload.reviewItemId); await route.fulfill({ json: { success: true } }); });
    await page.route('**/api/review/queue', async route => { if (failNext) { failNext = false; await route.fulfill({ status: 503, json: { error: 'fixture outage' } }); } else await route.fulfill({ json: snapshot() }); });
    await page.goto(base);
    const cards = page.getByRole('region', { name: '复习统计' });
    await cards.getByText(String(total), { exact: true }).first().waitFor();
    let completed = 0;
    while (completed < total) {
      const count = Math.min(50, total - completed);
      for (let i = 0; i < count; i++) { const archive = page.getByRole('button', { name: '暂不复习' }); await archive.waitFor(); await archive.click(); completed++; }
      await page.getByRole('heading', { name: '本批复习完成了' }).waitFor();
      assert.equal(await page.getByRole('heading', { name: '今天的复习完成了' }).count(), 0);
      if (total === 51 && completed === 50) {
        failNext = true; await page.getByRole('button', { name: '加载下一批' }).click(); await page.getByRole('alert').waitFor();
        assert.equal(await page.getByRole('heading', { name: '今天的复习完成了' }).count(), 0);
      }
      await page.getByRole('button', { name: completed < total ? '加载下一批' : '复核剩余复习' }).click();
      if (completed < total) await page.getByRole('button', { name: '暂不复习' }).waitFor();
    }
    await page.getByRole('heading', { name: '今天的复习完成了' }).waitFor();
    console.log(`PASS mounted ReviewSession ${total} items, batches, authoritative completion and retry`); await context.close();
  }
  const emptyOfflineContext = await browser.newContext(); const emptyOfflinePage = await emptyOfflineContext.newPage();
  await emptyOfflinePage.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { get: () => false });
    window.snapshot = { dueItems: [], dueCount: 0, activeCount: 0, masteredCount: 0, verifiedAt: new Date().toISOString() };
  });
  await emptyOfflinePage.goto(base);
  await emptyOfflinePage.getByRole('button', { name: '复核剩余复习' }).waitFor();
  assert.equal(await emptyOfflinePage.getByRole('heading', { name: '今天的复习完成了' }).count(), 0, 'offline startup without cache cannot certify cloud completion');
  console.log('PASS offline startup without cache does not certify completion'); await emptyOfflineContext.close();
  const context = await browser.newContext(); const page = await context.newPage();
  await page.addInitScript(seed => window.snapshot = seed, { dueItems: [reviewItem('offline')], dueCount: 1, activeCount: 1, masteredCount: 0, verifiedAt: new Date().toISOString() });
  await page.goto(base); await page.getByRole('button', { name: '暂不复习' }).waitFor();
  await context.setOffline(true); await page.getByRole('button', { name: '暂不复习' }).click();
  await page.getByText('本机已记录，待同步。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '今天的复习完成了' }).count(), 0);
  await context.setOffline(false);
  await page.getByRole('button', { name: '复核剩余复习' }).click(); await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('heading', { name: '今天的复习完成了' }).count(), 0, 'pending outbox still prevents completion after reconnection');
  let offlineRemaining = [reviewItem('offline')];
  await page.route('**/api/offline/workspace', async route => {
    if (route.request().method() === 'POST') { offlineRemaining = []; await route.fulfill({ json: { success: true } }); }
    else await route.fulfill({ json: { tasks: { plans: [], inboxTasks: [] }, reading: {}, review: { dueItems: offlineRemaining, dueCount: offlineRemaining.length, activeCount: offlineRemaining.length, masteredCount: 0, pendingLocal: false, verifiedAt: new Date().toISOString() } } });
  });
  await page.evaluate(() => window.startSync());
  await page.getByRole('heading', { name: '今天的复习完成了' }).waitFor();
  console.log('PASS mounted offline persistence, pending guard, real IndexedDB queue drain and verified snapshot recovery'); await context.close();
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
