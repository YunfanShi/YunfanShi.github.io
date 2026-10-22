import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_AUTH_TEST_URL || 'http://127.0.0.1:3154';
const backend = process.env.JACKYUN_UI_BACKEND_URL || 'http://127.0.0.1:54329';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname) || !['localhost', '127.0.0.1'].includes(new URL(backend).hostname)) {
  throw new Error('Music player state regression requires loopback app and fixture');
}

const session = await (await fetch(`${backend}/_test/session?role=user`)).json();
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768 });
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: base }]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addLocatorHandler(page.locator('[data-jackyun-errors]:empty'), async marker => marker.evaluate(element => element.remove()));
    await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route('https://f.m.suning.com/api/ct.do**', route => {
      const callback = new URL(route.request().url()).searchParams.get('callback');
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: `${callback}({ currentTime: Date.now() })` });
    });

    await page.goto(`${base}/music`);
    // The desktop automation environment may inject an empty diagnostic layer;
    // it has no user-facing content and can otherwise intercept iframe clicks.
    await page.evaluate(() => document.querySelector('[data-jackyun-errors]:empty')?.remove());
    const frame = page.frameLocator('iframe[title="音乐播放器"]');
    await frame.locator('html[data-legacy-workspace]').waitFor();
    await frame.locator('#list-el').waitFor();
    await frame.locator('#inp-id').fill('ui-modernization-track');
    await frame.locator('#inp-name').fill('UI 状态回归歌曲');
    await frame.getByRole('button', { name: '添加单曲 (Add Song)' }).click();
    const track = frame.locator('#list-el .item').filter({ hasText: 'UI 状态回归歌曲' });
    await track.waitFor();

    try { await frame.locator('button[title="Settings"]').click({ timeout: 2500 }); } catch (error) {
      console.error('music error notices', JSON.stringify(await page.evaluate(() => window.JackyunErrors?.getNotices?.())));
      throw error;
    }
    const settings = frame.locator('#settings-modal');
    await settings.waitFor({ state: 'visible' });
    await settings.locator('.radio-opt').filter({ hasText: '30s' }).click();
    await settings.locator('.offset-ctrl button').filter({ hasText: '+10' }).click();
    await settings.locator('h3 span').click();
    await settings.waitFor({ state: 'hidden' });
    await frame.locator('#btn-mode').click();

    const persisted = await page.evaluate(() => ({
      songs: JSON.parse(localStorage.getItem('v45_songs') || '[]'),
      interval: Number(localStorage.getItem('v45_interval')),
      manual: Number(localStorage.getItem('v45_manual')),
      mode: localStorage.getItem('v45_mode'),
    }));
    assert.deepEqual(persisted.songs.map(song => [song.id, song.name]), [['ui-modernization-track', 'UI 状态回归歌曲']]);
    assert.equal(persisted.interval, 30000);
    assert.equal(persisted.manual, 10);
    assert.equal(persisted.mode, 'loop_one');

    await page.goto(`${base}/dashboard`);
    await page.goto(`${base}/music`);
    await frame.locator('#list-el .item').filter({ hasText: 'UI 状态回归歌曲' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('v45_mode')), 'loop_one');
    assert.deepEqual(errors, [], 'music playlist and timing settings should survive iframe remount without browser errors');
    console.log(`PASS music playlist, interval, offset and play mode survive iframe remount at ${width}px`);
    await context.close();
  }
} finally {
  await browser.close();
}
