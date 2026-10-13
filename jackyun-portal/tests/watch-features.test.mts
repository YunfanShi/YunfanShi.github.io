import test from 'node:test';
import assert from 'node:assert/strict';
import {readerSegment,readerSelection} from '../src/lib/watch/reader-policy.ts';
import {scheduleSnapshot} from '../src/lib/watch/snapshot.ts';
import {createEmptyScheduleState} from '../src/lib/learning/schedule-control.ts';
test('reader chunks preserve emoji and have no gaps',()=>{
  const source='a'.repeat(5999)+'😀结束';let offset=0,text='';
  while(true){const segment=readerSegment(source,offset);text+=segment.content;if(segment.nextOffset===null)break;offset=segment.nextOffset;}
  assert.equal(text,source);assert.equal(readerSegment(source,0).content.length,5999);
  assert.throws(()=>readerSelection({chapter:-1}));assert.throws(()=>readerSelection({offset:1.5}));assert.throws(()=>readerSegment('abc',4));
});
test('agenda follows existing completion and cancellation rules',()=>{
  const state=createEmptyScheduleState();state.manualTasks=[{id:'one',title:'Plan',type:'custom',date:'2026-10-13',start:'15:00',durationMinutes:25},{id:'done',title:'Done',type:'custom',date:'2026-10-13',durationMinutes:25}];
  state.completions.done={} as typeof state.completions[string];
  const snapshot=scheduleSnapshot(state,new Date('2026-10-13T00:00:00Z'));
  assert.ok(snapshot.agenda.some(task=>task.title==='Plan'&&task.start==='15:00'));
  assert.ok(!snapshot.agenda.some(task=>task.title==='Done'));
  assert.ok(snapshot.learningRecords.length===0);
});
test('reader jump starts before an emoji instead of splitting its surrogate pair',()=>{
  const segment=readerSegment('ab😀cd',3);
  assert.equal(segment.offset,2);assert.equal(segment.content,'😀cd');
});
