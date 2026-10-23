import assert from 'node:assert/strict';
import test from 'node:test';
import { watchAiRequest } from '../src/lib/watch/ai-policy.ts';
test('watch dictionary keeps user text separate and uses a short metered streaming response',()=>{
  const request=watchAiRequest({prompt:'abandon',mode:'dictionary',stream:true,apiKey:'ignored'});
  assert.match(request.messages[0].content,/音标/);assert.equal(request.messages[1].content,'abandon');
  assert.equal(request.providerMode,'cloud');assert.equal(request.stream,true);assert.equal(request.max_tokens,400);
  assert.ok(!('_no_thinking' in request));assert.ok(!('apiKey' in request));
});
test('watch AI accepts long input and preserves nonstreaming compatibility',()=>{
  assert.equal(watchAiRequest({prompt:'字'.repeat(2000)}).messages[1].content.length,2000);
  assert.equal(watchAiRequest({prompt:'hello'}).stream,false);
  assert.throws(()=>watchAiRequest({prompt:' '}));assert.throws(()=>watchAiRequest({prompt:'字'.repeat(2001)}));
});
test('watch study assistant asks for checked steps and respects math rendering support',()=>{
  const request=watchAiRequest({prompt:'解这个方程'});
  assert.match(request.messages[0].content,/短步骤/);
  assert.match(request.messages[0].content,/Unicode/);
  assert.equal(request.max_tokens,1000);
  assert.ok(!('_no_thinking' in request));
  const latex=watchAiRequest({prompt:'解这个方程',math_format:'latex-v1'});
  assert.match(latex.messages[0].content,/LaTeX/);
});
