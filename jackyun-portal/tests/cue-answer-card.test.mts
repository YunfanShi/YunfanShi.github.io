import test from 'node:test';
import assert from 'node:assert/strict';
import { editCueAnswerCard, compareCueAnswerCard, checkCueAnswerPoint, cueAnswerCardId } from '../src/lib/learning/cue-answer-card.ts';
import { checkpointCueAnswerDraft, moveCueAnswerDraftHistory, parseCueAnswerDraftHistory, writeCueAnswerDraftHistory, readCueAnswerDraftHistory } from '../src/lib/learning/cue-answer-draft-history.ts';
import { createEmptyScheduleState, type StudyCue } from '../src/lib/learning/schedule-control.ts';
const cue = { id: 'c', prompt: 'Mean?', answer: 'sum / n', markingPoints: ['Sum values', 'Divide by count'], version: 2 } as StudyCue;
test('comparison automatically checks local matches once and preserves manual adjustments', () => {
  let cards = compareCueAnswerCard(editCueAnswerCard([], 's', 'c', 'Sum values and divide by count', 't1'), 's', cue, 't2');
  assert.deepEqual(cards[0].comparison?.checkedPoints, [0, 1]);
  cards = checkCueAnswerPoint(cards, cards[0].id, 0, false, 't3');
  assert.deepEqual(compareCueAnswerCard(cards, 's', cue, 't4')[0].comparison?.checkedPoints, [1]);
  cards = editCueAnswerCard(cards, 's', 'c', 'Sum values', 't5');
  assert.deepEqual(compareCueAnswerCard(cards, 's', cue, 't6')[0].comparison?.checkedPoints, [0]);
});
test('blank answers never create comparisons or records', () => {
  const empty = [];
  assert.equal(editCueAnswerCard(empty, 's', 'c', '  ', 'now'), empty);
  assert.equal(compareCueAnswerCard(empty, 's', cue, 'now'), empty);
  const cards = editCueAnswerCard([], 's', 'c', 'answer', 'now');
  const cleared = editCueAnswerCard(cards, 's', 'c', '', 'later');
  assert.equal(compareCueAnswerCard(cleared, 's', cue, 'later'), cleared);
});
test('comparison snapshots reference and self checks; editing invalidates it', () => {
  const cards = compareCueAnswerCard(editCueAnswerCard([], 's', 'c', 'my answer', 't1'), 's', cue, 't2');
  assert.deepEqual(cards[0].comparison?.markingPoints, cue.markingPoints);
  assert.notEqual(cards[0].comparison?.markingPoints, cue.markingPoints);
  const checked = checkCueAnswerPoint(cards, cards[0].id, 1, true, 't3');
  assert.deepEqual(checkCueAnswerPoint(checked, cards[0].id, 1, true, 't4')[0].comparison?.checkedPoints, [1]);
  assert.deepEqual(checkCueAnswerPoint(checked, cards[0].id, 1, false, 't4')[0].comparison?.checkedPoints, []);
  assert.deepEqual(checkCueAnswerPoint(checked, cards[0].id, 99, true, 't4'), checked);
  assert.equal(editCueAnswerCard(checked, 's', 'c', 'new answer', 't5')[0].comparison, undefined);
  assert.equal(cards[0].text, 'my answer');
});
test('answers persist per session with unambiguous identities and bounded input', () => {
  let cards = editCueAnswerCard([], 's', 'c', 'first', 't1');
  cards = editCueAnswerCard(cards, 's2', 'c', 'x'.repeat(10001), 't2');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].text, 'first');
  assert.equal(cards[1].text.length, 10000);
  assert.notEqual(cueAnswerCardId('a:b', 'c'), cueAnswerCardId('a', 'b:c'));
  const restored = JSON.parse(JSON.stringify({ ...createEmptyScheduleState(), cueAnswerCards: cards }));
  assert.deepEqual(restored.cueAnswerCards, cards);
});

test('local answer drafts checkpoint five recoverable versions, branch after restore, and survive serialization', () => {
  const storage = new Map<string, string>();
  const adapter = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) };
  let history = parseCueAnswerDraftHistory(undefined, 'start', 't0');
  for (let index = 1; index <= 6; index++) {
    history = { ...history, text: `version ${index}` };
    history = checkpointCueAnswerDraft(history, `t${index}`);
  }
  assert.deepEqual(history.versions.map((version) => version.text), ['version 2', 'version 3', 'version 4', 'version 5', 'version 6']);
  history = moveCueAnswerDraftHistory(history, -1);
  assert.equal(history.text, 'version 5');
  history = { ...history, text: 'revised from v5' };
  history = checkpointCueAnswerDraft(history, 't7');
  assert.deepEqual(history.versions.map((version) => version.text), ['version 2', 'version 3', 'version 4', 'version 5', 'revised from v5']);
  assert.equal(writeCueAnswerDraftHistory('session', 'cue', history, adapter), true);
  assert.deepEqual(readCueAnswerDraftHistory('session', 'cue', '', adapter), history);
});

test('single answer-card shortcut insertions close without changing saved answers', async () => {
  const { cueAnswerInput, isCueAnswerShortcut } = await import('../src/lib/learning/cue-answer-card.ts');
  for (const symbol of ['~', '～', '·', '`']) {
    assert.equal(isCueAnswerShortcut(symbol), true);
    assert.deepEqual(cueAnswerInput('answer', `a${symbol}r`, symbol), { text: 'answer', close: true });
    assert.deepEqual(cueAnswerInput('answer', symbol), { text: 'answer', close: true });
    for (const [before, after] of [['', symbol], ['answer', `ans${symbol}wer`], ['answer', `answer${symbol}`]])
      assert.deepEqual(cueAnswerInput(before, after), { text: before, close: true });
  }
  for (const text of ['a · b', 'some ~ text', '整段答案～', 'normal answer'])
    assert.deepEqual(cueAnswerInput('', text), { text, close: false });
  assert.deepEqual(cueAnswerInput('a·b', 'ab'), { text: 'ab', close: false });
  assert.deepEqual(cueAnswerInput('a·b', 'a·b'), { text: 'a·b', close: false });
});
