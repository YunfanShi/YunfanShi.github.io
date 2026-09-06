import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWritingReviewPrompt, countWords, diffWriting, highlightQuotedText, parseWritingFeedback, readFirstValidJson, recurringRuleKeys, targetWords, updateErrorHistory, writeRedundantJson } from '../src/lib/ielts-writing.ts';

test('counts IELTS words and returns task targets deterministically', () => {
  assert.equal(countWords('  One   two\nthree  '), 3);
  assert.equal(countWords(''), 0);
  assert.equal(targetWords('task2'), 250);
  assert.equal(targetWords('task1-academic'), 150);
});

test('parses fenced feedback and rejects incomplete responses', () => {
  const feedback = parseWritingFeedback('```json\n{"bandEstimate":"6.0–6.5","summary":"清楚","priorities":["逻辑"],"issues":[{"id":"1","category":"Grammar","severity":"high","quote":"people is","explanation":"主谓不一致","selfRevisionPrompt":"主语是单数还是复数？","ruleKey":"subject_verb_agreement"}],"upgrades":[],"readyForUpgrade":false}\n```');
  assert.equal(feedback.issues[0].ruleKey, 'subject_verb_agreement');
  assert.throws(() => parseWritingFeedback('{"summary":"missing issues"}'));
});

test('only promotes an error after it appears in two independent essays', () => {
  let history = updateErrorHistory([], 'essay-a', ['article_usage', 'article_usage']);
  assert.deepEqual(recurringRuleKeys(history), []);
  history = updateErrorHistory(history, 'essay-a', ['article_usage', 'cohesion']);
  assert.deepEqual(recurringRuleKeys(history), []);
  assert.deepEqual(history[0].ruleKeys, ['article_usage', 'cohesion']);
  history = updateErrorHistory(history, 'essay-b', ['article_usage']);
  assert.deepEqual(recurringRuleKeys(history), ['article_usage']);
});

test('writes every draft to two copies and recovers from a corrupt primary copy', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const draft = { essayId: 'essay-a', essay: 'first version' };
  writeRedundantJson(storage, 'primary', 'mirror', draft);
  assert.equal(values.get('primary'), values.get('mirror'));

  values.set('primary', '{broken json');
  const recovered = readFirstValidJson(storage, ['primary', 'mirror'], (value): value is typeof draft => Boolean(value && typeof value === 'object' && typeof (value as typeof draft).essay === 'string'));
  assert.deepEqual(recovered, draft);
});

test('highlights additions and deletions without changing either reconstructed text', () => {
  const original = 'Public transport is very important.';
  const current = 'Reliable public transport is important.';
  const chunks = diffWriting(original, current);
  assert.equal(chunks.filter((chunk) => chunk.type !== 'added').map((chunk) => chunk.text).join(''), original);
  assert.equal(chunks.filter((chunk) => chunk.type !== 'removed').map((chunk) => chunk.text).join(''), current);
  assert.ok(chunks.some((chunk) => chunk.type === 'added' && chunk.text.includes('Reliable')));
  assert.ok(chunks.some((chunk) => chunk.type === 'removed' && chunk.text.includes('very')));
});

test('external prompt embeds the essay and enforces the selected response format', () => {
  const prompt = buildWritingReviewPrompt({ task: 'task2', question: 'Discuss both views.', essay: 'My complete essay.', originalEssay: '', mode: 'diagnose', outputLanguage: 'en', responseFormat: 'markdown' });
  assert.match(prompt, /My complete essay\./);
  assert.match(prompt, /Return Markdown only/);
  assert.match(prompt, /# Band estimate/);
});

test('maps AI quote fragments back to highlighted essay text', () => {
  const essay = 'People is worried. Other people disagree.';
  const chunks = highlightQuotedText(essay, [{ id: 'grammar-1', quote: 'people is' }]);
  assert.equal(chunks.map((chunk) => chunk.text).join(''), essay);
  assert.equal(chunks.find((chunk) => chunk.highlighted)?.text, 'People is');
  assert.deepEqual(chunks.find((chunk) => chunk.highlighted)?.issueIds, ['grammar-1']);
});
