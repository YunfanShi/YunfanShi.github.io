import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCuePractice, latestCuePracticeAttempt, cuePracticeDirectory, cuePracticeLabel, normalizeCuePractice, cuePracticeReturnIndex, rateCuePractice, dueCuePractice, enterCuePractice } from '../src/lib/learning/cue-practice.ts';
import { createEmptyScheduleState, recordCueStudyAssessment, planCueReview, saveCueStudyDraft, reorderCueStudy, type StudyCue, type CueStudyDraft } from '../src/lib/learning/schedule-control.ts';
import { cueGameProgress } from '../src/lib/learning/cue-game.ts';
import { bufferedCueAnswer } from '../src/lib/learning/cue-answer-card.ts';
const at = new Date(2026, 9, 2, 12);
const cue = { id: 'a', subjectName: 'Physics', subjectId: 'physics', unit: 'U1', subsection: '', prompt: 'Recall', type: 'formula', markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: at.toISOString(), updatedAt: at.toISOString() } as StudyCue;

test('a completed small round opens weak Cues immediately and rotates failed retries', () => {
  let state = rateCuePractice(emptyCuePractice(), 'a', 'unclear', true, 0, () => 0);
  state = rateCuePractice(state, 'b', 'partial', true, 0, () => 0);
  assert.equal(dueCuePractice(state, 0), undefined);
  assert.equal(cuePracticeLabel(state, 'b', 0, true), '待重练');
  state = enterCuePractice(state, 0, undefined, undefined, true, true);
  assert.equal(state.active, 'a');
  state = rateCuePractice(state, 'a', 'unclear', true, 0, () => 0);
  state = enterCuePractice(state, 0, 'a', undefined, true, true);
  assert.equal(state.active, 'b');
  state = rateCuePractice(state, 'b', 'stable', true, 0);
  state = enterCuePractice(state, 0, 'b', undefined, true, true);
  assert.equal(state.active, 'a');
  state = rateCuePractice(state, 'a', 'partial', true, 0, () => 0);
  state = enterCuePractice(JSON.parse(JSON.stringify(state)), 0, 'a', undefined, true, true);
  assert.equal(state.active, 'a', 'the sole remaining weak Cue is accessible after finishing the round');
  state = rateCuePractice(state, 'a', 'stable', true, 0);
  assert.equal(dueCuePractice(state, 0, undefined, true), undefined);
  assert.equal(cuePracticeDirectory(state).length, 2);
});

