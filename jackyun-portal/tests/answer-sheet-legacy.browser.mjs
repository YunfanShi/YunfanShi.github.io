import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_AUTH_TEST_URL || 'http://127.0.0.1:3154';
const backend = process.env.JACKYUN_UI_BACKEND_URL || 'http://127.0.0.1:54329';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Answer sheet regression requires a loopback app');
const session = await (await fetch(`${backend}/_test/session?role=user`)).json();
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const errors = [];
const draft = {
  assessmentName: '迁移回归练习', subjectName: 'Physics', subjectCode: '0625', paperNum: '22',
  year: '2026', session: 'M/J', duration: '45 分钟', numQ: '4', options: 'ABCD',
  answers: 'ABCD', enableVerify: false, answersRepeat: '', enableKey: true, rawMS: '', answerKey: 'ABAD',
};

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768 });
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: base }]);
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${width}px: ${error.message}`));
    await page.route('**/api/sync/v3**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ syncProtocol: 3, records: [], next: null }) }));
    await page.goto(`${base}/manifest.json`);
    await page.evaluate((value) => localStorage.setItem('jackyun_answer_sheet_draft_v1', JSON.stringify(value)), draft);
    await page.goto(`${base}/answer-sheet`);
    let frame = page.frameLocator('iframe[title="答题卡"]');
    await frame.locator('html[data-legacy-workspace]').waitFor();
    await frame.locator('#assessmentName').waitFor();
    assert.equal(await frame.locator('#assessmentName').inputValue(), draft.assessmentName, 'saved assessment title should restore');
    assert.equal(await frame.locator('#answers').inputValue(), draft.answers, 'saved answers should restore');
    assert.equal(await frame.locator('#answerKey').inputValue(), draft.answerKey, 'saved answer key should restore');

    await frame.getByRole('button', { name: /生成答题卡/ }).click();
    const preview = frame.locator('#sheetWrapper');
    await preview.getByText('3 / 4', { exact: true }).waitFor();
    assert.match(await preview.innerText(), /迁移回归练习/);
    assert.match(await preview.innerText(), /75%/);

    // Remount the legacy iframe via route navigation; the unsent input draft remains recoverable.
    await page.goto(`${base}/tools`);
    await page.goto(`${base}/answer-sheet`);
    frame = page.frameLocator('iframe[title="答题卡"]');
    await frame.locator('html[data-legacy-workspace]').waitFor();
    assert.equal(await frame.locator('#assessmentName').inputValue(), draft.assessmentName);
    assert.equal(await frame.locator('#answers').inputValue(), draft.answers);
    console.log(`PASS answer sheet draft restore, generation and iframe remount at ${width}px`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
