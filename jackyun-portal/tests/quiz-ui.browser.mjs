import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3154';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Quiz UI test requires a loopback app');
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const errors = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768 });
    await context.addInitScript(() => {
      if (sessionStorage.getItem('quiz-ui-test-clean') === '1') return;
      localStorage.removeItem('quizwise_version_preference');
      sessionStorage.setItem('quiz-ui-test-clean', '1');
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/quiz`);
    const dialog = page.getByRole('dialog', { name: '选择 QuizWise 版本', exact: true });
    await dialog.waitFor();
    const choice = dialog.getByRole('button', { name: /TSX 版本/ });
    const dimensions = await choice.evaluate(element => ({ height: element.getBoundingClientRect().height, fontSize: getComputedStyle(element).fontSize }));
    assert.ok(dimensions.height >= 44, 'version choice must remain touch friendly');

    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('heading', { name: /QuizWise/ }).waitFor();
    await page.waitForFunction(() => localStorage.getItem('quizwise_version_preference') === 'react');
    assert.equal(await page.evaluate(() => localStorage.getItem('quizwise_version_preference')), 'react', 'dismissing the initial choice explicitly keeps the React version');

    await page.evaluate(() => localStorage.setItem('quizwise_version_preference', 'html'));
    await page.reload();
    const htmlVersionSwitch = page.getByRole('button', { name: 'HTML', exact: true });
    const reactVersionSwitch = page.getByRole('button', { name: 'TSX', exact: true });
    await reactVersionSwitch.waitFor();
    await page.locator('iframe[title="QuizWise HTML Version"]').waitFor({ state: 'attached' });
    assert.equal(await htmlVersionSwitch.getAttribute('aria-pressed'), 'true');
    assert.equal(await reactVersionSwitch.getAttribute('aria-pressed'), 'false');
    const switchHeights = await Promise.all([htmlVersionSwitch, reactVersionSwitch].map(button => button.evaluate(element => element.getBoundingClientRect().height)));
    assert.ok(switchHeights.every(height => height >= 44), 'QuizWise version switches must meet the mobile touch target');
    assert.equal(await page.evaluate(() => localStorage.getItem('quizwise_version_preference')), 'html');
    await reactVersionSwitch.click();
    await page.getByRole('heading', { name: /QuizWise/ }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('quizwise_version_preference')), 'react');
    console.log(`PASS QuizWise version dialog, preference persistence and HTML/React switch at ${width}px`);
    await context.close();
  }

  const lateRestoreContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await lateRestoreContext.addInitScript(() => {
    localStorage.setItem('quizwise_version_preference', 'react');
    localStorage.setItem('quizwise_current_questions', JSON.stringify([
      { id: 'late-cloud-question', type: 'multiple_choice', questionText: 'Cloud-restored active question?', options: [{ label: 'A', text: 'Yes' }, { label: 'B', text: 'No' }], correctAnswer: 'A) Yes' },
    ]));
    localStorage.removeItem('quizwise_current_progress');
  });
  const lateRestorePage = await lateRestoreContext.newPage();
  lateRestorePage.on('pageerror', error => errors.push(error.message));
  await lateRestorePage.goto(`${base}/quiz`);
  await lateRestorePage.getByRole('button', { name: 'Custom' }).waitFor();
  await lateRestorePage.evaluate(() => {
    localStorage.setItem('quizwise_current_progress', JSON.stringify({
      sessionId: 'late-cloud-session', startedAt: '2026-10-28T09:00:00.000Z', subjectName: 'Cloud subject',
      currentIndex: 0, questionIds: ['late-cloud-question'], answers: [{ questionIndex: 0, answer: '', isCorrect: null }],
    }));
    window.dispatchEvent(new Event('jackyun-cloud-state-applied'));
  });
  await lateRestorePage.getByText('Cloud-restored active question?', { exact: true }).waitFor();
  assert.equal(await lateRestorePage.getByText('1 / 1', { exact: true }).count(), 1, 'late cloud progress restores over an idle legacy question cache');
  console.log('PASS QuizWise late cloud progress hydration does not get masked by an existing question cache');
  await lateRestoreContext.close();

  const flowContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await flowContext.addInitScript(() => {
    localStorage.setItem('quizwise_version_preference', 'react');
    for (const key of ['quizwise_current_questions', 'quizwise_current_session', 'quizwise_history', 'quizwise_selected_subject']) localStorage.removeItem(key);
  });
  const flowPage = await flowContext.newPage();
  flowPage.on('pageerror', error => errors.push(error.message));
  await flowPage.goto(`${base}/quiz`);
  await flowPage.getByRole('heading', { name: /QuizWise/ }).waitFor();
  await flowPage.getByRole('button', { name: '导入 AI 生成的 JSON' }).click();
  const questions = [
    { type: 'multiple_choice', questionText: 'Which number is even?', options: [{ label: 'A', text: 'One' }, { label: 'B', text: 'Two' }], correctAnswer: 'B) Two', explanation: 'Two is divisible by two.' },
    { type: 'multiple_choice', questionText: 'Which number is odd?', options: [{ label: 'A', text: 'Three' }, { label: 'B', text: 'Four' }], correctAnswer: 'A) Three' },
  ];
  await flowPage.getByPlaceholder('粘贴 {"questions":[...]}').fill(JSON.stringify({ questions }));
  await flowPage.getByRole('button', { name: '检查并导入' }).click();
  await flowPage.getByRole('button', { name: 'Custom' }).click();
  await flowPage.getByPlaceholder(/Chemistry Paper/).fill('UI regression');
  await flowPage.getByRole('button', { name: 'Start Quiz' }).click();
  await flowPage.locator('[data-quiz-option]').nth(1).click();
  assert.equal(await flowPage.locator('[data-quiz-option]').nth(1).getAttribute('aria-pressed'), 'true', 'selected answer exposes pressed state');
  const selectedBackground = await flowPage.locator('[data-quiz-option]').nth(1).evaluate(element => getComputedStyle(element).backgroundColor);
  const idleBackground = await flowPage.locator('[data-quiz-option]').nth(0).evaluate(element => getComputedStyle(element).backgroundColor);
  assert.notEqual(selectedBackground, idleBackground, 'selected option must have visible feedback');
  await flowPage.getByRole('button', { name: '确认答案' }).click();
  await flowPage.getByRole('button', { name: '下一题' }).click();
  await flowPage.waitForFunction(() => JSON.parse(localStorage.getItem('quizwise_current_progress') || 'null')?.currentIndex === 1);
  await flowPage.reload();
  await flowPage.getByText('Which number is odd?', { exact: true }).waitFor();
  assert.equal(await flowPage.getByText('2 / 2', { exact: true }).count(), 1, 'reloading mid-quiz restores the active question and progress');
  await flowPage.locator('[data-quiz-option]').nth(1).click();
  await flowPage.getByRole('button', { name: '确认答案' }).click();
  await flowPage.getByRole('button', { name: /Complete Quiz/ }).click();
  await flowPage.getByText('50%', { exact: true }).waitFor();
  const localHistory = await flowPage.evaluate(() => JSON.parse(localStorage.getItem('quizwise_history') || '[]'));
  assert.equal(localHistory.length, 1, 'completed guest quiz must be recorded locally');
  assert.equal(localHistory[0].subject_name, 'UI regression');
  assert.equal(localHistory[0].correct_count, 1);
  assert.equal(await flowPage.evaluate(() => localStorage.getItem('quizwise_current_questions')), null, 'completed quiz clears its current-question recovery record');
  console.log('PASS QuizWise React import, subject selection, answer confirmation, navigation and local result history on mobile');
  await flowContext.close();

  const staleIdentityContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await staleIdentityContext.addInitScript(() => {
    localStorage.setItem('quizwise_version_preference', 'react');
    localStorage.setItem('quizwise_current_questions', JSON.stringify([
      { id: 'old-cloud-question-a', type: 'multiple_choice', questionText: 'Old cloud question?', options: [{ label: 'A', text: 'One' }, { label: 'B', text: 'Two' }], correctAnswer: 'A) One' },
    ]));
    localStorage.setItem('quizwise_current_progress', JSON.stringify({
      sessionId: 'old-cloud-session', startedAt: '2026-10-28T08:00:00.000Z', subjectName: 'Old cloud subject',
      currentIndex: 0, questionIds: ['old-cloud-question-a'], answers: [{ questionIndex: 0, answer: '', isCorrect: null }],
    }));
  });
  const staleIdentityPage = await staleIdentityContext.newPage();
  staleIdentityPage.on('pageerror', error => errors.push(error.message));
  await staleIdentityPage.goto(`${base}/quiz`);
  await staleIdentityPage.getByRole('heading', { name: /QuizWise/ }).waitFor();
  await staleIdentityPage.getByRole('button', { name: '新建测验' }).click();
  await staleIdentityPage.getByRole('button', { name: '导入 AI 生成的 JSON' }).click();
  await staleIdentityPage.getByPlaceholder('粘贴 {"questions":[...]}').fill(JSON.stringify({ questions }));
  await staleIdentityPage.getByRole('button', { name: '检查并导入' }).click();
  await staleIdentityPage.getByRole('button', { name: 'Custom' }).click();
  await staleIdentityPage.getByPlaceholder(/Chemistry Paper/).fill('Local-only identity reset');
  await staleIdentityPage.getByRole('button', { name: 'Start Quiz' }).click();
  await staleIdentityPage.waitForFunction(() => {
    const progress = JSON.parse(localStorage.getItem('quizwise_current_progress') || 'null');
    return progress?.subjectName === 'Local-only identity reset' && progress?.sessionId === null;
  });
  const resetProgress = await staleIdentityPage.evaluate(() => JSON.parse(localStorage.getItem('quizwise_current_progress') || 'null'));
  assert.deepEqual(resetProgress.questionIds, [], 'a new local quiz must not inherit the previous cloud question IDs');
  console.log('PASS QuizWise local-only quiz clears the previous cloud question identity');
  await staleIdentityContext.close();

  const htmlContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await htmlContext.addInitScript(() => {
    localStorage.setItem('quizwise_version_preference', 'html');
    for (const key of ['quizwise_current_questions', 'quizwise_history', 'quizwise_selected_subject']) localStorage.removeItem(key);
  });
  const htmlPage = await htmlContext.newPage();
  htmlPage.on('pageerror', error => errors.push(error.message));
  await htmlPage.goto(`${base}/quiz`);
  const htmlQuiz = htmlPage.frameLocator('iframe[title="QuizWise HTML Version"]');
  await htmlQuiz.locator('#view-input.active').waitFor();
  await htmlQuiz.getByRole('button', { name: '导入 AI 生成的 JSON' }).click();
  const compactAction = htmlQuiz.getByRole('button', { name: '检查并导入' });
  const actionHeight = await compactAction.evaluate(element => element.getBoundingClientRect().height);
  assert.ok(actionHeight >= 44, 'compact HTML actions must meet the mobile touch target');
  await htmlQuiz.getByPlaceholder('粘贴 {"questions":[...]}').fill(JSON.stringify({ questions }));
  await htmlQuiz.getByRole('button', { name: '检查并导入' }).click();
  await htmlQuiz.locator('#view-subject.active').waitFor();
  await htmlQuiz.getByPlaceholder('输入自定义科目名称...').fill('HTML UI regression');
  await htmlQuiz.getByRole('button', { name: /添加/ }).click();
  await htmlQuiz.getByRole('button', { name: 'HTML UI regression' }).click();
  const start = htmlQuiz.locator('#btn-start');
  await start.waitFor({ state: 'visible' });
  await start.evaluate(element => element.disabled ? new Promise(resolve => {
    const observer = new MutationObserver(() => {
      if (!element.disabled) { observer.disconnect(); resolve(); }
    });
    observer.observe(element, { attributes: true, attributeFilter: ['disabled'] });
  }) : Promise.resolve());
  await start.click();
  const htmlOptions = htmlQuiz.locator('.option-btn');
  await htmlOptions.nth(1).click();
  assert.equal(await htmlOptions.nth(1).getAttribute('aria-pressed'), 'true', 'HTML answer selection must expose pressed state');
  const progressDot = htmlQuiz.locator('.progress-dot').first();
  const dotSize = await progressDot.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height };
  });
  assert.ok(dotSize.width >= 44 && dotSize.height >= 44, 'question progress markers must have a usable touch target');
  await htmlQuiz.getByRole('button', { name: '确认答案' }).click();
  await htmlQuiz.getByRole('button', { name: '下一题 →' }).click();
  await htmlQuiz.locator('.option-btn').nth(1).click();
  await htmlQuiz.getByRole('button', { name: '确认答案' }).click();
  await htmlQuiz.getByRole('button', { name: /完成答题/ }).click();
  await htmlQuiz.locator('#view-result.active').waitFor();
  const resultPercent = htmlQuiz.locator('#result-pct');
  assert.equal((await resultPercent.textContent())?.trim(), '50%');
  const htmlHistory = await htmlQuiz.locator('body').evaluate(() => JSON.parse(localStorage.getItem('quizwise_history') || '[]'));
  assert.equal(htmlHistory.length, 1, 'HTML guest quiz must retain the legacy local result record');
  assert.equal(htmlHistory[0].subject, 'HTML UI regression');
  assert.equal(htmlHistory[0].correct, 1);
  await htmlPage.emulateMedia({ reducedMotion: 'reduce' });
  await htmlPage.reload();
  const motionDuration = await htmlPage.frameLocator('iframe[title="QuizWise HTML Version"]').locator('#view-input').evaluate(element => parseFloat(getComputedStyle(element).animationDuration));
  assert.ok(motionDuration <= 0.001, 'HTML QuizWise must honor reduced-motion preference');
  const htmlSettings = htmlPage.frameLocator('iframe[title="QuizWise HTML Version"]');
  await htmlSettings.getByRole('button', { name: '设置' }).click();
  const answerSwitch = htmlSettings.getByRole('switch', { name: '立即显示答案' });
  await answerSwitch.waitFor();
  assert.equal(await answerSwitch.getAttribute('aria-checked'), 'true');
  const switchHeight = await answerSwitch.evaluate(element => element.getBoundingClientRect().height);
  assert.ok(switchHeight >= 44, 'HTML settings switches must meet the mobile touch target');
  await answerSwitch.click();
  assert.equal(await answerSwitch.getAttribute('aria-checked'), 'false', 'switch state must be announced after toggling');
  console.log('PASS QuizWise HTML import, touch targets, answer state, local history and reduced motion on mobile');
  await htmlContext.close();
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
