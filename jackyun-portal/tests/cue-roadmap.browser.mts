import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createEmptyScheduleState, dateKey, type StudyCue } from '../src/lib/learning/schedule-control.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'C:/Users/syf26/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3100';
const screenshots = process.env.JACKYUN_SCREENSHOT_DIR || 'artifacts/verification/cue-roadmap';
await mkdir(screenshots, { recursive: true });
const now = new Date(); const today = dateKey(now);
const cue = (id: string, subjectId = 'math'): StudyCue => ({ id, subjectId, subjectName: subjectId === 'math' ? '数学' : '英语', unit: '函数', subsection: '', type: 'definition', prompt: `检索 ${id}`, answer: '参考答案', markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), status: 'unclear' });
const state = { ...createEmptyScheduleState(), cues: [cue('one'), cue('two'), cue('three', 'english')], settings: { ...createEmptyScheduleState().settings, tutorialSeenVersion: 1 } };
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript((seed: unknown) => localStorage.setItem('jackyun_schedule_control_v1', JSON.stringify(seed)), state);
    const page = await context.newPage(); const errors: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.goto(base + '/dashboard');
    const board = page.getByRole('region', { name: '今天的 CUE' });
    await board.getByText('待学 2 · 新增／修改 2 · 薄弱 2', { exact: true }).waitFor();
    assert.ok((await board.boundingBox()).y < 230, 'CUE is above the AI section');
    await page.screenshot({ path: `${screenshots}/dashboard-${width}.png`, animations: 'disabled' });
    await board.getByRole('link', { name: '查看待学', exact: true }).first().click();
    const preview = page.getByRole('region', { name: 'CUE 学习预览' });
    await preview.getByText('当前范围 2 条 CUE · 预计 8 分钟。', { exact: true }).waitFor();
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('jackyun_schedule_control_v1')!).cueStudyDrafts);
    assert.equal(Object.keys(before || {}).length, 0, 'preview does not create sessions');
    await preview.getByRole('button', { name: '开始学习', exact: true }).click();
    await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}').cueStudyDrafts || {}).length === 1);
    await page.screenshot({ path: `${screenshots}/study-${width}.png`, animations: 'disabled' });
    assert.deepEqual(errors, []);
    console.log(`PASS CUE dashboard, subject scope, explicit start at ${width}px (${today})`);
    await context.close();
  }
} finally { await browser.close(); }
