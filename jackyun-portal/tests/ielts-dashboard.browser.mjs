import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_TEST_URL || 'http://localhost:3150';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('IELTS UI regression requires a loopback app');
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
await context.addInitScript(() => {
  if (!sessionStorage.getItem('ui-ielts-initialized')) {
    localStorage.clear();
    localStorage.setItem('jackyun_theme', 'light');
    sessionStorage.setItem('ui-ielts-initialized', 'true');
  }
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${base}/ielts`);
  await page.getByRole('heading', { name: '雅思备考工作台', exact: true }).waitFor();

  const examDate = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('目标总分').fill('7.5');
  await page.getByLabel('考试日期').fill(examDate);
  await page.getByLabel('每周可用时间 · 小时').fill('6');
  await page.getByRole('button', { name: '保存目标', exact: true }).click();
  await page.getByText('目标已保存。', { exact: true }).waitFor();
  const savedGoal = await page.evaluate(() => JSON.parse(localStorage.getItem('jackyun_ielts_goal_v1') || 'null'));
  assert.equal(savedGoal.overall, 7.5);
  assert.equal(savedGoal.examDate, examDate);

  const cycle = page.locator('#weekly-cycle');
  await cycle.getByRole('heading', { name: '第 1 轮 · 五个弹性模块' }).waitFor();
  const listeningCard = cycle.locator('article').filter({ hasText: '在雅思哥完成练习；网站只记录错因和下一步。' });
  const listeningRecord = listeningCard.getByRole('button', { name: '未开始 · 记录' });
  assert.equal(await listeningRecord.getAttribute('aria-expanded'), 'false');
  const recordHeight = await listeningRecord.evaluate(element => element.getBoundingClientRect().height);
  assert.ok(recordHeight >= 44, 'cycle record controls meet the mobile touch target');
  await listeningRecord.click();
  assert.equal(await listeningCard.getByRole('button', { name: '未开始 · 记录' }).getAttribute('aria-expanded'), 'true');
  const listeningStatus = cycle.getByRole('group', { name: '听力模块状态' });
  const activeStatus = listeningStatus.getByRole('button', { name: '进行中' });
  const statusHeight = await activeStatus.evaluate(element => element.getBoundingClientRect().height);
  assert.ok(statusHeight >= 44, 'cycle status controls meet the mobile touch target');
  await activeStatus.click();
  assert.equal(await activeStatus.getAttribute('aria-pressed'), 'true');
  await page.getByLabel('雅思哥材料 / 题目').fill('Listening Test 3');
  await page.getByLabel('本次证据 / 具体问题').fill('同义替换没识别');
  await page.getByLabel('下一次只做什么').fill('换一段 Section 3 验证');
  await listeningStatus.getByRole('button', { name: '已完成' }).click();

  const readingCard = cycle.locator('article').filter({ hasText: '在雅思哥限时完成；同时记录正确但慢的题。' });
  await readingCard.getByRole('button', { name: '未开始 · 记录' }).click();
  await cycle.getByRole('group', { name: '阅读模块状态' }).getByRole('button', { name: '进行中' }).click();
  await page.getByLabel('雅思哥材料 / 题目').fill('Reading Passage 1');
  await page.getByLabel('本次证据 / 具体问题').fill('两道题定位超时');
  await page.getByLabel('下一次只做什么').fill('新文章限时重做定位');
  await cycle.getByRole('button', { name: '开始下一轮' }).click();
  await cycle.getByRole('heading', { name: '第 2 轮 · 五个弹性模块' }).waitFor();
  await page.waitForFunction(() => {
    const current = JSON.parse(localStorage.getItem('jackyun_ielts_flexible_cycle_v1') || 'null');
    const history = JSON.parse(localStorage.getItem('jackyun_ielts_flexible_cycle_history_v1') || '[]');
    return current?.cycle === 2 && current.modules.reading.material === 'Reading Passage 1' && history.length === 1;
  });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jackyun_ielts_flexible_cycle_v1') || 'null').modules.listening.status), 'todo', 'completed module starts fresh in the next cycle');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jackyun_ielts_flexible_cycle_v1') || 'null').modules.reading.carried), true, 'unfinished module is carried into the next cycle');

  await page.getByLabel('材料或题目').fill('本机 UI 回归 · Listening Test 3');
  await page.getByLabel('具体错因').fill('Section 3 同义替换没识别');
  await page.getByLabel('下一次如何验证').fill('换一段 Section 3 连续听后核对');
  await page.getByLabel('用时 · 分钟').fill('42');
  await page.getByLabel('评分 · 可选').fill('7');
  await page.getByRole('button', { name: '保存练习与复盘', exact: true }).click();
  await page.getByText('练习和复盘已记录。', { exact: true }).waitFor();
  const savedPractices = await page.evaluate(() => JSON.parse(localStorage.getItem('jackyun_ielts_practice_v1') || '[]'));
  assert.equal(savedPractices.length, 1);
  assert.equal(savedPractices[0].minutes, 42);
  assert.equal(savedPractices[0].issue, 'Section 3 同义替换没识别');

  await page.reload();
  await page.getByRole('heading', { name: '雅思备考工作台', exact: true }).waitFor();
  await page.getByText('本机 UI 回归 · Listening Test 3', { exact: false }).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jackyun_ielts_goal_v1') || 'null').overall), 7.5);
  await page.locator('#weekly-cycle').getByRole('heading', { name: '第 2 轮 · 五个弹性模块' }).waitFor();
  const restoredReading = page.locator('#weekly-cycle').locator('article').filter({ hasText: '在雅思哥限时完成；同时记录正确但慢的题。' });
  await restoredReading.getByRole('button', { name: '进行中 · 记录' }).click();
  assert.equal(await page.getByLabel('雅思哥材料 / 题目').inputValue(), 'Reading Passage 1', 'carried learning draft survives a page reload');
  await restoredReading.getByText('顺延', { exact: true }).waitFor();

  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'jackyun_ielts_practice_v1') throw new DOMException('quota exceeded', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.getByLabel('材料或题目').fill('失败保存时保留输入');
  await page.getByLabel('下一次如何验证').fill('保存空间恢复后重试');
  await page.getByRole('button', { name: '保存练习与复盘', exact: true }).click();
  await page.getByText('保存失败，请检查浏览器存储空间。', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('材料或题目').inputValue(), '失败保存时保留输入');
  assert.equal(await page.getByLabel('下一次如何验证').inputValue(), '保存空间恢复后重试');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jackyun_ielts_practice_v1') || '[]').length), 1);

  for (const theme of ['light', 'gray', 'dark']) {
    const colors = await page.evaluate(value => {
      document.documentElement.dataset.theme = value;
      const root = getComputedStyle(document.documentElement);
      const button = document.querySelector('button[type="submit"]');
      return { theme: document.documentElement.dataset.theme, brand: root.getPropertyValue('--brand').trim(), button: getComputedStyle(button).backgroundColor };
    }, theme);
    assert.equal(colors.theme, theme);
    assert.ok(colors.brand);
    assert.notEqual(colors.button, 'rgba(0, 0, 0, 0)');
  }
  const inputStyle = await page.getByLabel('材料或题目').evaluate(element => ({ fontSize: getComputedStyle(element).fontSize, minHeight: getComputedStyle(element).minHeight }));
  assert.equal(inputStyle.fontSize, '16px', 'mobile input avoids browser zoom on focus');
  assert.ok(parseFloat(inputStyle.minHeight) >= 44, 'shared input keeps a touch-sized target');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: 7, checks: [
    'Goal form saves validated local goal through shared Input and Button',
    'Flexible cycle status and evidence fields retain completed-versus-carried semantics across rounds and reloads',
    'Cycle controls expose expanded/pressed state and 44px mobile targets',
    'Practice evidence saves with existing localStorage shape and survives reload',
    'Storage failure retains user input and existing saved evidence',
    'Shared controls render across light, gray and dark data-theme values',
    '390px mobile input keeps 16px text and 44px minimum touch height',
  ] }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
