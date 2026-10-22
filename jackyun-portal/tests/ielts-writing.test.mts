import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWritingFeedbackRepairPrompt, buildWritingReviewPrompt, coerceWritingStage, countWords, createWritingArchiveEntry, diffWriting, findQuotedTextRange, highlightQuotedText, parseWritingFeedback, readFirstValidJson, recurringRuleKeys, targetWords, updateErrorHistory, upsertWritingArchive, writeRedundantJson, splitWritingParagraphs, trackWritingQuotes, highlightWritingRanges } from '../src/lib/ielts-writing.ts';
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

test('archives one replaceable final version per essay', () => {
  const first = createWritingArchiveEntry({ essayId: 'essay-a', task: 'task2', question: 'Discuss both views.\nGive reasons.', content: 'One two three.', savedAt: '2026-09-09T10:00:00.000Z', bandEstimate: '6.0–6.5' });
  assert.equal(first.title, 'Task 2 · 2026-09-09');
  assert.equal(first.wordCount, 3);
  const replacement = createWritingArchiveEntry({ essayId: 'essay-a', task: 'task2', question: 'Discuss both views.', content: 'One two three four.', savedAt: '2026-09-09T11:00:00.000Z' });
  assert.deepEqual(upsertWritingArchive([first], replacement), [replacement]);
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

test('builds a constrained repair request for malformed model JSON', () => {
  const prompt = buildWritingFeedbackRepairPrompt('{"summary":"broken', 'hint', 'zh');
  assert.match(prompt, /formatting repair, not a new review/);
  assert.match(prompt, /selfRevisionPrompt/);
  assert.match(prompt, /Simplified Chinese/);
  assert.match(prompt, /MALFORMED RESPONSE/);
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

test('keeps editor highlighting usable when AI changes punctuation only', () => {
  const essay = 'Many students, however, prefer studying at home.';
  const quote = 'students however prefer studying';
  assert.deepEqual(findQuotedTextRange(essay, quote), { start: 5, end: 39 });
  const chunks = highlightQuotedText(essay, [{ id: 'punctuation-only', quote }]);
  assert.equal(chunks.map((chunk) => chunk.text).join(''), essay);
  assert.ok(chunks.some((chunk) => chunk.highlighted && chunk.text === 'students, however, prefer studying'));
});

test('does not highlight paraphrases that merely share a few words', () => {
  assert.equal(findQuotedTextRange('Many students prefer studying at home.', 'students strongly prefer remote lessons'), null);
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

test('language upgrade remains available after a reload loses transient feedback', () => {
  const workbench = readFileSync(new URL('../src/components/modules/ielts/writing-workbench.tsx', import.meta.url), 'utf8');
  const upgradeButton = workbench.match(/<button type="button" disabled=\{Boolean\(loadingMode\)\} onClick=\{\(\) => review\('upgrade'\)\}/);
  assert.ok(upgradeButton);
  assert.doesNotMatch(workbench, /disabled=\{Boolean\(loadingMode\) \|\| !feedback\} onClick=\{\(\) => review\('upgrade'\)\}/);
});

 test('article title is independent from the exam question and survives a final-version resave', () => {
  const input = { essayId: 'article', task: 'task2' as const, question: 'Discuss both views.', content: 'The essay text.', savedAt: '2026-09-27T10:00:00Z', title: '  Learning at home  ' };
  const entry = createWritingArchiveEntry(input);
  assert.equal(entry.title, 'Learning at home');
  assert.equal(entry.question, input.question);
  const replacement = createWritingArchiveEntry({ ...input, title: entry.title, content: 'A revised essay.' });
  assert.equal(upsertWritingArchive([entry], replacement)[0].title, 'Learning at home');
});


test('reader paragraphs preserve authored breaks across pasted text formats', () => {
  assert.deepEqual(splitWritingParagraphs(' Intro.\r\nBody one.\r\n\r\nBody two.\nConclusion. '), ['Intro.', 'Body one.', 'Body two.', 'Conclusion.']);
  assert.deepEqual(splitWritingParagraphs('First.\rSecond.\u2028Third.\u2029Fourth.'), ['First.', 'Second.', 'Third.', 'Fourth.']);
  assert.deepEqual(splitWritingParagraphs('A single paragraph. With two sentences.'), ['A single paragraph. With two sentences.']);
  assert.deepEqual(splitWritingParagraphs('  \n\t\r\n'), []);
  assert.deepEqual(splitWritingParagraphs('Keep  internal spaces.\nNext paragraph.'), ['Keep  internal spaces.', 'Next paragraph.']);
});


test('edited quotes retain their highlight and current wording after deletions and replacements', () => {
  const quote = 'the advantages for taking risks in the personal lives and professional lives can overwhelm the drawbacks';
  const source = 'In conclusion, ' + quote + '. More evidence follows.';
  for (const edited of [
    'the advantages for taking risks in personal and professional lives can overwhelm the drawbacks',
    'the advantages of taking risks in personal and professional lives outweigh the drawbacks',
    'the advantages for taking calculated risks in the personal lives and professional lives can overwhelm the drawbacks',
  ]) {
    const current = 'New opening. In conclusion, ' + edited + '. More evidence follows.';
    const ranges = trackWritingQuotes(source, current, [{ id: 'issue', quote }]);
    assert.equal(ranges.length, 1);
    assert.equal(current.slice(ranges[0].start, ranges[0].end), edited);
    const chunks = highlightWritingRanges(current, ranges);
    assert.equal(chunks.map(chunk => chunk.text).join(''), current);
    assert.equal(chunks.filter(chunk => chunk.highlighted).map(chunk => chunk.text).join(''), edited);
  }
});

test('quote anchors isolate duplicate passages and ignore adjacent inserted text', () => {
  const source = 'First text. Same quoted phrase. Other text. Same quoted phrase.';
  const current = 'New first text. Same edited phrase. Other text. Same quoted phrase.';
  const ranges = trackWritingQuotes(source, current, [{ id: 'same', quote: 'Same quoted phrase' }]);
  assert.deepEqual(ranges.map(range => current.slice(range.start, range.end)), ['Same edited phrase', 'Same quoted phrase']);
  const adjacent = trackWritingQuotes('Before. Target words. After.', 'Before. Inserted Target words extra. After.', [{ id: 'target', quote: 'Target words' }]);
  assert.equal('Before. Inserted Target words extra. After.'.slice(adjacent[0].start, adjacent[0].end), 'Target words');
});

test('deleted passages and unrelated pasted replacements are not highlighted as another sentence', () => {
  assert.deepEqual(trackWritingQuotes('Before. Target words. After.', 'Before. After.', [{ id: 'x', quote: 'Target words' }]), []);
  assert.deepEqual(trackWritingQuotes('Original sentence with a target phrase.', 'Completely unrelated replacement.', [{ id: 'x', quote: 'target phrase' }]), []);
  const ranges = trackWritingQuotes('Before. Target words. After.', 'Before. New wording. After.', [{ id: 'x', quote: 'Target words' }]);
  assert.equal('Before. New wording. After.'.slice(ranges[0].start, ranges[0].end), 'New wording');
});
