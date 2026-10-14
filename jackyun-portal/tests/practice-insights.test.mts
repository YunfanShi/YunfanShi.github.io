import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEmptyScheduleState } from '../src/lib/learning/schedule-control.ts';
import { applyPracticeSession, validateSession, type PracticeSession } from '../src/lib/learning/practice-timer.ts';
import { normalizeTimedPractice, type TimedPracticeRecord } from '../src/lib/learning/timed-practice.ts';
import { practiceBreakdowns } from '../src/lib/learning/practice-insights.ts';

function sample() {
  const session: PracticeSession = { id:'unit-session', date:'2026-10-14', subject:'Mechanics', source:'B', independent:true, scope:'Textbook M1', unit:'Forces', subsection:'Equilibrium', mode:'normal', index:0, updatedAt:1, finished:true, questions:[
    {id:'q1',name:'Q1',typeId:'force',typeName:'Forces',limitSeconds:60,elapsedMs:30000,startedAt:null,result:'correct',blocked:false,node:'',cause:'',retest:''},
    {id:'q2',name:'Q2',typeId:'force',typeName:'Forces',limitSeconds:60,elapsedMs:90000,startedAt:null,result:'wrong',blocked:true,node:'',cause:'审题',retest:'',unit:'Energy',subsection:'Work'},
    {id:'q3',name:'Q3',typeId:'force',typeName:'Forces',limitSeconds:60,elapsedMs:45000,startedAt:null,result:'pending',blocked:false,node:'',cause:'',retest:''},
  ] };
  return applyPracticeSession(createEmptyScheduleState(),session);
}
test('grouping expands timer questions once, inherits session units and excludes pending questions',()=>{
  const groups=practiceBreakdowns(sample(),'2026-10-14');
  assert.equal(groups.subjects.length,1);assert.equal(groups.subjects[0].attempted,2);assert.equal(groups.subjects[0].onTimeRate,50);assert.equal(groups.subjects[0].overtimeRate,50);
  assert.equal(groups.subjects[0].blocked,1);assert.equal(groups.subjects[0].minutes,2);
  assert.equal(groups.units.find(row=>row.unit==='Forces')?.attempted,1);assert.equal(groups.units.find(row=>row.unit==='Energy')?.failed,1);
  assert.equal(groups.subsections.find(row=>row.subsection==='Equilibrium')?.onTimeRate,100);
  assert.deepEqual(groups.subsections.find(row=>row.subsection==='Work')?.bottlenecks,['审题']);
});
test('manual evidence and missing unit metadata group separately; new-scope criteria match weekly metrics',()=>{
  const state=sample();
  const manual:TimedPracticeRecord={id:'manual',date:'2026-10-14',subject:'Physics',source:'C',reference:'Mock',independent:false,minutes:10,onTime:1,overtime:1,failed:0,blocked:0,bottleneck:'时间'};
  state.timedPracticeRecords!.push(manual,{...manual,id:'outside',date:'2026-10-01'});
  const all=practiceBreakdowns(state,'2026-10-14');assert.equal(all.subjects.reduce((n,row)=>n+row.attempted,0),4);assert.equal(all.units.find(row=>row.subject==='Physics')?.unit,'未填写单元');
  assert.equal(practiceBreakdowns(state,'2026-10-14','new').subjects.length,1);
  assert.equal(normalizeTimedPractice([{...manual,unit:42}]).length,0);
  assert.throws(()=>validateSession({...state.practiceSessions![0],subsection:'x'.repeat(201)}));
  assert.throws(()=>validateSession({...state.practiceSessions![0],questions:state.practiceSessions![0].questions.map(q=>({...q,unit:42}))}));
});
