import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReadingPrompt, calculateReadingStats, countReadingWords, parseReadingArticle, parseReadingQuiz, type ReadingSettings } from '../src/lib/ielts-reading.ts';

const settings: ReadingSettings = { level: 'B2', wordCount: 800, vocabularyDensity: 3, sentenceComplexity: 3, style: 'science-fiction', tone: 'thoughtful', perspective: 'third person limited', pacing: 3, dialogueRatio: 25, ending: 'hopeful', learningFocus: 'inference', premise: 'an explorer finds a signal', characters: 'Mira', setting: 'a distant moon', mustInclude: 'a difficult choice', avoid: 'graphic violence' };

test('builds a complete preset prompt from reading controls', () => {
  const prompt = buildReadingPrompt(settings);
  assert.match(prompt, /CEFR B2/);
  assert.match(prompt, /about 800 English words/);
  assert.match(prompt, /Mira/);
  assert.match(prompt, /valid JSON only/);
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
