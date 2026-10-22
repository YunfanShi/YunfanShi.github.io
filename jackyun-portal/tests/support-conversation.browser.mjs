import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_AUTH_TEST_URL || 'http://127.0.0.1:3150';
const backend = process.env.JACKYUN_UI_BACKEND_URL || 'http://127.0.0.1:54329';
for (const url of [base, backend]) {
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Support regression requires loopback app and fixture');
}
const out = 'artifacts/verification/ui-shell-auth/support';
await mkdir(out, { recursive: true });
const control = payload => fetch(`${backend}/_test/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
const calls = async (method) => (await (await fetch(`${backend}/_test/calls`)).json()).filter(call => call.path === '/rest/v1/support_replies' && call.method === method).length;
const session = await (await fetch(`${backend}/_test/session?role=user`)).json();
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
try {
  for (const width of [1280, 390]) {
    await control({ reset: true, supportEnabled: true, supportReadDelay: 800, supportReadFail: true, supportWriteDelay: 0, supportWriteFail: false });
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: base }]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/sync/v3**', route => route.fulfill({ json: { syncProtocol: 3, records: [], next: null } }));
    await page.goto(`${base}/settings?section=advanced`);
    const opener = page.getByRole('button', { name: /本机客服交互验证/ });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: '本机客服交互验证', exact: true });
    const input = dialog.getByRole('textbox', { name: '客服消息' });
    const send = dialog.getByRole('button', { name: '发送消息', exact: true });
    await dialog.waitFor();
    await dialog.getByRole('region', { name: '客服对话消息' }).getByText('正在载入对话…', { exact: true }).waitFor();
    assert.equal(await send.isDisabled(), true);
    await input.fill('加载期间保留的草稿');
    await dialog.getByText('无法读取这条客服对话。', { exact: true }).waitFor();
    await control({ supportReadDelay: 0, supportReadFail: false });
    await dialog.getByRole('button', { name: '重新加载对话', exact: true }).click();
    await send.waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('[aria-label="发送消息"]')?.disabled);
    assert.equal(await input.inputValue(), '加载期间保留的草稿');

    for (const theme of ['light', 'gray', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const colors = await dialog.evaluate(element => ({ own: getComputedStyle(element).backgroundColor, root: getComputedStyle(document.documentElement).getPropertyValue('--card').trim() }));
      assert.ok(colors.root.length > 0);
      assert.notEqual(colors.own, 'rgba(0, 0, 0, 0)');
    }
    for (let n = 0; n < 8; n++) {
      await page.keyboard.press('Tab');
      assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, 'Tab must remain in the modal');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (width < 768) {
      assert.equal(await input.evaluate(element => getComputedStyle(element).fontSize), '16px');
      const target = await dialog.getByRole('button', { name: '关闭客服对话', exact: true }).boundingBox();
      assert.ok(target.width >= 44 && target.height >= 44);
    }
    await input.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
    assert.equal(await calls('POST'), 0, 'IME confirmation must not send a message');

    await control({ supportWriteDelay: 1000, supportWriteFail: true });
    await input.fill('发送失败仍保留');
    await input.evaluate(element => {
      for (let n = 0; n < 2; n++) element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('[aria-label="发送消息"]')?.getAttribute('aria-busy') === 'true');
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), true, 'pending write must not silently dismiss the draft');
    assert.equal(await dialog.getByRole('button', { name: '关闭客服对话' }).isDisabled(), true);
    await dialog.getByText('Fixture message write unavailable', { exact: true }).waitFor();
    assert.equal(await calls('POST'), 1, 'two immediate Enter events must produce one mutation');
    assert.equal(await input.inputValue(), '发送失败仍保留');

    await control({ supportWriteDelay: 1000, supportWriteFail: false });
    await send.click();
    await input.fill('发送期间继续写的新消息');
    await dialog.getByText('发送失败仍保留', { exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-label="发送消息"]')?.disabled);
    assert.equal(await input.inputValue(), '发送期间继续写的新消息', 'successful earlier write must not clear newer typing');
    assert.equal(await calls('POST'), 2);
    await page.clock.install();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    const reopen = page.getByRole('button', { name: '客服对话', exact: true });
    await reopen.waitFor();
    assert.equal(await reopen.evaluate(element => element === document.activeElement), true);
    const before = await calls('GET');
    await page.clock.fastForward(65_000);
    assert.equal(await calls('GET'), before, 'minimized conversation must stop polling');
    const restoreBox = await reopen.boundingBox();
    assert.ok(restoreBox && restoreBox.y >= 0 && restoreBox.y + restoreBox.height <= 900, `Restore button must stay in the viewport: ${JSON.stringify(restoreBox)}`);
    await reopen.click();
    await dialog.waitFor();
    assert.equal(await input.inputValue(), '发送期间继续写的新消息');

    await dialog.getByRole('button', { name: '关闭客服对话' }).press('Enter');
    await page.waitForTimeout(300);
    const confirm = dialog.getByRole('group', { name: '关闭前保留消息' });
    await confirm.waitFor();
    await page.keyboard.press('Escape');
    await confirm.waitFor({ state: 'hidden' });
    assert.equal(await input.inputValue(), '发送期间继续写的新消息');
    assert.equal(await input.evaluate(element => element === document.activeElement), true);
    await dialog.screenshot({ path: `${out}/support-${width}.png` });
    await dialog.getByRole('button', { name: '关闭客服对话' }).press('Enter');
    await dialog.getByRole('button', { name: '丢弃并关闭', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await opener.evaluate(element => element === document.activeElement), true);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS support ${width}px: immediate loading/error/retry, focus trap/restore, themes, IME, one mutation, failure/newer draft retention, minimize/poll pause and explicit discard`);
  }
} finally {
  await control({ supportEnabled: false, supportReadDelay: 0, supportReadFail: false, supportWriteDelay: 0, supportWriteFail: false, reset: true });
  await browser.close();
}
