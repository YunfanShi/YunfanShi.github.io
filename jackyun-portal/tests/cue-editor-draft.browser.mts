import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createEmptyScheduleState } from '../src/lib/learning/schedule-control.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3227';
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const seed = createEmptyScheduleState();
seed.settings.tutorialSeenVersion = 1;
seed.learningCatalog = [{ id: 'math', name: '数学', units: [{ name: '函数', subsections: [] }], materialProgress: {} }];

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(value => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
    localStorage.setItem('jackyun_schedule_control_v1', JSON.stringify(value));
    localStorage.setItem('jackyun_settings_learning_preferences', JSON.stringify({ cueGameEnabled: false, cueShuffle: false }));
  }, seed);
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(`${base}/schedule?view=cue`);
  await page.getByRole('button', { name: 'Cue 管理', exact: true }).click();
  const manager = page.getByRole('dialog', { name: '知识 CUE 管理' });
  await manager.waitFor();
  await manager.locator('form').getByLabel('学科').selectOption('数学');
  await manager.locator('form').getByLabel('大单元').selectOption('函数');
  const prompt = manager.getByLabel('题目大标题');
  await prompt.fill('函数定义只写到一半');
  await page.waitForFunction(() => {
    const raw = sessionStorage.getItem('jackyun_cue_manager_editor_draft_v1');
    return raw && JSON.parse(raw).prompt === '函数定义只写到一半';
  });
  await manager.getByRole('button', { name: '关闭', exact: true }).click();

  await page.getByRole('button', { name: 'Cue 管理', exact: true }).click();
  const reopened = page.getByRole('dialog', { name: '知识 CUE 管理' });
  await assert.equal(await reopened.getByLabel('题目大标题').inputValue(), '函数定义只写到一半');
  assert.match(await reopened.getByRole('status').innerText(), /已恢复上次未保存的 CUE 草稿/u);

  await page.reload();
  await page.getByRole('button', { name: 'Cue 管理', exact: true }).click();
  const afterReload = page.getByRole('dialog', { name: '知识 CUE 管理' });
  assert.equal(await afterReload.getByLabel('题目大标题').inputValue(), '函数定义只写到一半');
  assert.deepEqual(pageErrors, []);
  console.log('PASS partially typed CUE content survives closing the manager and reloading the page');
  await context.close();
} finally {
  await browser.close();
}
