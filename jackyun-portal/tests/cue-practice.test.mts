import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCuePractice, rateCuePractice, dueCuePractice, enterCuePractice } from '../src/lib/learning/cue-practice.ts';
import { createEmptyScheduleState, recordCueStudyAssessment, planCueReview, saveCueStudyDraft, reorderCueStudy, type StudyCue, type CueStudyDraft } from '../src/lib/learning/schedule-control.ts';
import { cueGameProgress } from '../src/lib/learning/cue-game.ts';
import { bufferedCueAnswer } from '../src/lib/learning/cue-answer-card.ts';
const at = new Date(2026, 9, 2, 12);
const cue = { id: 'a', subjectName: 'Physics', subjectId: 'physics', unit: 'U1', subsection: '', prompt: 'Recall', type: 'formula', markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: at.toISOString(), updatedAt: at.toISOString() } as StudyCue;

test('red waits for three other retrievals, yellow for five; edits cannot manufacture a gap', () => {
  for (const [status, gap] of [['unclear', 3], ['partial', 5]] as const) {
    let state = rateCuePractice(emptyCuePractice(), 'a', status, true, 0);
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
  let state = rateCuePractice(emptyCuePractice(), 'a', 'unclear', true, 0);
  assert.equal(dueCuePractice(state, 59_999), undefined);
  assert.equal(dueCuePractice(state, 60_000)?.cueId, 'a');
  assert.equal(dueCuePractice(state, 60_000, 'a'), undefined);
  state = enterCuePractice(state, 60_000);
  assert.equal(state.rating, undefined);
  state = rateCuePractice(state, 'a', 'partial', true, 60_000);
  assert.equal(state.completed, 2);
  assert.equal(state.pending[0].after, 7);
  assert.equal(state.pending[0].availableAt, 150_000);
  state = enterCuePractice(state, 150_000);
  state = rateCuePractice(state, 'a', 'stable', true, 150_000);
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