test('red waits for four other retrievals, yellow for six; edits cannot manufacture a gap', () => {
  for (const [status, gap] of [['unclear', 4], ['partial', 6]] as const) {
    let state = rateCuePractice(emptyCuePractice(), 'a', status, true, 0, () => 0);
    assert.equal(dueCuePractice(state, 0), undefined);
    state = rateCuePractice(state, 'a', 'stable', false, 0);
    assert.equal(state.pending.length, 1);
    assert.equal(state.completed, 1);
    for (let i = 0; i < gap - 1; i++) state = rateCuePractice(state, `other-${i}`, 'stable', true, 0);
    assert.equal(dueCuePractice(state, 0), undefined);
    state = rateCuePractice(state, 'last', 'stable', true, 0);
    assert.equal(dueCuePractice(state, 0)?.cueId, 'a');
  }
});
test('small decks use time, never immediately show the same Cue; retry failures reschedule', () => {
  let state = rateCuePractice(emptyCuePractice(), 'a', 'unclear', true, 0, () => 0);
  assert.equal(dueCuePractice(state, 299_999), undefined);
  assert.equal(dueCuePractice(state, 300_000)?.cueId, 'a');
  assert.equal(dueCuePractice(state, 300_000, 'a'), undefined);
  state = enterCuePractice(state, 300_000);
  assert.equal(state.rating, undefined);
  state = rateCuePractice(state, 'a', 'partial', true, 300_000, () => 0);
  assert.equal(state.completed, 2);
  assert.equal(state.pending[0].after, 8);
  assert.equal(state.pending[0].availableAt, 600_000);
  state = enterCuePractice(state, 600_000);
  state = rateCuePractice(state, 'a', 'stable', true, 600_000);
  assert.equal(state.pending.length, 0);
});
test('delayed practice persists with the draft; shuffle preserves all session evidence', () => {
  const practice = rateCuePractice(emptyCuePractice(), 'a', 'partial', true, 0);
  const draft = { id:'session',task:{subjectName:'Physics'},cueIds:['a','b','c'],index:1,revealed:false,assessments:{a:'partial',b:'stable'},practice,updatedAt:at.toISOString() } as CueStudyDraft;
  const saved = JSON.parse(JSON.stringify(saveCueStudyDraft(createEmptyScheduleState(), draft)));
  assert.deepEqual(saved.cueStudyDrafts.Physics.practice, practice);
  const order = reorderCueStudy(draft.cueIds,draft.assessments,true,'c',()=>0);
  assert.equal(order.cueIds.length,3);
  assert.deepEqual(Object.keys(draft.assessments),['a','b']);
});
test('same-day red to green keeps a next-day confirmation and weak risk, no XP farming', () => {
  let state = { ...createEmptyScheduleState(), cues: [cue] };
  state = recordCueStudyAssessment(state, {cueId:'a',status:'unclear'},at,'session');
  state = recordCueStudyAssessment(state, {cueId:'a',status:'stable'},new Date(at.getTime()+120_000),'session',true);
  assert.equal(state.cueReviews.length,1);
  assert.equal(state.cues[0].nextReviewDate,'2026-10-03');
  assert.equal(state.cues[0].intervalDays,1);
  assert.equal(state.cueReviews[0].sameDayWeak,true);
  assert.equal(state.cueReviews[0].weakestStatus,'unclear');
  assert.equal(state.cueReviews[0].practiceAttempts?.length,1);
  const after = cueGameProgress(state.cueReviews,new Date(at.getTime()+120_001));
  assert.equal(after.xp,10); assert.equal(after.todayCount,1); assert.equal(after.todayEffortCount,2);
  const dayAfter = new Date(2026,9,3,12);
  const plan = planCueReview(state.cues[0],state.cueReviews,'stable',dayAfter);
  assert.match(plan.scheduleReason,/加权风险/);
  assert.equal(cueGameProgress([...state.cueReviews,...state.cueReviews],new Date(at.getTime()+120_001)).effortCount,2);
});
test('simple recoloring is not another retrieval and cannot erase prior red history', () => {
  let state = { ...createEmptyScheduleState(), cues: [cue] };
  state = recordCueStudyAssessment(state,{cueId:'a',status:'unclear'},at,'s');
  state = recordCueStudyAssessment(state,{cueId:'a',status:'stable'},at,'s');
  state = recordCueStudyAssessment(state,{cueId:'a',status:'partial'},at,'s');
  assert.equal(state.cueReviews[0].weakestStatus,'unclear');
  assert.equal(cueGameProgress(state.cueReviews,at).effortCount,1);
});
test('continuing a session the next day adds a new calendar review instead of overwriting yesterday', () => {
  let state = recordCueStudyAssessment({...createEmptyScheduleState(),cues:[cue]},{cueId:'a',status:'partial'},at,'s');
  state = recordCueStudyAssessment(state,{cueId:'a',status:'stable'},new Date(2026,9,3,12),'s',true);
  assert.equal(state.cueReviews.length,2);
  assert.equal(state.cueReviews[0].status,'partial');
});
test('typing bursts persist once and flush the latest draft at close or compare, including empty answers', () => {
  const jobs = new Map<number,()=>void>(); let id=0; const saved:string[]=[];
  const timers = { set: ((fn:()=>void)=>{ jobs.set(++id,fn);return id; }) as unknown as typeof setTimeout, clear: ((handle:number)=>jobs.delete(handle)) as unknown as typeof clearTimeout };
  const buffer = bufferedCueAnswer(text=>saved.push(text),450,timers);
  for (let i=1;i<=100;i++) buffer.write('x'.repeat(i));
  assert.equal(saved.length,0); assert.equal(jobs.size,1);
  [...jobs.values()][0](); jobs.clear();
  assert.deepEqual(saved,['x'.repeat(100)]);
  buffer.write('即时保存'); buffer.flush(); buffer.flush();
  assert.deepEqual(saved,['x'.repeat(100),'即时保存']); assert.equal(jobs.size,0);
  buffer.write(''); buffer.flush(); assert.equal(saved.at(-1),'');
});

