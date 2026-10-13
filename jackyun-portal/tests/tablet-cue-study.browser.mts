import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createEmptyScheduleState, type StudyCue } from '../src/lib/learning/schedule-control.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.JACKYUN_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.JACKYUN_TEST_URL || 'http://localhost:3115';
const out = process.env.JACKYUN_SCREENSHOT_DIR || 'artifacts/verification/tablet-cue-study';
const baseline = process.env.JACKYUN_CAPTURE_BASELINE === '1';
await mkdir(out, { recursive: true });
const now = '2026-10-13T04:00:00.000Z';
const seed = createEmptyScheduleState();
seed.settings.tutorialSeenVersion = 1;
seed.cues = ['one', 'two'].map((id): StudyCue => ({ id, subjectId: 'math', subjectName: '数学', unit: '函数', subsection: '', type: 'definition', prompt: `平板测试 ${id} 解释函数的定义`, answer: '每个输入对应唯一输出。', markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: now, updatedAt: now, status: 'unclear' }));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const results: unknown[] = [];
try {
  for (const [width, height, touch] of [[768,1024,true],[820,1180,true],[1024,768,true],[1366,1024,true],[900,900,false],[390,844,true],[1440,900,false]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, timezoneId: 'Asia/Shanghai' });
    await context.addInitScript(value => {
      if (!localStorage.getItem('jackyun_schedule_control_v1')) localStorage.setItem('jackyun_schedule_control_v1', JSON.stringify(value));
      localStorage.setItem('jackyun_settings_learning_preferences', JSON.stringify({ cueGameEnabled: true, cueShuffle: false }));
    }, seed);
    const page = await context.newPage(); const errors: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date(now));
    await page.goto(base + '/schedule?view=cue&subject=math&filter=due');
    await page.getByRole('region', { name: 'CUE 学习预览' }).getByRole('button', { name: '开始学习', exact: true }).click({ timeout: 60000 });
    const session = page.getByRole('dialog').filter({ has: page.locator('[data-cue-study-content]') });
    await session.waitFor();
    const card = session.getByRole('region', { name: '触屏学习卡片' });
    const desktop = session.locator('[data-cue-study-stage]');
    const geometry = await session.evaluate(el => {
      const main = el.querySelector<HTMLElement>('[data-cue-study-content]')!;
      const card = el.querySelector<HTMLElement>('[aria-label="触屏学习卡片"]')!;
      const stage = el.querySelector<HTMLElement>('[data-cue-study-stage]')!;
      return { mainHeight: main.getBoundingClientRect().height, cardDisplay: getComputedStyle(card.parentElement!).display, stageDisplay: getComputedStyle(stage).display };
    });
    await page.screenshot({ path: `${out}/${baseline ? 'before' : 'after'}-${width}-${touch ? 'touch' : 'pointer'}.png`, animations: 'disabled' });
    results.push({ mode: 'cue', width, height, touch, geometry, touchCardVisible: await card.isVisible(), desktopVisible: await desktop.isVisible(), errors });
    if (!baseline) {
      const touchLayout = width < 1024 || touch;
      assert.equal(await card.isVisible(), touchLayout, `touch card at ${width}`);
      assert.equal(await desktop.isVisible(), !touchLayout, `desktop stage at ${width}`);
      assert.ok(geometry.mainHeight > 100, `study area has usable height at ${width}`);
      async function assertContentAboveBackground() {
        const foreground = touchLayout ? card : desktop;
        const box = await foreground.boundingBox();
        assert.ok(box);
        const point = { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 80) };
        const covered = await session.evaluate((root, point) => {
          const background = root.querySelector<HTMLElement>('[data-cue-universe-background]');
          if (!background) return false;
          const previous = background.style.pointerEvents;
          background.style.pointerEvents = 'auto';
          try { return background.contains(document.elementFromPoint(point.x, point.y)); }
          finally { background.style.pointerEvents = previous; }
        }, point);
        assert.equal(covered, false, `background must paint behind CUE content at ${width}`);
      }
      await assertContentAboveBackground();
      if (touchLayout) {
        await card.getByRole('button', { name: '翻到答案页', exact: true }).click();
        await card.getByText('每个输入对应唯一输出。', { exact: true }).waitFor();
        await session.getByRole('button', { name: '√ 通过', exact: true }).click();
        const resized = { width: height, height: width };
        await page.setViewportSize(resized);
        assert.equal(await card.isVisible(), resized.width < 1024 || touch, 'orientation preserves correct card');
        if (touch) await assertContentAboveBackground();
        await page.setViewportSize({ width, height });
      }
      await session.getByRole('button', { name: '退出 Cue 学习并保存进度' }).click();
      await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('jackyun_schedule_control_v1') || '{}').cueStudyDrafts || {}).length > 0);
      await page.reload();
      await page.getByRole('region', { name: 'CUE 学习预览' }).getByRole('button', { name: '继续学习', exact: true }).click();
      await session.waitFor();
      assert.equal(await card.isVisible(), touchLayout, 'resume remains visible');
      await assertContentAboveBackground();
      if (touchLayout) assert.equal(await session.getByRole('button', { name: '√ 通过', exact: true }).getAttribute('aria-pressed'), 'true', 'rating survives reload');
      await session.getByRole('button', { name: '退出 Cue 学习并保存进度' }).click();
      assert.deepEqual(errors, [], 'no browser runtime errors');
      if (touch && width >= 1024) {
        const question = { id: 'q1', subjectId: 'math', subjectName: '数学', unit: '函数', subsection: '', type: 'written', prompt: '写出一个函数的例子。', choices: [], correctChoices: [], answer: '例如 y = x。', markingPoints: [], linkedCueIds: [], code: 'MA-001', version: 1, createdAt: now, updatedAt: now };
        const mixed = { schemaVersion: 1, questions: [question], attempts: [], reviews: {}, drafts: { 'tablet-mixed': { id: 'tablet-mixed', mode: 'mixed', task: { key: 'tablet-mixed', title: '平板混合学习', detail: '', type: 'special', date: '2026-10-13', durationMinutes: 10, subjectId: 'math', subjectName: '数学' }, items: [{ kind: 'cue', id: 'one' }, { kind: 'question', id: 'q1' }], index: 0, revealed: {}, responses: {}, assessments: {}, updatedAt: now } } };
        await page.evaluate(value => localStorage.setItem('jackyun_schedule_questions_v1', JSON.stringify(value)), mixed);
        await page.goto(base + '/schedule?view=cue&draft=tablet-mixed');
        await page.getByRole('region', { name: 'CUE 学习预览' }).getByRole('button', { name: '继续学习', exact: true }).click();
        const unified = page.getByRole('dialog', { name: '学习会话' });
        await unified.waitFor();
        const prompt = unified.locator('main article').first();
        const box = await prompt.boundingBox(); assert.ok(box);
        const covered = await unified.evaluate((root: HTMLElement, point: { x: number; y: number }) => {
          const background = root.querySelector<HTMLElement>('[data-cue-universe-background]');
          if (!background) throw new Error('Expected universe background in landscape mixed study');
          const previous = background.style.pointerEvents; background.style.pointerEvents = 'auto';
          try { return background.contains(document.elementFromPoint(point.x, point.y)); }
          finally { background.style.pointerEvents = previous; }
        }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
        assert.equal(covered, false, 'mixed study content paints above background');
        await unified.screenshot({ path: `${out}/mixed-${width}-touch.png`, animations: 'disabled' });
        await unified.getByRole('button', { name: '查看参考答案', exact: true }).click();
        await unified.getByRole('group', { name: '触控掌握评价' }).getByRole('button', { name: '√ 稳定掌握', exact: true }).click();
        await unified.getByRole('button', { name: '下一项', exact: true }).click();
        await unified.getByRole('textbox', { name: '我的作答', exact: true }).fill('y = x');
        await unified.getByRole('button', { name: '提交作答并查看答案', exact: true }).click();
        await unified.getByRole('group', { name: '触控掌握评价' }).getByRole('button', { name: '√ 稳定掌握', exact: true }).click();
        await unified.getByRole('button', { name: '退出并保存', exact: true }).click();
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jackyun_schedule_questions_v1')!).drafts['tablet-mixed']);
        assert.equal(saved.assessments['cue:one'], 'stable');
        assert.equal(saved.assessments['question:q1'], 'stable');
        assert.equal(saved.responses['question:q1'].submitted, true);
        assert.deepEqual(errors, [], 'mixed study has no browser errors');
        results.push({ mode: 'mixed', width, height, touch, contentAboveBackground: true, cueAndQuestionAssessmentsSaved: true, errors });
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`${out}/${baseline ? 'baseline' : 'results'}.json`, JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results, null, 2));
