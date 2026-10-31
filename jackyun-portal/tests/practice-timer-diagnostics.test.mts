import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('practice timer reports Schedule read failures with metadata but no Schedule body',()=>{
  const frame=readFileSync(new URL('../src/components/modules/schedule/practice-timer-frame.tsx',import.meta.url),'utf8');
  assert.match(frame,/logger\.error\('PracticeTimer','读取 Schedule 数据失败'/);
  assert.match(frame,/schemaVersion:record\?\.schemaVersion/);
  assert.match(frame,/cuesType:/);
  assert.doesNotMatch(frame,/logger\.error\([^\n]*raw\s*[,}]/);
});

test('settings logger offers error and network filters and renders exception stacks',()=>{
  const viewer=readFileSync(new URL('../src/components/settings/logger-viewer.tsx',import.meta.url),'utf8');
  assert.match(viewer,/setFilter\('errors'\)/);
  assert.match(viewer,/setFilter\('network'\)/);
  assert.match(viewer,/异常堆栈/);
  assert.match(viewer,/errorData\.stack/);
});
