import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createEmptyScheduleState } from '../src/lib/learning/schedule-control.ts';
import { applyPracticeSession, mergePracticeSession, practiceEvidence, validateSession, validateConfig, type PracticeSession } from '../src/lib/learning/practice-timer.ts';
import { readScheduleState } from '../src/lib/learning/workspace-reader.ts';
import { weeklyPracticeSummary } from '../src/lib/learning/timed-practice.ts';
import { scheduleHasContent } from '../src/lib/sync/schedule-safety.ts';
import { threeWayMerge } from '../src/lib/sync/merge.ts';
const context: Record<string, unknown> = { structuredClone, crypto:webcrypto };
runInNewContext(readFileSync(new URL('../public/practice-engine.js',import.meta.url),'utf8'),context);
// Exercise the exact browser engine rather than a duplicate timer implementation.
const E=context.PracticeEngine as { presets:(s:string)=>Array<{id:string;seconds:Record<string,number>}>; question:(i:number,t:unknown,m:string)=>PracticeSession['questions'][number]; toggle:(s:PracticeSession,n:number)=>PracticeSession; switchQuestion:(s:PracticeSession,i:number,n:number)=>PracticeSession; settle:(s:PracticeSession,n:number)=>PracticeSession; elapsed:(q:PracticeSession['questions'][number],n:number)=>number; color:(q:PracticeSession['questions'][number],n:number)=>string; status:(q:PracticeSession['questions'][number],n:number)=>string; report:(s:PracticeSession,n:number)=>{totalMs:number} };
function session():PracticeSession { return {id:'first',date:'2026-10-13',subject:'Pure Math',source:'B',independent:true,scope:'',mode:'exam',index:0,updatedAt:0,finished:false,questions:[E.question(0,E.presets('Pure Math')[0],'exam')]}; }
test('pause, revisit, and switch preserve independent question time and total',()=>{
  let s=session();s=E.toggle(s,1000);s.questions.push(E.question(1,E.presets('Pure Math')[0],'exam'));s=E.switchQuestion(s,1,11000);
  assert.equal(s.questions[0].elapsedMs,10000);assert.equal(E.elapsed(s.questions[1],16000),5000);assert.equal(E.report(s,16000).totalMs,15000);
  s=E.toggle(s,16000);assert.equal(E.report(s,96000).totalMs,15000);s=E.switchQuestion(s,0,96000);assert.equal(s.questions[0].startedAt,null);
  s=E.toggle(s,100000);s=E.toggle(s,105000);assert.equal(s.questions[0].elapsedMs,15000);assert.equal(s.questions[1].elapsedMs,5000);
});
test('remaining percentage thresholds and overtime are separate from correctness',()=>{
  const q=session().questions[0];q.limitSeconds=100;q.elapsedMs=69999;assert.equal(E.color(q,0),'green');q.elapsedMs=70000;assert.equal(E.color(q,0),'yellow');q.elapsedMs=90000;assert.equal(E.color(q,0),'red');q.elapsedMs=100001;assert.equal(E.color(q,0),'overtime');
  q.result='wrong';assert.equal(E.status(q,0),'red');q.result='correct';assert.equal(E.status(q,0),'yellow');q.elapsedMs=100000;assert.equal(E.status(q,0),'green');q.result='pending';assert.equal(E.status(q,0),'pending');
});
test('pending results persist without corrupting weekly first-attempt metrics',()=>{
  const s=session();s.finished=true;s.questions[0].elapsedMs=60000;assert.equal(practiceEvidence(s),null);let state=applyPracticeSession(createEmptyScheduleState(),s);assert.equal(state.timedPracticeRecords?.length,0);
  s.questions[0].result='correct';state=applyPracticeSession(state,s);state=applyPracticeSession(state,s);assert.equal(state.timedPracticeRecords?.length,1);assert.equal(weeklyPracticeSummary(state.timedPracticeRecords!,'2026-10-13').attempted,1);
  s.questions[0].result='help';s.questions[0].blocked=true;s.questions[0].elapsedMs=(s.questions[0].limitSeconds+1)*1000;s.questions[0].cause='方法选择';state=applyPracticeSession(state,s);assert.equal(state.timedPracticeRecords?.[0].failedOvertime,1);assert.equal(state.timedPracticeRecords?.[0].blocked,1);
  s.source='A';state=applyPracticeSession(state,s);assert.equal(weeklyPracticeSummary(state.timedPracticeRecords!,'2026-10-13').attempted,0);
});
test('custom subjects, preset durations and read/merge/safety survive Schedule storage',()=>{
  for(const name of ['Physics','Mechanics','Statistics','Computer Science','Chemistry','Biology','Economics','History','English Language'])assert.ok(E.presets(name).length>=4);
  assert.equal(E.presets('IELTS').length,0);assert.equal(E.presets('Custom').length,0);
  const times=E.presets('Physics')[0].seconds;assert.equal(times.exam,113);assert.equal(times.normal,135);assert.equal(times.relaxed,169);
  const s=session();s.subject='自定义科目';s.finished=true;s.questions[0].elapsedMs=1200000;s.questions[0].result='correct';const state=applyPracticeSession(createEmptyScheduleState(),s);
  const loaded=readScheduleState({getItem:()=>JSON.stringify(state)});assert.equal(loaded.practiceSessions?.[0].subject,s.subject);assert.equal(loaded.timedPracticeRecords?.[0].subject,s.subject);assert.ok(scheduleHasContent({practiceSessions:[s]}));
  const second=structuredClone(s);second.id='second';const base=createEmptyScheduleState();const merged=threeWayMerge(base,state,applyPracticeSession(base,second));assert.equal(merged.conflicts.length,0);assert.equal((merged.merged as typeof state).practiceSessions?.length,2);
});
test('malformed sessions and configurations never overwrite good records',()=>{
  const s=session();s.questions[0].elapsedMs=-1;assert.throws(()=>validateSession(s));assert.throws(()=>validateConfig({subjects:{},green:10,red:30}));
  assert.throws(()=>validateConfig({subjects:{Physics:[{id:'x',name:'x',description:'',seconds:{relaxed:0,normal:20,exam:20}}]},green:30,red:10}));
  assert.throws(()=>validateConfig({subjects:{},green:30,red:10,volume:2}));assert.throws(()=>validateConfig({subjects:{},green:30,red:10,effects:'yes'}));
  assert.equal(validateConfig({subjects:{},green:30,red:10,volume:0,sound:false,effects:false}).sound,false);
  const good=session();good.finished=true;const saved=applyPracticeSession(createEmptyScheduleState(),good);good.finished=false;assert.throws(()=>applyPracticeSession(saved,good));
});
test('concurrent session edits merge independent fields and preserve conflicting evidence',()=>{
  const base=session(),local=structuredClone(base),remote=structuredClone(base);
  local.questions[0].elapsedMs=6000;local.updatedAt=100;remote.scope='来自另一设备的范围';remote.updatedAt=90;
  const merged=mergePracticeSession(base,local,remote);assert.equal(merged.scope,remote.scope);assert.equal(merged.questions[0].elapsedMs,6000);
  const following=structuredClone(local);following.questions[0].elapsedMs=8000;following.updatedAt=110;
  assert.equal(mergePracticeSession(local,following,merged).scope,remote.scope);
  remote.questions[0].elapsedMs=7000;assert.throws(()=>mergePracticeSession(base,local,remote));
});
