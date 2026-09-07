import assert from 'node:assert/strict';
import test from 'node:test';
import { extractAssistantContent, parseAiJson } from '../src/lib/ai-json.ts';

test('extracts the first complete JSON object from model commentary and fences', () => {
  assert.deepEqual(parseAiJson('✅ Result:\n```json\n{"ok":true,"nested":{"value":1}}\n```\nDone.'), {
    ok: true,
    nested: { value: 1 },
  });
});

test('repairs common meaning-preserving model JSON defects', () => {
  const parsed = parseAiJson('{"content":"first line\nsecond line","ruleKey":"subject\\_verb",}') as Record<string, string>;
  assert.equal(parsed.content, 'first line\nsecond line');
  assert.equal(parsed.ruleKey, 'subject_verb');
});

test('rejects truncated JSON instead of inventing missing content', () => {
  assert.throws(() => parseAiJson('{"content":"unfinished"'), /不完整/);
});

test('reads text from common OpenAI-compatible response shapes', () => {
  assert.equal(extractAssistantContent({ choices: [{ message: { content: [{ type: 'text', text: '{"ok":true}' }] } }] }), '{"ok":true}');
  assert.equal(extractAssistantContent({ output_text: 'done' }), 'done');
});
