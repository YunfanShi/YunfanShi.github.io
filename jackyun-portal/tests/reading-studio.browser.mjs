import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_AUTH_TEST_URL || 'http://127.0.0.1:3154';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Reading UI regression requires a loopback app');

const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const errors = [];

async function verifyPreHydrationReaderClick() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const heldRoutes = [];
  let allowModuleChunks = false;
  await page.route(/\/_next\/static\/chunks\/(?:src_components_modules_.*|app\/.*\/reading\/page-[^/]+)\.js/, async route => {
    if (allowModuleChunks) return route.continue().catch(() => {});
    await new Promise(resolve => heldRoutes.push(resolve));
    await route.continue().catch(() => {});
  });
  try {
    await page.goto(`${base}/reading`, { waitUntil: 'domcontentloaded' });
    const launch = page.getByRole('button', { name: /AI 阅读工坊/ });
    await launch.waitFor({ state: 'visible' });
    await launch.click();
    await page.waitForFunction(() => Boolean(window.__JY_EARLY_CLICK_QUEUE?.['reading-ai-studio']));
    assert.equal(await page.getByRole('heading', { name: '我的小说书架', exact: true }).count(), 1, `the action stays queued while client chunks are held; DOM headings: ${JSON.stringify(await page.locator('h1').allTextContents())}`);
    allowModuleChunks = true;
    for (const release of heldRoutes.splice(0)) release();
    await page.getByRole('heading', { name: '英文阅读 · 文章生成器与阅读器', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => Boolean(window.__JY_EARLY_CLICK_QUEUE?.['reading-ai-studio'])), false, 'the captured action is consumed after hydration');
  } catch (error) {
    console.error('Pre-hydration reader diagnostic:', await page.locator('body').innerText());
    throw error;
  } finally {
    allowModuleChunks = true;
    for (const release of heldRoutes.splice(0)) release();
    await context.close();
  }
}

