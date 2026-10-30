import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CUE_EDITOR_DRAFT_KEY,
  clearCueManagerEditorDraft,
  cueManagerEditorDraftHasContent,
  readCueManagerEditorDraft,
  writeCueManagerEditorDraft,
  type CueManagerEditorDraft,
} from '../src/lib/learning/cue-editor-draft.ts';

const blankDraft: CueManagerEditorDraft = {
  subjectName: '数学', unit: '函数', subsection: '', editingId: '', prompt: '', subtitle: '', answer: '',
  type: 'definition', display: 'definition-card', choices: '', correctChoice: 0, markingPoints: '',
};

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(CUE_EDITOR_DRAFT_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    has: (key: string) => values.has(key),
  };
}

test('saves every editor field and restores a partially typed definition', () => {
  const storage = memoryStorage();
  const draft = { ...blankDraft, prompt: '函数是', answer: '设定义域为', markingPoints: '定义域' };
  writeCueManagerEditorDraft(storage, draft);
  assert.deepEqual(readCueManagerEditorDraft(storage), draft);
  assert.equal(cueManagerEditorDraftHasContent(draft), true);
});

test('clears the local draft after save or deliberate discard', () => {
  const storage = memoryStorage();
  writeCueManagerEditorDraft(storage, { ...blankDraft, prompt: '未保存定义' });
  clearCueManagerEditorDraft(storage);
  assert.equal(readCueManagerEditorDraft(storage), null);
  assert.equal(storage.has(CUE_EDITOR_DRAFT_KEY), false);
});

test('ignores corrupt or invalid draft data without breaking the editor', () => {
  assert.equal(readCueManagerEditorDraft(memoryStorage('{broken')), null);
  assert.equal(readCueManagerEditorDraft(memoryStorage(JSON.stringify({ ...blankDraft, type: 'invalid' }))), null);
  assert.equal(cueManagerEditorDraftHasContent(blankDraft), false);
});
