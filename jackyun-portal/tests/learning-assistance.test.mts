import test from 'node:test';
import assert from 'node:assert/strict';
import { cueContentSignature, cueNeedsAiAnalysis, effectiveCueDifficulty, learningProfile, parseLearningAdvice } from '../src/lib/learning/learning-assistance.ts';
import { completeCueReviews, createEmptyScheduleState, dateKey, planCueReview, tasksForDate, type CueReview, type StudyCue } from '../src/lib/learning/schedule-control.ts';
const at = '2026-09-01T08:00:00.000Z';
const cue: StudyCue = { id: 'c1', subjectId: 'math', subjectName: 'Math', unit: 'Indices', subsection: '', prompt: 'State the index laws.', type: 'state', markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: at, updatedAt: at };
const advice = { signature: cueContentSignature(cue), difficulty: 'easy' as const, reason: 'Basic retrieval', generatedAt: at };
function history(status: 'stable' | 'partial' | 'unclear', day: number): CueReview { return { id: `${day}`, cueId: cue.id, status, reviewedAt: `2026-09-${String(day).padStart(2, '0')}T08:00:00.000Z`, nextReviewDate: `2026-09-${String(day + 1).padStart(2, '0')}` }; }

test('difficulty is auxiliary, actual weak results always need a one-day repair', () => {
  const easy = { ...cue, aiAdvice: advice };
  assert.equal(planCueReview(easy, [], 'unclear', new Date(at)).intervalDays, 1);
  assert.equal(planCueReview(easy, [], 'partial', new Date(at)).intervalDays, 1);
  assert.ok(planCueReview(easy, [], 'stable', new Date(at)).intervalDays > planCueReview({ ...cue, userDifficulty: 'hard' }, [], 'stable', new Date(at)).intervalDays);
  assert.equal(effectiveCueDifficulty({ ...easy, userDifficulty: 'extreme' }), 'extreme');
  assert.equal(effectiveCueDifficulty({ ...easy, prompt: 'New content' }), 'medium');
});

test('repeated failures raise effective difficulty using distinct days', () => {
  const easy = { ...cue, aiAdvice: advice };
  assert.equal(effectiveCueDifficulty(easy, [history('unclear', 1), history('unclear', 2), history('unclear', 3)]), 'extreme');
  assert.equal(effectiveCueDifficulty(easy, [history('partial', 1), history('partial', 2), history('stable', 3), history('partial', 4)]), 'hard');
  assert.equal(effectiveCueDifficulty(easy, [history('unclear', 1), history('unclear', 1), history('unclear', 1)]), 'easy');
});

test('stable easy Cues stop daily repetition but never get an interval above eighteen days', () => {
  let state = createEmptyScheduleState(); state.cues = [{ ...cue, aiAdvice: advice }];
  for (let index = 0; index < 12; index += 1) {
    const reviewedAt = new Date(2026, 8, 1 + index * 18, 20);
    state = completeCueReviews(state, [{ cueId: cue.id, status: 'stable' }], reviewedAt);
    assert.ok(state.cues[0].intervalDays <= 18 && state.cues[0].intervalDays >= 3);
    const tomorrow = new Date(reviewedAt); tomorrow.setDate(tomorrow.getDate() + 1);
    assert.equal(tasksForDate(state, tomorrow).some((task) => task.type === 'cue-review' && task.cueIds?.includes(cue.id)), false);
  }
  assert.equal(state.cues[0].intervalDays, 18);
});

test('AI cannot bypass capacity or hide an eighteen-day deadline', () => {
  const date = new Date(2026, 8, 19, 12); const state = createEmptyScheduleState();
  state.dailyLearningAdvice = { date: dateKey(date), batchLimit: 1, reason: 'Rest' };
  state.cues = [{ ...cue, status: 'stable', lastReviewedAt: at, nextReviewDate: '2027-01-01', intervalDays: 100, streak: 9 }, ...['two', 'three'].map((id) => ({ ...cue, id, subjectId: id, status: 'unclear' as const }))];
  const tasks = tasksForDate(state, date).filter((task) => task.type === 'cue-review');
  assert.equal(tasks.length, 2); assert.ok(tasks[0].cueIds?.includes(cue.id));
});