test('default buffering calls browser timers with their native receiver, not the adapter object', async () => {
  const { readFileSync } = await import('node:fs');
  const { createRequire } = await import('node:module');
  const { runInNewContext } = await import('node:vm');
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const source = readFileSync(new URL('../src/lib/learning/cue-answer-card.ts',import.meta.url),'utf8');
  const compiled = {exports:{} as {bufferedCueAnswer: typeof bufferedCueAnswer}};
  const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(js,{module:compiled,exports:compiled.exports,setTimeout:function(this:{set?:unknown},callback:()=>void){assert.equal(this?.set,undefined,'native browser timers reject the adapter receiver');return 1;},clearTimeout:function(this:{clear?:unknown}){assert.equal(this?.clear,undefined);}});
  const saved:string[]=[];
  const buffer=compiled.exports.bufferedCueAnswer(text=>saved.push(text));
  buffer.write('a');buffer.write('ab');buffer.flush();
  assert.deepEqual(saved,['ab']);
});

test('a repaired red retains more next-day risk than a repaired yellow', () => {
  const intervals = ['partial','unclear'].map(status => {
    let state=recordCueStudyAssessment({...createEmptyScheduleState(),cues:[cue]},{cueId:'a',status:status as 'partial'|'unclear'},at,'s');
    state=recordCueStudyAssessment(state,{cueId:'a',status:'stable'},at,'s',true);
    return planCueReview(state.cues[0],state.cueReviews,'stable',new Date(2026,9,3,12)).intervalDays;
  });
  assert.ok(intervals[1] < intervals[0]);
});

 test('random windows include both bounds and edits or reloads do not reroll them', () => {
  for (const [status, gaps] of [['unclear', [4,6]], ['partial', [6,10]]] as const) {
    for (const [random, gap, time] of [[0,gaps[0],300_000],[.999999,gaps[1],600_000]]) {
      const state=rateCuePractice(emptyCuePractice(),'a',status,true,0,()=>random);
      assert.equal(state.pending[0].after,1+gap); assert.equal(state.pending[0].availableAt,time);
      assert.deepEqual(normalizeCuePractice(state,{},100,()=>0),state);
      assert.deepEqual(rateCuePractice(state,'a','partial',false,200,()=>0).pending,state.pending);
    }
  }
  const legacy=normalizeCuePractice({completed:3,pending:[{cueId:'a',after:4,availableAt:60_000}]},{a:'unclear'},100,()=>0);
  assert.equal(legacy.pending[0].after,7); assert.equal(legacy.pending[0].availableAt,300_100);
});
test('retry returns to the same unreviewed Cue after shuffle and can leave an exhausted queue', () => {
  let state=rateCuePractice(emptyCuePractice(),'a','unclear',true,0,()=>0);
  state=enterCuePractice(state,300_000,undefined,'c');
  const order=reorderCueStudy(['a','b','c','d'],{a:'unclear',b:'stable'},true,state.returnCueId,()=>0);
  const visible=order.cueIds.filter(id=>!order.hiddenCueIds.includes(id));
  assert.equal(visible[cuePracticeReturnIndex(state,visible)],'c');
  state=rateCuePractice(state,'a','stable',true,300_000);
  assert.equal(state.pending.length,0);
  assert.equal(enterCuePractice(state,300_000,'a').active,undefined);
  assert.equal(cuePracticeReturnIndex(state,[]),0);
});


