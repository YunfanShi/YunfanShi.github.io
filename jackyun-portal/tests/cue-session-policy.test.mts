import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultCuePracticePolicy, emptyCuePractice, rateCuePractice, dueCuePractice, enterCuePractice, rescheduleCuePractice, cuePracticeLabel } from '../src/lib/learning/cue-practice.ts';
import { createEmptyScheduleState, tasksForDate, type StudyCue } from '../src/lib/learning/schedule-control.ts';
import { readScheduleState } from '../src/lib/learning/workspace-reader.ts';
import { normalizeDidaTasks, didaTasksForDate } from '../src/lib/integrations/dida-schedule.ts';

test('question policy waits for five other retrievals even after the clock deadline', () => {
  const policy = defaultCuePracticePolicy;
  let state = rateCuePractice(emptyCuePractice(), 'wrong', 'unclear', true, 0, () => 0, policy);
  assert.equal(dueCuePractice(state, 999_999, undefined, false, policy), undefined);
  for (let i=0;i<4;i++) state = rateCuePractice(state, `ok${i}`, 'stable', true, 0, () => 0, policy);
  assert.equal(dueCuePractice(state, 999_999, undefined, false, policy), undefined);
  state = rateCuePractice(state, 'ok5', 'stable', true, 0, () => 0, policy);
  assert.equal(dueCuePractice(state, 1, undefined, false, policy)?.cueId, 'wrong');
});
test('time policy ignores retrieval count and opens exactly at the selected minute', () => {
  const policy = { ...defaultCuePracticePolicy, trigger: 'time' as const, minutes: 2 };
  let state = rateCuePractice(emptyCuePractice(), 'wrong', 'partial', true, 0, () => 0, policy);
  state = { ...state, completed: 100 };
  assert.equal(dueCuePractice(state, 119_999, undefined, false, policy), undefined);
  assert.equal(dueCuePractice(state, 120_000, undefined, false, policy)?.cueId, 'wrong');
  assert.equal(cuePracticeLabel(state, 'wrong', 119_999, false, policy), '等待间隔');
});
test('switching policy resets pending windows without losing passed history', () => {
  const policy = { ...defaultCuePracticePolicy, trigger: 'time' as const, minutes: 7, questions: 3 };
  let state = rateCuePractice(emptyCuePractice(), 'wrong', 'partial', true, 0);
  state = { ...state, results: { passed: { status: 'stable', attempts: 1, reviewedAt: 20 } } };
  const updated = rescheduleCuePractice(state, 50_000, policy);
  assert.equal(updated.pending[0].after, 4); assert.equal(updated.pending[0].availableAt, 470_000);
  assert.deepEqual(updated.results, state.results);
});
test('manual completed-round retry avoids a dead end and returns by identity', () => {
  const state = rateCuePractice(emptyCuePractice(), 'wrong', 'unclear', true, 0, () => 0, defaultCuePracticePolicy);
  assert.equal(enterCuePractice(state, 1, undefined, 'next', false, false, defaultCuePracticePolicy).active, undefined);
  const manual = enterCuePractice(state, 1, undefined, 'next', true, true, defaultCuePracticePolicy);
  assert.equal(manual.active, 'wrong'); assert.equal(manual.returnCueId, 'next');
});
test('turning automatic tasks off retains manual work, Cues and evidence', () => {
  const now = new Date(2026,9,14,12); const state = createEmptyScheduleState();
  state.cues = [{ id:'due', subjectId:'math',subjectName:'Math',unit:'U',subsection:'',prompt:'Recall',type:'definition',status:'unclear',nextReviewDate:'2026-10-14',lastReviewedAt:'2026-10-13T00:00:00Z',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z',intervalDays:1,easeFactor:2.5,streak:0,markingPoints:[] } as StudyCue];
  state.manualTasks = [{ id:'manual',title:'My plan',type:'custom',date:'2026-10-14',durationMinutes:10 }];
  assert.ok(tasksForDate(state, now).some(task => !task.manual));
  const paused = { ...state, settings: { ...state.settings, automaticTasksEnabled: false } };
  assert.deepEqual(tasksForDate(paused, now).map(task=>task.key), ['manual']);
  assert.deepEqual(paused.cues,state.cues); assert.deepEqual(paused.cueReviews,state.cueReviews);
  assert.ok(tasksForDate({ ...paused, settings: { ...paused.settings, automaticTasksEnabled: true } }, now).length > 1);
});
test('auto-task preference survives reload; legacy snapshots keep their prior behavior', () => {
  const state = createEmptyScheduleState(); state.settings.automaticTasksEnabled=false;
  assert.equal(readScheduleState({ getItem:()=>JSON.stringify(state) }).settings.automaticTasksEnabled,false);
  const legacy = structuredClone(state) as unknown as {settings:Record<string,unknown>}; delete legacy.settings.automaticTasksEnabled;
  assert.equal(readScheduleState({getItem:()=>JSON.stringify(legacy)}).settings.automaticTasksEnabled,true);
});
test('remote tasks respect account task time zone and reject mismatched projects', () => {
  const tasks = normalizeDidaTasks([{id:'a',projectId:'p',title:'Timed',startDate:'2026-10-13T20:00:00+0000',timeZone:'Asia/Shanghai',status:0,isAllDay:false},{id:'b',projectId:'other',title:'Excluded'}], 'p');
  assert.equal(tasks.length,1);assert.equal(tasks[0].date,'2026-10-14');assert.equal(tasks[0].start,'04:00');
});
test('completed, overdue and undated tasks remain distinguishable on the timeline', () => {
  const tasks = normalizeDidaTasks([{id:'a',projectId:'p',title:'Overdue',startDate:'2026-10-13T00:00:00+0800',isAllDay:true,status:0},{id:'b',projectId:'p',title:'Completed',startDate:'2026-10-14T00:00:00+0800',isAllDay:true,status:2},{id:'c',projectId:'p',title:'No date',status:0},{id:'d',projectId:'p',title:'Future',startDate:'2026-10-15T00:00:00+0800',status:0}], 'p');
  assert.deepEqual(didaTasksForDate(tasks,'2026-10-14').map(task=>task.id),['a','c']);
  assert.equal(tasks[0].start,undefined);assert.equal(tasks[1].completed,true);
});
test('completed overdue tasks are hidden on every day', () => {
  const tasks=normalizeDidaTasks([{id:'overdue',projectId:'p',title:'Done today',startDate:'2026-10-10T00:00:00+0800',completedTime:'2026-10-13T20:00:00Z',timeZone:'Asia/Shanghai',status:2},{id:'abandoned',projectId:'p',title:'Excluded',status:-1}], 'p');
  assert.equal(tasks.length,1);assert.equal(tasks[0].completedDate,'2026-10-14');
  assert.equal(didaTasksForDate(tasks,'2026-10-14').length,0);assert.equal(didaTasksForDate(tasks,'2026-10-15').length,0);
});
