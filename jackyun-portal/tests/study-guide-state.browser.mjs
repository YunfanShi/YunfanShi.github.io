import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_AUTH_TEST_URL || 'http://127.0.0.1:3154';
const backend = process.env.JACKYUN_UI_BACKEND_URL || 'http://127.0.0.1:54329';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname) || !['localhost', '127.0.0.1'].includes(new URL(backend).hostname)) {
  throw new Error('StudyGuide state regression requires loopback app and fixture');
}

const session = await (await fetch(`${backend}/_test/session?role=user`)).json();
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Shanghai' });
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: base }]);
  const page = await context.newPage();
  const errors = [];
  await page.addInitScript(() => localStorage.setItem('jackyun_theme', 'light'));
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)\//, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(`${base}/study-guide`);
  let frame = page.frameLocator('iframe[title="StudyGuide"]');
  await frame.locator('html[data-studyguide-ready="true"]').waitFor();
  await frame.locator('.nav-item[data-tab="today"]').waitFor();

  const todayNav = frame.locator('.nav-item[data-tab="today"]');
  assert.ok(await todayNav.evaluate(element => element.getBoundingClientRect().height >= 44), 'StudyGuide primary navigation stays touch sized');
  for (const theme of ['light', 'gray', 'dark']) {
    await page.evaluate(themeName => {
      localStorage.setItem('jackyun_theme', themeName);
      document.querySelector('iframe[title="StudyGuide"]').contentWindow.postMessage({ type: 'jackyun-theme', theme: themeName }, location.origin);
    }, theme);
    await frame.locator(`html[data-jy-theme="${theme}"]`).waitFor();
    const primaryColor = await frame.locator('html').evaluate(element => getComputedStyle(element).getPropertyValue('--md-primary').trim());
    assert.ok(primaryColor, `StudyGuide receives the ${theme} primary token`);
  }

  const firstChecklist = frame.locator('.checklist-item[role="button"]').first();
  await firstChecklist.click();
  await firstChecklist.getByText('已完成', { exact: true }).waitFor();
  const savedAfterCheck = await page.evaluate(() => JSON.parse(localStorage.getItem('studyguide_progress') || '{}'));
  assert.ok(Object.values(savedAfterCheck.checklists || {}).some(group => Object.values(group).some(Boolean)), 'checking a StudyGuide action should persist in the existing local storage format');

  await frame.locator('.nav-item[data-tab="exam"]').click();
  const examName = frame.locator('#examPlanName');
  await examName.fill('Year 12 Mock');
  await frame.locator('#examPlanDate').fill('2030-06-15');
  await frame.locator('#examPlanType').selectOption('alevel');
  await frame.locator('#examPlanScope').fill('Pure 1, Chapter 4–7');
  assert.ok(await examName.evaluate(element => element.getBoundingClientRect().height >= 44), 'exam-plan inputs stay touch sized');
  await frame.locator('.nav-item[data-tab="learn"]').click();
  await frame.locator('.nav-item[data-tab="exam"]').click();
  assert.equal(await frame.locator('#examPlanName').inputValue(), 'Year 12 Mock', 'switching StudyGuide tabs keeps the unsaved exam-plan draft');
  assert.equal(await frame.locator('#examPlanType').inputValue(), 'alevel');

  await page.goto(`${base}/dashboard`);
  await page.goto(`${base}/study-guide`);
  frame = page.frameLocator('iframe[title="StudyGuide"]');
  await frame.locator('.nav-item[data-tab="exam"].active').waitFor();
  assert.equal(await frame.locator('#examPlanScope').inputValue(), 'Pure 1, Chapter 4–7', 'iframe remount keeps the session-only exam-plan draft');

  await frame.locator('html').evaluate(element => {
    const view = element.ownerDocument.defaultView;
    view.__studyGuideSetItem = view.Storage.prototype.setItem;
    view.Storage.prototype.setItem = function (key, value) {
      if (key === 'studyguide_progress') throw new Error('simulated storage quota failure');
      return view.__studyGuideSetItem.call(this, key, value);
    };
  });
  await frame.getByRole('button', { name: '建立考试计划' }).click();
  await frame.locator('#modalTitle').getByText('保存失败，草稿已保留').waitFor();
  assert.equal(await frame.locator('#examPlanName').inputValue(), 'Year 12 Mock', 'failed save leaves the editable exam-plan form intact');
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('studyguide_exam_plan_draft_v1') || '{}').scope), 'Pure 1, Chapter 4–7', 'failed save retains the draft in session storage');
  await frame.locator('html').evaluate(element => {
    const view = element.ownerDocument.defaultView;
    view.Storage.prototype.setItem = view.__studyGuideSetItem;
  });
  await frame.locator('#modalOverlay .modal-btn').click();
  await frame.getByRole('button', { name: '建立考试计划' }).click();
  await frame.getByText('已启用：Year 12 Mock').waitFor();
  const savedExamPlan = await page.evaluate(() => JSON.parse(localStorage.getItem('studyguide_progress') || '{}').activeExamPlan);
  assert.equal(savedExamPlan.examType, 'alevel', 'successful retry persists the selected exam type');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('studyguide_exam_plan_draft_v1')), null, 'successful save clears the session draft');
  await frame.locator('html').evaluate(element => {
    const view = element.ownerDocument.defaultView;
    view.__studyGuideSetItem = view.Storage.prototype.setItem;
    view.Storage.prototype.setItem = function (key, value) {
      if (key === 'studyguide_progress') throw new Error('simulated storage quota failure');
      return view.__studyGuideSetItem.call(this, key, value);
    };
  });
  await frame.getByRole('button', { name: '结束当前计划' }).click();
  await frame.locator('#modalTitle').getByText('保存失败，计划仍保留').waitFor();
  await frame.locator('html').evaluate(element => {
    const view = element.ownerDocument.defaultView;
    view.Storage.prototype.setItem = view.__studyGuideSetItem;
  });
  await frame.locator('#modalOverlay .modal-btn').click();
  await frame.locator('.nav-item[data-tab="learn"]').click();
  await frame.locator('.nav-item[data-tab="exam"]').click();
  await frame.getByText('已启用：Year 12 Mock').waitFor();
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('studyguide_progress') || '{}').activeExamPlan)).name, 'Year 12 Mock', 'failed clear keeps the current plan in persisted and live state after navigation');
  await frame.getByRole('button', { name: '结束当前计划' }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('studyguide_progress') || '{}').activeExamPlan), null, 'ending a plan persists the cleared active plan');

  await frame.locator('.nav-item[data-tab="procrastination"]').click();
  await frame.locator('#taskWriterTitle').waitFor();
  await frame.locator('#taskSubject').fill('Physics');
  await frame.locator('#taskAction').fill('Review');
  await frame.locator('#taskScope').fill('Momentum');
  await frame.locator('#taskStandard').fill('闭卷解释守恒条件并完成一道代表题');
  await frame.getByRole('button', { name: '生成简洁任务', exact: true }).click();
  await frame.locator('#taskDraftTitle').getByText('Review Physics — Momentum', { exact: true }).waitFor();
  assert.equal(await frame.locator('#taskDraftDescription').innerText(), '完成标准：闭卷解释守恒条件并完成一道代表题');
  await frame.locator('#taskAction').fill('Solve');
  assert.equal(await frame.locator('#taskDraftOutput').isVisible(), false, 'editing task inputs hides the stale generated task');
  assert.equal(await frame.getByRole('button', { name: 'Copy', exact: true }).isDisabled(), true, 'stale output cannot be copied after an input changes');
  await frame.getByRole('button', { name: '生成简洁任务', exact: true }).click();
  await frame.locator('#taskDraftTitle').getByText('Solve Physics — Momentum', { exact: true }).waitFor();
  await frame.locator('.nav-item[data-tab="learn"]').click();
  await frame.locator('.nav-item[data-tab="procrastination"]').click();
  assert.equal(await frame.locator('#taskSubject').inputValue(), 'Physics', 'task-helper fields survive StudyGuide tab switches');
  assert.equal(await frame.locator('#taskAction').inputValue(), 'Solve');
  await frame.locator('#taskDraftTitle').getByText('Solve Physics — Momentum', { exact: true }).waitFor();
  const taskSessionDraft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('studyguide_task_writer_draft_v1') || '{}'));
  assert.equal(taskSessionDraft.generated, true, 'generated task output is recorded as a session-only draft');
  assert.equal(taskSessionDraft.inputs.subject, 'Physics', 'task-helper fields are kept in their dedicated session draft');
  const persistedProgress = await page.evaluate(() => JSON.parse(localStorage.getItem('studyguide_progress') || '{}'));
  assert.equal(Object.hasOwn(persistedProgress, 'taskWriterDraft'), false, 'task-helper draft does not alter the existing progress schema');

  await page.goto(`${base}/dashboard`);
  await page.goto(`${base}/study-guide`);
  frame = page.frameLocator('iframe[title="StudyGuide"]');
  await frame.locator('#taskWriterTitle').waitFor();
  assert.equal(await frame.locator('#taskScope').inputValue(), 'Momentum', 'task-helper inputs survive iframe remount');
  await frame.locator('#taskDraftTitle').getByText('Solve Physics — Momentum', { exact: true }).waitFor();

  await frame.locator('.nav-item[data-tab="learn"]').click();
  await frame.locator('.nav-item[data-tab="learn"].active').waitFor();
  const subTab = frame.locator('.sub-tab').first();
  await subTab.waitFor();
  assert.ok(await subTab.evaluate(element => element.getBoundingClientRect().height >= 44), 'StudyGuide section tabs remain touch sized');
  const savedLearnTab = await page.evaluate(() => JSON.parse(localStorage.getItem('studyguide_progress') || '{}'));
  assert.equal(savedLearnTab.lastTab, 'learn');

  await page.goto(`${base}/dashboard`);
  await page.goto(`${base}/study-guide`);
  frame = page.frameLocator('iframe[title="StudyGuide"]');
  await frame.locator('html[data-studyguide-ready="true"]').waitFor();
  await frame.locator('.nav-item[data-tab="learn"].active').waitFor();
  await frame.locator('.nav-item[data-tab="today"]').click();
  await frame.locator('.nav-item[data-tab="today"].active').waitFor();
  await frame.locator('.checklist-item[role="button"]').first().getByText('已完成', { exact: true }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/study-guide`);
  frame = page.frameLocator('iframe[title="StudyGuide"]');
  await frame.locator('html[data-studyguide-ready="true"]').waitFor();
  const mobileMenu = frame.getByRole('button', { name: '打开学习指南导航' });
  assert.ok(await mobileMenu.evaluate(element => element.getBoundingClientRect().height >= 44), 'mobile navigation trigger remains touch sized');
  await mobileMenu.click();
  await frame.locator('.sidebar.mobile-open').waitFor();
  const mobileLearnNav = frame.locator('.nav-item[data-tab="learn"]');
  assert.ok(await mobileLearnNav.evaluate(element => element.getBoundingClientRect().height >= 44), 'mobile sidebar navigation remains touch sized');
  await mobileLearnNav.click();
  const mobileSubTab = frame.locator('.sub-tab').first();
  await mobileSubTab.waitFor();
  assert.ok(await mobileSubTab.evaluate(element => element.getBoundingClientRect().height >= 44), 'mobile section tabs remain touch sized');
  assert.ok(await frame.locator('html').evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'mobile StudyGuide does not create horizontal page overflow');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await frame.locator('.content-panel').first().evaluate(element => getComputedStyle(element).animationName), 'none', 'StudyGuide respects reduced motion preference');

  await page.goto(`${base}/study-guide?tab=procrastination&subTab=plan`);
  frame = page.frameLocator('iframe[title="StudyGuide"]');
  await frame.locator('#taskWriterTitle').waitFor();
  assert.equal(await frame.locator('#taskSubject').inputValue(), 'Physics', 'task-helper draft is available on the mobile deep link');
  assert.ok(await frame.locator('#taskSubject').evaluate(element => element.getBoundingClientRect().height >= 44), 'task-helper fields stay touch sized on mobile');
  assert.equal(await frame.locator('#taskSubject').evaluate(element => getComputedStyle(element).fontSize), '16px', 'mobile task-helper inputs avoid iOS focus zoom');

  assert.deepEqual(errors, [], 'StudyGuide route remount should not produce browser errors');
  console.log('PASS StudyGuide: exam and task drafts survive tab/iframe remount, stale generated task output is invalidated, failed-save retry, saved-plan lifecycle, three themes, checklist, and 390px mobile navigation');
  await context.close();
} finally {
  await browser.close();
}