test('AI suggestions validate IDs, difficulty, completeness and bounded capacity', () => {
  assert.throws(() => parseLearningAdvice({ cues: [{ id: 'fake', difficulty: 'easy', reason: 'x' }] }, [cue], at));
  assert.throws(() => parseLearningAdvice({ cues: [] }, [cue], at));
  assert.throws(() => parseLearningAdvice({ cues: [{ id: cue.id, difficulty: 'easy', reason: 'x' }], daily: { batchLimit: 99, reason: 'x' } }, [cue], at));
  const parsed = parseLearningAdvice({ cues: [{ id: cue.id, difficulty: 'medium', reason: 'No prior evidence', qualityIssue: 'Unclear vocabulary', suggestedPrompt: '明确写出需要检索的运算规则' }] }, [cue], at);
  assert.equal(parsed.cues[cue.id].signature, cueContentSignature(cue));
});

test('learner profile counts actual evidence by subject and Cue type', () => {
  const profile = learningProfile([cue], [history('stable', 1), history('partial', 2), history('unclear', 3), { ...history('unclear', 4), cueId: 'deleted' }]);
  assert.deepEqual(profile, [{ subject: 'Math', type: 'state', attempts: 3, weak: 2 }]);
});

test('AI skill labels group general Cues into evidence-backed profile dimensions', () => {
  const general = { ...cue, type: 'general' as const };
  const classified = { ...general, aiAdvice: { ...advice, signature: cueContentSignature(general), skill: 'definition' as const } };
  assert.equal(learningProfile([classified], [history('partial', 1)])[0].type, 'definition');
  assert.equal(learningProfile([{ ...classified, prompt: 'Changed task' }], [history('partial', 1)])[0].type, 'general');
  assert.throws(() => parseLearningAdvice({ cues: [{ id: cue.id, difficulty: 'easy', reason: 'x', skill: 'imaginary' }] }, [cue], at));
});

test('daily-only advice can refresh without inventing or changing Cue ratings', () => {
  const parsed = parseLearningAdvice({ cues: [], daily: { batchLimit: 1, reason: 'Busy coursework' } }, [], at);
  assert.deepEqual(parsed.cues, {});
  assert.equal(parsed.daily?.batchLimit, 1);
  assert.throws(() => parseLearningAdvice({ cues: [], daily: { batchLimit: '2', reason: 'x' } }, [], at));
});

test('eighteen-day question deadlines share the same capacity protection', () => {
  const date = new Date(2026, 8, 19, 12); const state = createEmptyScheduleState();
  state.dailyLearningAdvice = { date: dateKey(date), batchLimit: 1, reason: 'Rest' };
  const questionTasks = ['q1', 'q2'].map((id) => ({ key: id, title: id, detail: '', type: 'practice' as const, date: dateKey(date), durationMinutes: 8, subjectId: id, questionIds: [id], reviewPriority: -1 }));
  assert.equal(tasksForDate(state, date, questionTasks).filter((task) => task.questionIds?.length).length, 2);
});


test('legacy and edited Cues are analyzed automatically, outcomes refresh after three practice days', () => {
  assert.equal(cueNeedsAiAnalysis(cue), true);
  const rated = { ...cue, aiAdvice: advice };
  assert.equal(cueNeedsAiAnalysis(rated), false);
  assert.equal(cueNeedsAiAnalysis({ ...rated, prompt: 'Edited' }), true);
  assert.equal(cueNeedsAiAnalysis(rated, [history('stable', 2), history('stable', 2), history('stable', 2)]), false);
  assert.equal(cueNeedsAiAnalysis(rated, [history('stable', 2), history('partial', 3)]), false);
  assert.equal(cueNeedsAiAnalysis(rated, [history('stable', 2), history('partial', 3), history('unclear', 4)]), true);
  assert.equal(cueNeedsAiAnalysis({ ...rated, aiAdvice: { ...advice, generatedAt: '2026-09-04T09:00:00.000Z' } }, [history('stable', 2), history('partial', 3), history('unclear', 4)]), false);
  assert.equal(cueNeedsAiAnalysis(rated, [2, 3, 4].map((day) => ({ ...history('unclear', day), cueId: 'another' }))), false);
});
