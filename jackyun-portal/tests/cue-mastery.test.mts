import { buildStudyQueue } from '../src/lib/learning/question-bank.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyScheduleState, markCueMastered, completeCueReviews, isCueMasteryPaused, cuesForLearningTask, normalizeCueMetadata, type StudyCue, type LearningTask } from '../src/lib/learning/schedule-control.ts';
const at = new Date('2026-10-12T04:00:00Z');
const cue: StudyCue = { id: 'mastery', subjectId: 'math', subjectName: '数学', unit: '函数', subsection: '', type: 'definition', prompt: '函数定义', answer: '映射', markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: at.toISOString(), updatedAt: at.toISOString() };
const task = (date: string): LearningTask => ({ key: 'task', type: 'special', title: '学习', detail: '', date, durationMinutes: 10, subjectId: 'math', cueIds: [cue.id] });
function marked() { return markCueMastered({ ...createEmptyScheduleState(), cues: [cue] }, cue.id, at, 'session'); }
test('mastery pauses all study starts for ten days and repeated K does not extend the cooldown', () => {
 const state = marked(); assert.equal(state.cues[0].nextReviewDate, '2026-10-22');
 assert.equal(cuesForLearningTask(state.cues, task('2026-10-21')).length, 0);
 assert.equal(cuesForLearningTask(state.cues, task('2026-10-22')).length, 1);
 assert.equal(markCueMastered(state, cue.id, new Date('2026-10-14T04:00:00Z'), 'other'), state);
});
test('successful due retrievals grow 10 12 14 16 18 and stop at eighteen', () => {
 let state = marked();
 for(const days of [12,14,16,18,18]) {
  const when = new Date(state.cues[0].nextReviewDate+'T04:00:00Z');
  state = completeCueReviews(state,[{cueId:cue.id,status:'stable'}],when);
  assert.equal(state.cues[0].intervalDays,days); assert.equal(state.cues[0].masteredIntervalDays,days);
 }
});
test('early practice does not extend mastery; wrong or changed content returns to ordinary review', () => {
 let state = marked(); state = completeCueReviews(state,[{cueId:cue.id,status:'stable'}],new Date('2026-10-13T04:00:00Z'));
 assert.equal(state.cues[0].intervalDays,10);
 state = completeCueReviews(state,[{cueId:cue.id,status:'partial'}],new Date('2026-10-14T04:00:00Z'));
 assert.equal(state.cues[0].masteredIntervalDays,undefined); assert.equal(state.cues[0].intervalDays,1);
 const changed={...marked().cues[0],answer:'新答案',updatedAt:'2026-10-13T04:00:00Z'};
 assert.equal(isCueMasteryPaused(changed,'2026-10-13'),false);
 assert.equal(cuesForLearningTask([changed],task('2026-10-13')).length,1);
});

test('mastery survives the persisted schedule JSON and legacy metadata normalization', () => { const state=JSON.parse(JSON.stringify(marked())); const restored=normalizeCueMetadata(state.cues[0],at.toISOString()); assert.equal(isCueMasteryPaused(restored,'2026-10-21'),true); assert.equal(restored.masteredIntervalDays,10); });

test('mixed learning queues also respect the mastery cooldown', () => { const state=marked(); assert.deepEqual(buildStudyQueue(state.cues,[],'2026-10-21'),[]); assert.equal(buildStudyQueue(state.cues,[],'2026-10-22').length,1); });
