import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_AUTH_TEST_URL || 'http://127.0.0.1:3154';
const backend = process.env.JACKYUN_UI_BACKEND_URL || 'http://127.0.0.1:54329';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Legacy UI regression requires a loopback app');
const session = await (await fetch(`${backend}/_test/session?role=user`)).json();
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const errors = [];
const expectedIsolatedEmbedErrors = [];
const routes = [
  ['/study', '学习计划'],
  ['/goal', '计划显示器'],
  ['/study-guide', 'StudyGuide'],
  ['/vocab', '词汇宝库'],
  ['/answer-sheet', '答题卡'],
  ['/answer-sheet-sync', '同步答题卡'],
  ['/mock-portal', 'Mock Portal 刷题界面'],
  ['/music', '音乐播放器'],
  ['/music-sync', 'Sync Music'],
  ['/bilibili-sync', 'B站同步'],
  ['/relax', '放松一下'],
  ['/help', '帮助中心'],
  ['/poem', '诗词天地'],
  ['/pomodoro', '番茄钟'],
  ['/countdown', '倒计时'],
  ['/examcountdown', '倒计时'],
  ['/igcountdown', '考试倒计时'],
  ['/timetable-hub', '控制中心'],
  ['/control/focus', '专注执行'],
];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768 });
    await context.addInitScript(() => localStorage.setItem('jackyun_theme', 'gray'));
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: base }]);
    const page = await context.newPage();
    let currentRoute = '';
    page.on('pageerror', error => {
      // IGCountdown deliberately sandboxes third-party audio embeds without same-origin access.
      if (error.message.includes("Failed to read the 'localStorage' property from 'Window': The document is sandboxed")) {
        expectedIsolatedEmbedErrors.push(currentRoute);
        return;
      }
      errors.push(`${currentRoute}: ${error.message}`);
    });
    await page.route('**/api/sync/v3**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ syncProtocol: 3, records: [], next: null }) }));
    for (const [route, title] of routes) {
      currentRoute = route;
      let studyGuideLoads = 0;
      if (route === '/study-guide' && width === 1440) {
        await page.route('**/StudyGuide.html', async resource => {
          studyGuideLoads++;
          if (studyGuideLoads === 1) await resource.fulfill({ status: 503, body: 'temporary fixture outage' });
          else await resource.continue();
        });
      }
      const response = await page.goto(`${base}${route}`);
      assert.equal(response?.status(), 200, `${route} must render from its current portal entry`);
      const frame = page.frameLocator(`iframe[title="${title}"]`);
      if (route === '/study-guide' && width === 1440) {
        const error = page.getByRole('alert');
        await error.getByText('页面加载失败：加载失败: HTTP 503', { exact: true }).waitFor();
        await page.screenshot({ path: 'artifacts/verification/legacy-retry-503.png', clip: { x: 255, y: 64, width: 750, height: 700 } });
        await error.getByRole('button', { name: '重试加载页面', exact: true }).click();
      }
      await frame.locator('html[data-legacy-workspace]').waitFor();
      await page.waitForFunction(title => {
        const iframe = Array.from(document.querySelectorAll('iframe')).find(element => element.title === title);
        return iframe?.contentDocument?.readyState === 'complete';
      }, title);
      if (route === '/study-guide' && width === 1440) {
        assert.equal(studyGuideLoads, 2, 'retry must refetch the failed legacy document');
        await page.screenshot({ path: 'artifacts/verification/legacy-retry-success.png' });
        await page.unroute('**/StudyGuide.html');
      }
      await frame.locator('link[href="/shared/device-workspace.css"]').waitFor({ state: 'attached' });
      await frame.locator('link[href^="/jackyun-theme.css"]').waitFor({ state: 'attached' });
      await page.evaluate(() => document.querySelector('iframe')?.contentWindow?.postMessage({ type: 'jackyun-theme', theme: 'dark' }, location.origin));
      await frame.locator('html[data-jy-theme="dark"]').waitFor();
      const themeToken = await frame.locator('html').evaluate(element => getComputedStyle(element).getPropertyValue('--primary').trim());
      assert.notEqual(themeToken, '');
      await page.evaluate(() => document.querySelector('iframe')?.contentWindow?.postMessage({ type: 'jackyun-language', language: 'en' }, location.origin));
      await frame.locator('html[lang="en"]').waitFor();
      await page.evaluate(() => document.querySelector('iframe')?.contentWindow?.postMessage({ type: 'jackyun-language', language: 'zh' }, location.origin));
      await frame.locator('html[lang="zh-CN"]').waitFor();
      if (route === '/study-guide' && width === 1440) {
        const documentToken = `legacy-document-${Date.now()}`;
        await frame.locator('html').evaluate((_, token) => { window.__legacyDocumentToken = token; }, documentToken);
        await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'jackyun_language', newValue: 'en' })));
        await frame.locator('html[lang="en"]').waitFor();
        assert.equal(
          await frame.locator('html').evaluate(() => window.__legacyDocumentToken),
          documentToken,
          'changing the portal language must update the legacy page without remounting its iframe'
        );
        let proxiedLanguage;
        await page.route('**/api/llm-proxy', async proxyRoute => {
          proxiedLanguage = proxyRoute.request().postDataJSON()?.interfaceLanguage;
          await proxyRoute.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        });
        await frame.locator('html').evaluate(() => window.fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'test', messages: [] }),
        }).then(response => response.text()));
        assert.equal(proxiedLanguage, 'en', 'AI proxy requests must use the live language after a switch');
        await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'jackyun_language', newValue: 'zh' })));
        await frame.locator('html[lang="zh-CN"]').waitFor();
        await frame.locator('html').evaluate(() => window.fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'test', messages: [] }),
        }).then(response => response.text()));
        assert.equal(proxiedLanguage, 'zh', 'AI proxy requests must follow the language switched back to Chinese');
        await page.unroute('**/api/llm-proxy');
      }
      if (width < 768) {
        if (route === '/study-guide') {
          await page.evaluate(() => window.JackyunErrors.report({ code: 'SYNC_WRITE_FAILED', message: 'mobile-menu-overlay-regression' }));
          await page.locator('[data-code="JY-2102"]').waitFor();
          await page.getByRole('button', { name: '更多页面操作' }).click();
          await page.getByRole('menuitem', { name: '全屏' }).click();
          await page.waitForFunction(() => Boolean(document.fullscreenElement));
          await page.getByRole('button', { name: '更多页面操作' }).click();
          await page.getByRole('menuitem', { name: '全屏' }).click();
          await page.waitForFunction(() => !document.fullscreenElement);
        }
        const firstButton = frame.locator('button:visible').first();
        if (await firstButton.count()) {
          const target = await firstButton.evaluate(element => ({ minHeight: getComputedStyle(element).minHeight, width: element.getBoundingClientRect().width }));
          assert.ok(parseFloat(target.minHeight) >= 44, `${route} action target must remain touch friendly`);
          assert.ok(target.width > 0);
        }
      }
      console.log(`PASS ${route} theme bridge and ${width}px embedded layout`);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  if (expectedIsolatedEmbedErrors.length) console.log(`PASS ${expectedIsolatedEmbedErrors.length} isolated IGCountdown embed storage errors remain confined by sandbox`);
} finally { await browser.close(); }
