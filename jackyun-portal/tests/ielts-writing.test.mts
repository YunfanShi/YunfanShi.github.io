import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWritingReviewPrompt, coerceWritingStage, countWords, diffWriting, findQuotedTextRange, highlightQuotedText, parseWritingFeedback, readFirstValidJson, recurringRuleKeys, targetWords, updateErrorHistory, writeRedundantJson } from '../src/lib/ielts-writing.ts';
import { readFileSync } from 'node:fs';

test('counts IELTS words and returns task targets deterministically', () => {
  assert.equal(countWords('  One   two\nthree  '), 3);
  assert.equal(countWords(''), 0);
  assert.equal(targetWords('task2'), 250);
  assert.equal(targetWords('task1-academic'), 150);
});

test('restores only valid user-selected writing stages', () => {
  assert.equal(coerceWritingStage('0'), 0);
  assert.equal(coerceWritingStage('3'), 3);
  assert.equal(coerceWritingStage('4'), null);
  assert.equal(coerceWritingStage('not-a-stage'), null);
  assert.equal(coerceWritingStage(null), null);
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

test('correction response mode requests a corrected local answer instead of a hint', () => {
  const prompt = buildWritingReviewPrompt({ task: 'task2', question: '', essay: 'Parents provide the emotional support.', originalEssay: '', mode: 'diagnose', outputLanguage: 'en', responseFormat: 'json', guidanceMode: 'correction' });
  assert.match(prompt, /"correction": "the corrected version of quote only/);
  assert.match(prompt, /omit selfRevisionPrompt/);
  assert.doesNotMatch(prompt, /"selfRevisionPrompt":/);
});

test('accepts correction-mode feedback without a self-revision prompt', () => {
  const feedback = parseWritingFeedback('{"summary":"Article error","issues":[{"id":"1","category":"Grammar","severity":"medium","quote":"provide the emotional support","explanation":"The article is unnecessary.","correction":"provide emotional support","ruleKey":"article_usage"}]}');
  assert.equal(feedback.issues[0]?.quote, 'provide the emotional support');
  assert.equal(feedback.issues[0]?.correction, 'provide emotional support');
});

test('language-upgrade originals participate in the same editor highlighting', () => {
  const essay = 'Parents can provide the emotional support for their children.';
  const chunks = highlightQuotedText(essay, [{ id: 'upgrade-0', quote: 'provide the emotional support' }]);
  const highlighted = chunks.find((chunk) => chunk.highlighted);
  assert.equal(highlighted?.text, 'provide the emotional support');
  assert.deepEqual(highlighted?.issueIds, ['upgrade-0']);
});

test('maps AI quote fragments back to highlighted essay text', () => {
  const essay = 'People is worried. Children’s progress — matters.';
  const chunks = highlightQuotedText(essay, [{ id: 'grammar-1', quote: 'people is' }, { id: 'grammar-2', quote: "Children's progress - matters" }]);
  assert.equal(chunks.map((chunk) => chunk.text).join(''), essay);
  assert.equal(chunks.find((chunk) => chunk.highlighted)?.text, 'People is');
  assert.deepEqual(chunks.find((chunk) => chunk.highlighted)?.issueIds, ['grammar-1']);
  assert.ok(chunks.some((chunk) => chunk.highlighted && chunk.issueIds.includes('grammar-2')));
});

test('finds a quote range for editor selection with punctuation normalization', () => {
  const essay = 'First paragraph.\nChildren’s progress — matters.';
  assert.deepEqual(findQuotedTextRange(essay, "Children's progress - matters"), { start: 17, end: 46 });
  assert.equal(findQuotedTextRange(essay, 'missing text'), null);
});

test('matches visually identical AI quotes despite invisible and compatibility characters', () => {
  const essay = 'The\u00a0result\u200b was “ｕｎｅｘｐｅｃｔｅｄ”—but useful.';
  const quote = '“The result was "unexpected" - but useful.”';
  const range = findQuotedTextRange(essay, quote);
  assert.deepEqual(range, { start: 0, end: essay.length });
  const chunks = highlightQuotedText(essay, [{ id: 'unicode-issue', quote }]);
  assert.equal(chunks.map((chunk) => chunk.text).join(''), essay);
  assert.ok(chunks.some((chunk) => chunk.highlighted && chunk.issueIds.includes('unicode-issue')));
});

test('accepts the common escaped-underscore defect in otherwise valid model JSON', () => {
  const feedback = parseWritingFeedback('{"summary":"清楚","issues":[{"id":"1","category":"Grammar","severity":"high","quote":"people is","explanation":"说明","selfRevisionPrompt":"提示","ruleKey":"subject\\_verb\\_agreement"}]}');
  assert.equal(feedback.issues[0].ruleKey, 'subject_verb_agreement');
});

test('Chinese prompts require Chinese guidance but preserve verbatim English quotes', () => {
  const prompt = buildWritingReviewPrompt({ task: 'task2', question: '', essay: 'People is worried.', originalEssay: '', mode: 'diagnose', outputLanguage: 'zh', responseFormat: 'json' });
  assert.match(prompt, /Simplified Chinese/);
  assert.match(prompt, /verbatim substring copied from Current draft/);
  assert.match(prompt, /Never translate/);
});

test('split workspace keeps a single reachable scrollbar with bottom padding', () => {
  const workbench = readFileSync(new URL('../src/components/modules/ielts/writing-workbench.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  assert.match(workbench, /xl:min-h-0 xl:overflow-y-auto[^']*xl:pb-8/);
  assert.match(css, /aside\[data-scroll-region\] > article\[data-scroll-region\][\s\S]*max-height: none !important/);
});
