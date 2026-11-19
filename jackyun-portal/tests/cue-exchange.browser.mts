import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createCueExchangeBundle } from '../src/lib/learning/cue-exchange.ts';
import { createEmptyScheduleState, type StudyCue } from '../src/lib/learning/schedule-control.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.JACKYUN_BROWSER_EXECUTABLE_PATH
    ? { executablePath: process.env.JACKYUN_BROWSER_EXECUTABLE_PATH }
    : { channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' }),
});
const base = process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3227';
const seed = createEmptyScheduleState();
seed.settings.tutorialSeenVersion = 1;
const local: StudyCue = {
  id: 'cue-original', subjectId: 'math', subjectName: '数学', unit: '函数', subsection: '第一节',
  prompt: '如何判断函数是否单调？', answer: '原答案', type: 'explain', display: 'standard',
  markingPoints: ['原得分点'], status: 'partial', streak: 1, intervalDays: 3, easeFactor: 2.5,
  version: 1, createdAt: '2026-11-10T00:00:00.000Z', updatedAt: '2026-11-10T00:00:00.000Z', nextReviewDate: '2026-12-01',
};
seed.cues = [local];
seed.learningCatalog = [{ id: 'math', name: '数学', units: [{ name: '函数', subsections: [] }], materialProgress: {} }];

try {
  const context = await browser.newContext({ viewport: { width: 420, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const openManager = async () => {
    await page.getByRole('button', { name: '管理 CUE', exact: true }).click();
    return page.getByRole('dialog', { name: '知识 CUE 管理' });
  };

  await page.goto(`${base}/schedule?view=cue`);
  await page.getByRole('region', { name: 'CUE 学习预览' }).waitFor();
  await page.evaluate(async (value) => {
    const persisted = new Promise<void>((resolve) => {
      const onSaved = (event: Event) => {
        if ((event as CustomEvent).detail.state !== 'saved') return;
        window.removeEventListener('jackyun-local-durability', onSaved);
        resolve();
      };
      window.addEventListener('jackyun-local-durability', onSaved);
    });
    localStorage.setItem('jackyun_schedule_control_v1', JSON.stringify(value));
    localStorage.setItem('jackyun_settings_learning_preferences', JSON.stringify({ cueGameEnabled: false, cueShuffle: false }));
    await persisted;
  }, seed);
  await page.reload();
  const manager = await openManager();
  const choice = manager.getByLabel('包含 AI 提示词');
  const copy = manager.getByRole('button', { name: '复制全部科目 CUE JSON' });
  const readClipboard = () => page.evaluate(async () => JSON.parse(await navigator.clipboard.readText()));
  assert.equal(await choice.isChecked(), false);
  await copy.click();
  await manager.getByText('已复制全部 1 张 CUE。', { exact: true }).waitFor();
  assert.equal(Object.hasOwn(await readClipboard(), 'aiPrompt'), false);
  await choice.check();
  await copy.click();
  await manager.getByText('已复制全部 1 张 CUE（含 AI 提示词）。', { exact: true }).waitFor();
  assert.match((await readClipboard()).aiPrompt, /correctChoice/);
  const downloadPromise = page.waitForEvent('download');
  await manager.getByRole('button', { name: '下载 JSON' }).click();
  const download = await downloadPromise;
  const downloadStream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of downloadStream) chunks.push(Buffer.from(chunk));
  assert.match(JSON.parse(Buffer.concat(chunks).toString()).aiPrompt, /jackyun-cue-exchange/);

  await manager.getByRole('button', { name: '导入 CUE 并逐条对比' }).click();
  const dialog = manager.getByRole('dialog', { name: '导入外部 CUE 并逐条对比' });
  const input = dialog.getByLabel('粘贴 CUE JSON');
  const preview = dialog.getByRole('button', { name: '预览粘贴内容' });
  const incoming: StudyCue = { ...local, answer: '用导数的符号判断', status: 'stable', nextReviewDate: '2027-01-01' };
  const payload = JSON.stringify(createCueExchangeBundle([incoming]));
  await input.fill('```json\n' + payload + '\n```');
  await preview.click();
  await dialog.getByText('原答案', { exact: true }).waitFor();
  await dialog.getByText('用导数的符号判断', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: /应用所选操作/ }).isDisabled(), true);
  await input.fill('{');
  await preview.click();
  assert.match(await dialog.getByRole('alert').innerText(), /有效的 JSON/);
  assert.equal(await dialog.locator('article').count(), 0);
  await input.fill(payload);
  await preview.click();
  await dialog.getByLabel('处理方式').selectOption('update');
  await dialog.getByRole('button', { name: /应用所选操作/ }).click();
  await dialog.getByText('已应用：新增 0 张，修改 1 张。').waitFor();

  const external = { ...incoming, id: 'external-new', prompt: '如何判断函数的定义域？', subsection: '第二节' };
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'updated-cues.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(createCueExchangeBundle([external]))),
  });
  await dialog.getByText('第二节', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: /应用所选操作/ }).click();
  await dialog.getByText('已应用：新增 1 张，修改 0 张。').waitFor();
  await page.waitForFunction(() => {
    const stored = JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') ?? '{}');
    return stored.cues?.length === 2;
  });
  await page.reload();
  const reloaded = await openManager();
  await reloaded.getByRole('button', { name: '复制全部科目 CUE JSON' }).click();
  await reloaded.getByText('已复制全部 2 张 CUE。', { exact: true }).waitFor();
  const saved = (await readClipboard()).cues as StudyCue[];
  assert.equal(saved[0].answer, incoming.answer);
  assert.equal(saved[0].status, local.status);
  assert.equal(saved[0].nextReviewDate, local.nextReviewDate);
  assert.equal(saved[1].subsection, external.subsection);
  assert.equal(saved[1].status, undefined);
  assert.notEqual(saved[1].id, external.id);
  assert.deepEqual(pageErrors, []);
  console.log('PASS CUE export, paste/upload comparison and local persistence on a narrow viewport');
  await context.close();
} finally {
  await browser.close();
}
