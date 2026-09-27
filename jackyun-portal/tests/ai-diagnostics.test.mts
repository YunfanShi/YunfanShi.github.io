import test from 'node:test';
import assert from 'node:assert/strict';
import { DIAGNOSTIC_EVENT, formatDiagnosticLog, redactDiagnostic, errorDetails, logAiReply, type DiagnosticEvent } from '../src/lib/diagnostic-events.ts';
import { parseAiJson, readAiResponseContent } from '../src/lib/ai-json.ts';

test('AI HTTP 200 plain-text answer is retained together with its parse error and request ID', async () => {
  const target = new EventTarget();
  const events: DiagnosticEvent[] = [];
  target.addEventListener(DIAGNOSTIC_EVENT, (event) => events.push((event as CustomEvent<DiagnosticEvent>).detail));
  Object.defineProperty(globalThis, 'window', { value: target, configurable: true });
  try {
    const context = { requestId: 'test-request', feature: 'cue-rating' };
    const text = await readAiResponseContent(new Response(JSON.stringify({ model: 'test-model', choices: [{ finish_reason: 'length', message: { content: 'No JSON was produced', reasoning_content: 'private reasoning' } }] }), { headers: { 'Content-Type': 'application/json' } }), context);
    assert.throws(() => parseAiJson(text, context), /可读取的 JSON/);
    const serialized = JSON.stringify(events);
    assert.match(serialized, /No JSON was produced/);
    assert.match(serialized, /test-request/);
    assert.match(serialized, /length/);
    assert.doesNotMatch(serialized, /private reasoning/);
    assert.ok(events.some((event) => event.tag === 'AIParse' && event.level === 'error'));
    assert.ok(events.some((event) => event.tag === 'AIResponse' && (event.data as { status: number }).status === 200));
    events.length = 0;
    await assert.rejects(readAiResponseContent(new Response('gateway failed', { status: 502 }), context));
    assert.ok(events.some((event) => event.tag === 'AIResponse' && event.level === 'error'));
    assert.match(JSON.stringify(events), /gateway failed/);
    events.length = 0;
    logAiReply('visible', 'x'.repeat(13_000), context);
    assert.equal(events.length, 3);
    assert.equal(events.map((event) => (event.data as { content: string }).content).join(''), 'x'.repeat(13_000));
  } finally { Reflect.deleteProperty(globalThis, 'window'); }
});

test('diagnostics redact credentials and retain real Error details', () => {
  const data = redactDiagnostic({ authorization: 'Bearer secret', apiKey: 'key', message: 'Bearer abc.def', nested: { reasoning_content: 'hidden', content: 'visible answer' }, error: new Error('actual failure') });
  assert.match(JSON.stringify(data), /actual failure/);
  assert.match(JSON.stringify(data), /visible answer/);
  assert.doesNotMatch(JSON.stringify(data), /abc.def|hidden|Bearer secret/);
  assert.equal(errorDetails(new Error('outer', { cause: new Error('inner') })).message, 'outer');
});

test('copying diagnostics retains response data and stacks including zero HTTP status', () => {
  const formatted = formatDiagnosticLog({ timestamp: 'now', tag: 'AIReply', level: 'error', message: 'failed', status: 0, duration: 0, data: { content: 'full AI reply', requestId: 'id' }, stack: 'actual stack' });
  assert.match(formatted, /full AI reply/);
  assert.match(formatted, /actual stack/);
  assert.match(formatted, /status=0/);
});