async function openReader(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/reading`);
  await page.getByRole('heading', { name: '我的小说书架', exact: true }).waitFor();
  await page.waitForFunction(() => window.__JY_EARLY_CLICK_READY?.['reading-ai-studio'] === true);
  return { context, page };
}

try {
  for (const width of [1280, 390]) {
    const { context, page } = await openReader(width);
    const initialChunks = await page.evaluate(() => performance.getEntriesByType('resource')
      .filter(entry => entry.name.includes('/_next/static/chunks/') && entry.name.endsWith('.js'))
      .map(entry => entry.name));
    await page.getByRole('button', { name: /AI 阅读工坊/ }).click();
    await page.getByRole('heading', { name: '英文阅读 · 文章生成器与阅读器', exact: true }).waitFor();
    const loadedChunks = await page.evaluate((before) => performance.getEntriesByType('resource')
      .filter(entry => entry.name.includes('/_next/static/chunks/') && entry.name.endsWith('.js') && !before.includes(entry.name))
      .map(entry => entry.name), initialChunks);
    assert.ok(loadedChunks.length > 0, `AI Reading Studio should load on demand at ${width}px`);
    await page.getByRole('button', { name: /返回小说书架/ }).click();
    await page.getByRole('heading', { name: '我的小说书架', exact: true }).waitFor();
    await context.close();
  }

  const flowContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const flow = await flowContext.newPage();
  const articleContent = [
    'At dawn, Mina found a small beacon beneath the old railway bridge. Its blue light blinked in a pattern she had seen on the map her grandfather left behind.',
    'The path led through a quiet garden where rain had gathered on every leaf. Mina followed the signal carefully, stopping whenever the light changed its rhythm.',
    'At the end of the path, she discovered a weather station that had been recording the valley for years. The beacon was not a warning; it was a message asking someone to keep the station alive.',
  ].join('\n\n');
  const mockRequests = [];
  flow.on('pageerror', error => errors.push(error.message));
  await flow.route('**/api/llm-proxy', async route => {
    const request = route.request().postDataJSON();
    mockRequests.push(request);
    const prompt = request.messages?.at(-1)?.content ?? '';
    if (request.stream) {
      const content = JSON.stringify({ title: 'The Quiet Beacon', subtitle: 'A message in the rain', content: articleContent, summary: '米娜沿着灯塔信号找到一座需要维护的气象站。' });
      const event = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: event });
    } else if (prompt.includes('Explain the English word')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ word: 'beacon', phonetic: '/ˈbiːkən/', partOfSpeech: 'noun', translation: '灯塔；信号灯', definition: 'A light or signal that guides people.', example: 'A beacon guided the boat home.' }) } }] }) });
    } else if (prompt.includes('multiple-choice reading-comprehension')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions: [{ id: 'q1', question: 'Why did Mina follow the beacon?', options: ['To find the weather station', 'To catch a train', 'To meet her teacher', 'To leave the valley'], answer: 0, explanation: 'The signal led her to the station.' }] }) } }] }) });
    } else {
      await route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Unexpected fixture prompt' } }) });
    }
  });
  await flow.goto(`${base}/reading`);
  await flow.getByRole('heading', { name: '我的小说书架', exact: true }).waitFor();
  await flow.waitForFunction(() => window.__JY_EARLY_CLICK_READY?.['reading-ai-studio'] === true);
  await flow.getByRole('button', { name: /AI 阅读工坊/ }).click();
  await flow.getByRole('heading', { name: '英文阅读 · 文章生成器与阅读器', exact: true }).waitFor();
  await flow.getByLabel(/故事梗概 \/ 想看的内容/).fill('A learner follows a mysterious beacon to an old weather station.');
  await flow.getByRole('button', { name: /生成一篇 B2/ }).click();
  await flow.getByRole('heading', { name: 'The Quiet Beacon', exact: true }).waitFor();
  await flow.getByRole('button', { name: 'beacon', exact: true }).first().click();
  await flow.getByText('灯塔；信号灯', { exact: true }).waitFor();
  await flow.getByRole('button', { name: '生成阅读理解', exact: true }).click();
  await flow.getByRole('radio').first().waitFor();
  await flow.getByRole('radio').first().check();
  await flow.getByRole('button', { name: '提交答案', exact: true }).click();
  await flow.getByRole('status').filter({ hasText: '本次答对 1 / 1' }).waitFor();
  await flow.getByRole('button', { name: /我读完了/ }).click();
  await flow.getByRole('status').filter({ hasText: '本次阅读已完成并记录' }).waitFor();
  await flow.getByRole('button', { name: /数据/ }).click();
  await flow.getByText('完成阅读', { exact: true }).waitFor();
  await flow.waitForFunction(() => {
    const library = JSON.parse(localStorage.getItem('jackyun_ielts_reading_library_v1') || '[]');
    return library.length === 1 && library[0].title === 'The Quiet Beacon' && library[0].completedCount === 1 && library[0].quizAttempts === 1 && library[0].quizCorrect === 1 && library[0].vocabulary.beacon?.translation === '灯塔；信号灯';
  });
  assert.equal(mockRequests.length, 3, 'generation, word lookup and quiz each use the local AI fixture');
  await flow.getByRole('button', { name: /书架/ }).last().click();
  await flow.getByRole('heading', { name: 'The Quiet Beacon', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await flowContext.close();

  await verifyPreHydrationReaderClick();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: 7, checks: [
    'Novel bookshelf remains the default reader experience',
    'AI Reading Studio loads its deferred JavaScript only after selection',
    'Switching back returns to the existing bookshelf without a route reload',
    'Desktop and 390px mobile reader entry work',
    'Desktop and mobile reader flows hydrate without page errors',
    'Mocked generation, vocabulary lookup, quiz submission and local library persistence complete successfully',
    'An early launch click survives delayed client hydration and is replayed once',
  ] }));
} finally {
  await browser.close();
}