test('a failed retry rotates through every other due item, retaining passed items in the directory', () => {
  let state=emptyCuePractice();
  const ids=Array.from({length:12},(_,i)=>`cue-${i}`);
  for (const id of ids) state=rateCuePractice(state,id,'unclear',true,0,()=>0);
  state=enterCuePractice(state,600_000,undefined,'normal',true);
  assert.equal(state.active,ids[0]);
  state=rateCuePractice(state,ids[0],'unclear',true,600_000,()=>0);
  const visited=[ids[0]];
  for(const id of ids.slice(1)){
    state=enterCuePractice(state,600_000,state.active);
    assert.equal(state.active,id);visited.push(id);
    state=rateCuePractice(state,id,'stable',true,600_000);
  }
  assert.deepEqual(visited,ids);
  assert.equal(state.pending.length,1);
  assert.equal(cuePracticeDirectory(state).length,12);
  assert.equal(cuePracticeLabel(state,ids[1],600_000),'重练已通过');
  assert.equal(state.results?.[ids[0]].status,'unclear');
});
test('the most recently practiced item waits when other queued items are not due', () => {
  let state=rateCuePractice(emptyCuePractice(),'a','unclear',true,0,()=>0);
  state=rateCuePractice(state,'b','partial',true,0,()=>.999999);
  state=enterCuePractice(state,300_000,undefined,'normal',true);
  state=rateCuePractice(state,'a','unclear',true,300_000,()=>0);
  state=enterCuePractice(state,599_999,'a');
  assert.equal(state.active,undefined);assert.equal(state.mode,true);assert.equal(state.returnCueId,'normal');
  assert.equal(dueCuePractice({...state,completed:100},599_999)?.cueId,'b');
  assert.equal(dueCuePractice(state,599_999),undefined);
  state=enterCuePractice(state,600_000);
  assert.equal(state.active,'b');
});
test('retry recoloring edits one attempt, preserves primary red and records a passed marker after reload', () => {
  let record=recordCueStudyAssessment({...createEmptyScheduleState(),cues:[cue]},{cueId:'a',status:'unclear'},at,'s');
  let practice=rateCuePractice(emptyCuePractice(),'a','unclear',true,at.getTime(),()=>0);
  practice=enterCuePractice(practice,at.getTime()+300_000,undefined,'b',true);
  record=recordCueStudyAssessment(record,{cueId:'a',status:'partial'},at,'s',true);
  practice=rateCuePractice(practice,'a','partial',true,at.getTime());
  record=recordCueStudyAssessment(record,{cueId:'a',status:'stable'},at,'s',true,true);
  practice=rateCuePractice(practice,'a','stable',false,at.getTime());
  assert.equal(record.cues[0].status,'unclear');assert.equal(record.cueReviews[0].status,'unclear');assert.equal(record.cues[0].streak,0);
  assert.equal(record.cueReviews[0].practiceAttempts?.length,1);
  assert.equal(record.cueReviews[0].practiceAttempts?.[0].status,'stable');
  assert.equal(cueGameProgress(record.cueReviews,at).todayEffortCount,2);
  assert.equal(practice.pending.length,0);assert.equal(practice.results?.a.attempts,1);
  const restored=JSON.parse(JSON.stringify(practice));
  assert.equal(cuePracticeLabel(restored,'a',at.getTime()),'重练已通过');
  assert.deepEqual(cuePracticeDirectory(restored),['a']);
  assert.equal(enterCuePractice(restored,at.getTime(),'a').mode,true);
  // A normal primary rating still changes the primary color.
  record=recordCueStudyAssessment(record,{cueId:'a',status:'stable'},at,'s');
  assert.equal(record.cues[0].status,'stable');
});
test('a retry continued on a new day preserves primary color and counts only its actual attempt', () => {
  let record=recordCueStudyAssessment({...createEmptyScheduleState(),cues:[cue]},{cueId:'a',status:'partial'},at,'s');
  const tomorrow=new Date(2026,9,3,12);
  record=recordCueStudyAssessment(record,{cueId:'a',status:'stable'},tomorrow,'s',true);
  assert.equal(record.cues[0].status,'partial');assert.equal(record.cueReviews[1].status,'partial');
  assert.equal(record.cueReviews[1].practiceOnly,true);
  const progress=cueGameProgress(record.cueReviews,tomorrow);
  assert.equal(progress.effortCount,2);assert.equal(progress.todayEffortCount,1);assert.equal(progress.todayCount,1);
});

test('persistent practice badges follow the latest review and do not inherit an outdated pass', () => {
  let record=recordCueStudyAssessment({...createEmptyScheduleState(),cues:[cue]},{cueId:'a',status:'partial'},at,'s');
  record=recordCueStudyAssessment(record,{cueId:'a',status:'stable'},at,'s',true);
  assert.equal(latestCuePracticeAttempt(JSON.parse(JSON.stringify(record.cueReviews)),'a')?.status,'stable');
  record=recordCueStudyAssessment(record,{cueId:'a',status:'unclear'},new Date(2026,9,3,12),'next');
  assert.equal(latestCuePracticeAttempt(record.cueReviews,'a'),undefined);
});

test('skipping an ungraded retry also visits the full queue rather than bouncing between two Cues', () => {
  let state=emptyCuePractice();
  for (const id of ['a','b','c','d']) state=rateCuePractice(state,id,'unclear',true,0,()=>0);
  const visited=[];
  for(let i=0;i<4;i++) { state=enterCuePractice(state,600_000,state.active,undefined,true);visited.push(state.active); }
  assert.deepEqual(visited,['a','b','c','d']);assert.equal(state.completed,4);
});
