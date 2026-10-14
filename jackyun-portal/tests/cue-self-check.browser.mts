import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createEmptyScheduleState, type StudyCue } from '../src/lib/learning/schedule-control.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3234';
const out = 'artifacts/verification/cue-self-check'; await mkdir(out, { recursive: true });
const seed = createEmptyScheduleState(); seed.settings.tutorialSeenVersion = 1;
seed.cues = [{ id: 'selfcheck', subjectId: 'math', subjectName: '数学', unit: '均值', subsection: '', type: 'definition', prompt: 'How do you calculate the mean?', answer: 'Sum values and divide by count', markingPoints: ['Sum values', 'Divide by count'], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: '2026-10-14T04:00:00Z', updatedAt: '2026-10-14T04:00:00Z', status: 'unclear' } as StudyCue];
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const results = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, hasTouch: width === 390 });
    await context.addInitScript(value => { localStorage.setItem('jackyun_schedule_control_v1', JSON.stringify(value)); localStorage.setItem('jackyun_settings_learning_preferences', JSON.stringify({ cueGameEnabled: false, cueShuffle: false })); }, seed);
    const page = await context.newPage(); const errors: string[] = []; page.on('pageerror', (e: Error) => errors.push(e.message));
    let requests = 0, fail = false;
    await page.route('**/api/llm-proxy', async route => {
      requests++;
      await route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(fail ? { error: '测试服务暂不可用' } : { choices: [{ message: { content: JSON.stringify({ summary: '相加步骤正确，仍需补上除以个数。', similarity: 60, points: [{ index: 0, covered: true, similarity: 100, reason: '已包含相加', evidence: 'Sum values' }, { index: 1, covered: false, similarity: 0, reason: '缺少除法', evidence: '' }] }) } }] }) });
    });
    await page.goto(base + '/schedule?view=cue&subject=math&filter=due');
    await page.getByRole('region', { name: 'CUE 学习预览' }).getByRole('button', { name: '开始学习', exact: true }).click({ timeout: 60000 });
    await page.keyboard.press('~');
    const panel = page.getByRole('complementary', { name: 'CUE 答题卡' });
    const input = panel.getByRole('textbox', { name: 'CUE 我的作答' });
    await input.fill('Sum values');
    await panel.getByRole('button', { name: '写完了，对照答案' }).click();
    const checks = panel.getByRole('checkbox');
    await checks.nth(0).waitFor(); assert.equal(await checks.nth(0).isChecked(), true); assert.equal(await checks.nth(1).isChecked(), false);
    assert.equal(requests, 0); assert.ok(await panel.locator('mark').count() > 0);
    await checks.nth(0).uncheck(); await panel.getByRole('button', { name: '重新对照答案' }).click(); assert.equal(await checks.nth(0).isChecked(), false);
    await panel.getByRole('button', { name: 'AI 辅助自查并勾选 MS' }).click();
    await panel.getByText('AI 辅助评价', { exact: false }).waitFor(); assert.equal(requests, 1); assert.equal(await checks.nth(0).isChecked(), true); assert.equal(await checks.nth(1).isChecked(), false);
    fail = true; await panel.getByRole('button', { name: 'AI 辅助自查并勾选 MS' }).click(); await panel.getByRole('alert').waitFor(); assert.equal(await checks.nth(0).isChecked(), true);
    await page.screenshot({ path: `${out}/self-check-${width}.png`, animations: 'disabled' });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}'));
    assert.deepEqual(stored.cueAnswerCards[0].comparison.checkedPoints, [0]); assert.deepEqual(errors, []);
    results.push({ width, requests, autoLocal: true, manualPreserved: true, ai: true, errorFallback: true, errors });
    await context.close();
  }
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
} finally { await browser.close(); }
