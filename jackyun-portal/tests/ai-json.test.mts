import assert from 'node:assert/strict';
import test from 'node:test';
import { extractAssistantContent, parseAiJson, readAiStreamingResponseContent } from '../src/lib/ai-json.ts';

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

test('repairs JSON corrupted by the legacy Companion Markdown serializer', () => {
  const escaped = '\\{\\\n"bandEstimate":"6.5–7.0",\\\n"priorities":\\["Fix grammar"\\],\\\n"issues":\\[{"ruleKey":"verb\\_pattern"}\\]\\\n\\}';
  assert.deepEqual(parseAiJson(escaped), {
    bandEstimate: '6.5–7.0',
    priorities: ['Fix grammar'],
    issues: [{ ruleKey: 'verb_pattern' }],
  });
});

test('repairs truncated closing quotes and brackets without adding content', () => {
  assert.deepEqual(parseAiJson('{"content":"unfinished'), { content: 'unfinished' });
});

test('repairs punctuation, quotes, keys, constants, and missing commas from model output', () => {
  assert.deepEqual(parseAiJson("结果：{name：‘Ada’， active: True skills: ['math', 'code',],}"), {
    name: 'Ada',
    active: true,
    skills: ['math', 'code'],
  });
});

test('preserves LaTeX commands when an AI forgets to JSON-escape backslashes', () => {
  const parsed = parseAiJson(String.raw`{"answer":"Use \(a^{-m}=\frac1{a^m}\) and \(a^{1/n}=\sqrt[n]{a}\).","markingPoints":["\(\frac{a^m}{a^n}=a^{m-n}\)"]}`) as {
    answer: string;
    markingPoints: string[];
  };
  assert.equal(parsed.answer, String.raw`Use \(a^{-m}=\frac1{a^m}\) and \(a^{1/n}=\sqrt[n]{a}\).`);
  assert.deepEqual(parsed.markingPoints, [String.raw`\(\frac{a^m}{a^n}=a^{m-n}\)`]);
  assert.equal(/[\b\f]/u.test(parsed.answer), false);
});

test('reads text from common OpenAI-compatible response shapes', () => {
  assert.equal(extractAssistantContent({ choices: [{ message: { content: [{ type: 'text', text: '{"ok":true}' }] } }] }), '{"ok":true}');
  assert.equal(extractAssistantContent({ output_text: 'done' }), 'done');
});

test('reassembles split SSE events and reports visible streaming progress', async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"plan"}}]}\n'));
      controller.enqueue(encoder.encode('\ndata: {"choices":[{"delta":{"content":"{\\"title\\":\\"The"}}]}\n\ndata: {"choices":[{"delta":{"content":" Signal\\"}"}}]}\n\ndata: [DONE]\n\n'));
      controller.close();
    },
  });
  const updates: Array<{ content: string; reasoningCharacters: number }> = [];
  const content = await readAiStreamingResponseContent(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }), (progress) => updates.push(progress));
  assert.equal(content, '{"title":"The Signal"}');
  assert.equal(updates.at(-1)?.content, content);
  assert.equal(updates.at(-1)?.reasoningCharacters, 4);
});
