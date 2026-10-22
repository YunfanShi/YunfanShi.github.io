import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.JACKYUN_AUTH_TEST_URL || 'http://127.0.0.1:3155';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Novel reading position regression requires a loopback app');

const bookId = 'ui-modernization-reading-position-fixture';
const browser = await chromium.launch({ headless: true, channel: process.env.JACKYUN_BROWSER_CHANNEL || 'msedge' });
const errors = [];

function bookFixture() {
  const now = new Date().toISOString();
  return {
    id: bookId, title: '阅读位置回归书', author: '测试作者', language: 'zh', chapterCount: 2,
    characterCount: 20_000, importedAt: now, lastReadAt: now, currentChapter: 0,
    chapterProgress: 0, chapterScrollTop: 0, anchorParagraph: -1, anchorOffsetRatio: 0,
    positionUpdatedAt: now, overallProgress: 0.15, readingSeconds: 0, sourceFileName: 'fixture.txt',
    bookmarks: [], readingMode: 'scroll',
  };
}

const paragraphs = Array.from({ length: 24 }, (_, index) => ({
  index,
  title: `段落 ${index + 1}`,
  content: `${index + 1} ` + '阅读位置恢复测试文本，确保每个段落都有足够高度用于验证滚动锚点。'.repeat(24),
  characterCount: 400,
}));

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));

  // Seed IndexedDB before the React app mounts, then add a more recent emergency position.
  await page.goto(`${base}/manifest.json`);
  await page.evaluate(async ({ book, content }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('jackyun_novel_library', 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('books')) database.createObjectStore('books', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('chapters')) {
          const store = database.createObjectStore('chapters', { keyPath: 'key' });
          store.createIndex('bookId', 'bookId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(['books', 'chapters'], 'readwrite');
      transaction.objectStore('books').put(book);
      transaction.objectStore('chapters').put({ index: 0, title: '第一章', content: '开篇内容。', characterCount: 5, bookId: book.id, key: `${book.id}:0` });
      transaction.objectStore('chapters').put({ index: 1, title: '第二章', content: content.map((item) => item.content).join('\n\n'), characterCount: content.reduce((sum, item) => sum + item.characterCount, 0), bookId: book.id, key: `${book.id}:1` });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
    localStorage.setItem(`jackyun_novel_position_v2:${book.id}`, JSON.stringify({
      chapterIndex: 1, chapterProgress: 0.5, scrollTop: 0, anchorParagraph: 10,
      anchorOffsetRatio: 0.25, updatedAt: new Date().toISOString(), readingMode: 'scroll',
    }));
  }, { book: bookFixture(), content: paragraphs });

  await page.goto(`${base}/reading`);
  await page.getByRole('heading', { name: '我的小说书架', exact: true }).waitFor();
  await page.getByRole('heading', { name: '阅读位置回归书', exact: true }).waitFor();
  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  await page.getByText('第二章 ·', { exact: false }).waitFor();

  const reader = page.locator('main').filter({ has: page.locator('[data-reader-paragraph="0"]') }).last();
  await page.locator('[data-reader-paragraph="10"]').waitFor();
  await page.waitForFunction(() => {
    const item = document.querySelector('[data-reader-paragraph="10"]');
    const main = item?.closest('main');
    return Boolean(main && main.scrollTop > 100);
  });
  const initialScrollTop = await reader.evaluate((element) => element.scrollTop);
  assert.ok(initialScrollTop > 100, `saved paragraph anchor should restore a nonzero position, got ${initialScrollTop}`);

  await reader.evaluate((element) => {
    const target = element.querySelector('[data-reader-paragraph="17"]');
    if (!target) throw new Error('expected reading anchor paragraph is missing');
    const targetTop = target.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop;
    element.scrollTop = Math.max(0, targetTop - 1);
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await page.waitForFunction((id) => {
    const value = JSON.parse(localStorage.getItem(`jackyun_novel_position_v2:${id}`) || 'null');
    return value?.chapterIndex === 1 && value.anchorParagraph === 17 && value.chapterProgress > 0.62;
  }, bookId);
  await page.getByRole('button', { name: '返回书架' }).click();
  await page.getByRole('heading', { name: '我的小说书架', exact: true }).waitFor();
  const emergencyPosition = await page.evaluate((id) => JSON.parse(localStorage.getItem(`jackyun_novel_position_v2:${id}`) || 'null'), bookId);

  const storedBook = await page.evaluate(async (id) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('jackyun_novel_library', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const book = await new Promise((resolve, reject) => {
      const request = db.transaction('books', 'readonly').objectStore('books').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return book;
  }, bookId);
  assert.equal(storedBook.currentChapter, 1, 'returning to shelf should persist the current chapter');
  assert.ok(storedBook.chapterProgress > 0.62, 'returning to shelf should persist scroll progress');

  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  await page.getByText('第二章 ·', { exact: false }).waitFor();
  await page.waitForFunction(() => {
    const item = document.querySelector('[data-reader-paragraph="0"]');
    const main = item?.closest('main');
    return Boolean(main && main.scrollTop > 1_000);
  });
  const resumedScrollTop = await reader.evaluate((element) => element.scrollTop);
  assert.ok(resumedScrollTop > 1_000, `reopening the book should recover the newer saved position, got ${resumedScrollTop}`);
  assert.equal(emergencyPosition.chapterIndex, 1, 'emergency bookmark should keep the active chapter');
  assert.equal(emergencyPosition.anchorParagraph, 17, 'emergency bookmark should preserve the deliberately selected paragraph anchor');

  await page.getByRole('button', { name: '翻页', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent === '翻页' && button.className.includes('bg-[#0f766e]')));
  await reader.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await reader.evaluate((element) => {
    element.style.scrollBehavior = 'auto';
    const maximum = element.scrollWidth - element.clientWidth;
    if (maximum <= 0) throw new Error('paged reader should have horizontal overflow for the seeded chapter');
    element.scrollLeft = maximum * 0.55;
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await page.waitForFunction((id) => {
    const value = JSON.parse(localStorage.getItem(`jackyun_novel_position_v2:${id}`) || 'null');
    return value?.readingMode === 'paged' && value.chapterProgress > 0.4;
  }, bookId);
  await page.getByRole('button', { name: '返回书架' }).click();
  await page.getByRole('heading', { name: '我的小说书架', exact: true }).waitFor();
  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  await page.getByText('第二章 ·', { exact: false }).waitFor();
  await page.waitForFunction(() => {
    const item = document.querySelector('[data-reader-paragraph="0"]');
    const main = item?.closest('main');
    return Boolean(main && main.scrollLeft > 0);
  });
  assert.equal(await page.getByRole('button', { name: '翻页', exact: true }).getAttribute('class').then((value) => value?.includes('bg-[#0f766e]')), true, 'paged mode should survive closing and reopening the reader');
  assert.deepEqual(errors, [], 'reading progress round-trip should not cause browser errors');

  console.log('PASS novel scroll and paged positions survive reader → shelf → reader');
  await context.close();
} finally {
  await browser.close();
}
