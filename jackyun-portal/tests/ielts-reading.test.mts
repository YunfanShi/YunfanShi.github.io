import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReadingPrompt, calculateReadingProgress, calculateReadingStats, countReadingWords, parseReadingArticle, parseReadingQuiz, restoreReadingScroll, type ReadingSettings } from '../src/lib/ielts-reading.ts';
import { calculateNovelProgress, detectChapterHeading, detectNovelLanguage, inferNovelTitle, splitNovelIntoChapters } from '../src/lib/novel-reader.ts';

const settings: ReadingSettings = { level: 'B2', wordCount: 800, vocabularyDensity: 3, sentenceComplexity: 3, style: 'science-fiction', tone: 'thoughtful', perspective: 'third person limited', pacing: 3, dialogueRatio: 25, ending: 'hopeful', learningFocus: 'inference', premise: 'an explorer finds a signal', characters: 'Mira', setting: 'a distant moon', mustInclude: 'a difficult choice', avoid: 'graphic violence' };

test('builds a complete preset prompt from reading controls', () => {
  const prompt = buildReadingPrompt(settings);
  assert.match(prompt, /CEFR B2/);
  assert.match(prompt, /about 800 English words/);
  assert.match(prompt, /Mira/);
  assert.match(prompt, /valid JSON only/);
});

test('keeps prose concrete and grounds news generation in retrieved sources', () => {
  const prompt = buildReadingPrompt({ ...settings, sourceMode: 'news', newsQuery: 'space exploration' }, [{ title: 'A new mission launches', url: 'https://example.com/news', source: 'Example News', publishedAt: '2026-09-08', snippet: 'Scientists launched a new research mission.' }]);
  assert.match(prompt, /Avoid purple prose/);
  assert.match(prompt, /SOURCE MATERIAL/);
  assert.match(prompt, /A new mission launches/);
  assert.match(prompt, /only factual basis/);
});

test('parses an article and derives its reading metadata', () => {
  const content = Array.from({ length: 50 }, () => 'A curious explorer studied the distant signal carefully.').join(' ');
  const article = parseReadingArticle(JSON.stringify({ title: 'The Signal', subtitle: 'A choice in the dark', content, summary: '一段探索故事' }), settings, 'article-1', '2026-09-07T00:00:00.000Z');
  assert.equal(article.wordCount, 400);
  assert.equal(article.estimatedMinutes, 3);
  assert.equal(article.level, 'B2');
});

test('validates quiz options and answer indexes', () => {
  const quiz = parseReadingQuiz('{"questions":[{"id":"q1","question":"Why?","options":["A","B","C","D"],"answer":2,"explanation":"因为 C"}]}');
  assert.equal(quiz.questions[0].answer, 2);
  assert.throws(() => parseReadingQuiz('{"questions":[{"id":"bad","question":"?","options":["A"],"answer":4,"explanation":"x"}]}'));
});

test('calculates persisted reading and quiz totals', () => {
  const content = 'One two three four.';
  const article = parseReadingArticle(JSON.stringify({ title: 'T', content: content.repeat(60) }), settings, 'a', '2026-09-07T00:00:00.000Z');
  const stats = calculateReadingStats([{ ...article, completedCount: 2, totalSeconds: 300, quizAttempts: 1, quizCorrect: 4, quizAnswered: 5, vocabulary: { signal: { word: 'signal', phonetic: '', partOfSpeech: 'noun', translation: '信号', definition: 'a sign', example: 'We saw a signal.' } } }]);
  assert.equal(stats.completed, 2);
  assert.equal(stats.wordsRead, countReadingWords(content.repeat(60)) * 2);
  assert.equal(stats.quizAccuracy, 80);
  assert.equal(stats.vocabularySaved, 1);
});

test('saves and restores approximate reading position across layout changes', () => {
  assert.equal(calculateReadingProgress(900, 2000, 500), 0.6);
  assert.equal(restoreReadingScroll(0.6, 2500, 500), 1200);
  assert.equal(calculateReadingProgress(-20, 2000, 500), 0);
  assert.equal(restoreReadingScroll(2, 2000, 500), 1500);
});

test('recognizes common Chinese and English novel chapter headings', () => {
  for (const heading of [
    '第一章 斗罗大陆', '第 120 回 真相', '第001话 冬日', '第七夜 来客',
    '正文卷 第三章 重逢', '第一卷 第三章 风暴', '卷二 风雪', '上篇 地球往事',
    '楔子', '序幕', '间章 梦', '番外篇 旧日', '后日谈', '大结局', '作品相关',
    '1.科学边界', '2．射手和农场主', '3、宇宙闪烁', '四、疯狂年代', '甲：启程',
    '(5) 沉默的春天', '（六）红岸往事', '【7】没有空格', '① 倒计时', '001 无名小镇',
    'Chapter 42: The Answer', 'CH. 7 Signals', 'Section 3 — Evidence', 'Act II: The Storm',
    'Scene 4 The Library', 'BOOK IV — Winter', 'Volume Two: Return', 'Prologue', 'Afterword',
  ]) {
    assert.equal(detectChapterHeading(heading), heading);
  }
  assert.equal(detectChapterHeading('【第九章 风暴】'), '第九章 风暴');
  assert.equal(detectChapterHeading('## Chapter 8: Markdown heading'), 'Chapter 8: Markdown heading');
  assert.equal(detectChapterHeading('- Chapter 9 List-style heading'), 'Chapter 9 List-style heading');
  assert.equal(detectChapterHeading('This is an ordinary sentence in the story.'), null);
  assert.equal(detectChapterHeading('这是正文里的一句普通话。'), null);
  assert.equal(detectChapterHeading('2026 was a difficult year.'), null);
  assert.equal(detectChapterHeading('1. This is a complete sentence.'), null);
});

test('splits very long novels by detected headings and keeps front matter', () => {
  const source = ['作者：测试', '', '序章', '故事开始。', '', '第一章 初见', '第一章正文。', '', 'Chapter 2: Across the Sea', 'The second chapter.'].join('\n');
  const chapters = splitNovelIntoChapters(source);
  assert.deepEqual(chapters.map((chapter) => chapter.title), ['卷首', '序章', '第一章 初见', 'Chapter 2: Across the Sea']);
  assert.match(chapters[2].content, /第一章正文/);
});

test('splits Three-Body-style compact numbered chapter titles', () => {
  const source = ['三体', '', '1.科学边界', '汪淼走进会议室。', '', '2．射手和农场主', '他想起了那个假说。', '', '3、宇宙闪烁', '夜空开始闪烁。'].join('\n');
  const chapters = splitNovelIntoChapters(source);
  assert.deepEqual(chapters.map((chapter) => chapter.title), ['卷首', '1.科学边界', '2．射手和农场主', '3、宇宙闪烁']);
});

test('falls back to bounded sections when a text has no chapter headings', () => {
  const chapters = splitNovelIntoChapters(`${'甲'.repeat(80)}\n\n${'乙'.repeat(80)}\n\n${'丙'.repeat(80)}`, 100);
  assert.equal(chapters.length, 3);
  assert.equal(chapters[0].title, '第 1 节');
});

test('detects book language and calculates whole-book progress', () => {
  assert.equal(detectNovelLanguage('这是一本中文小说。'.repeat(20)), 'zh');
  assert.equal(detectNovelLanguage('This is a long English novel. '.repeat(20)), 'en');
  assert.equal(calculateNovelProgress(4, 0.5, 10), 0.45);
  assert.equal(inferNovelTitle('The_Three-Body_Problem.txt'), 'The Three Body Problem');
});
