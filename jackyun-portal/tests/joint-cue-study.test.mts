import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_STUDY_FILTER, jointCueSubjectName, selectJointCues } from '../src/lib/learning/joint-cue-study.ts';
import { buildStudyQueue, emptyQuestionBank, readQuestionBank, reconcileStudyDraft, type StudyDraft } from '../src/lib/learning/question-bank.ts';
import { completeLearningSession, createEmptyScheduleState, cuesForLearningTask, recordCueStudyAssessment, type StudyCue } from '../src/lib/learning/schedule-control.ts';

const today = '2026-10-01';
function cue(id: string, subjectId: string, unit = 'Unit 1'): StudyCue {
  return { id, subjectId, subjectName: subjectId, unit, subsection: '', prompt: id, type: 'definition', markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' };
}
const cues = [cue('p1', 'physics'), cue('p2', 'physics', 'Unit 2'), cue('c1', 'chemistry'), cue('m1', 'math')];

test('joint selection scopes units by subject even when unit names are identical', () => {
  assert.equal(DEFAULT_STUDY_FILTER, 'due');
  assert.deepEqual(selectJointCues(cues, {}, 'all', today, []), []);
  assert.deepEqual(selectJointCues(cues, { physics: ['Unit 2'], chemistry: [] }, 'all', today, []).map((cue) => cue.id), ['p2', 'c1']);
  assert.deepEqual(selectJointCues(cues, { physics: [], chemistry: [] }, 'due', today, []).map((cue) => cue.id), ['p1', 'p2', 'c1']);
});

test('due includes overdue and new items, excludes future and completed today; all still excludes today', () => {
  const input = [cue('new', 'physics'), { ...cue('overdue', 'physics'), lastReviewedAt: '2026-09-28T00:00:00Z', nextReviewDate: '2026-09-30' }, { ...cue('future', 'physics'), lastReviewedAt: '2026-09-30T00:00:00Z', nextReviewDate: '2026-10-03' }, { ...cue('done', 'physics'), lastReviewedAt: '2026-10-01T00:00:00Z', nextReviewDate: today }];
  assert.deepEqual(selectJointCues(input, { physics: [] }, 'due', today, []).map((cue) => cue.id), ['new', 'overdue']);
  assert.deepEqual(selectJointCues(input, { physics: [] }, 'all', today, []).map((cue) => cue.id), ['new', 'overdue', 'future']);
  assert.deepEqual(selectJointCues(input.map((cue) => ({ ...cue, status: 'partial' as const })), { physics: [] }, 'weak', today, []).map((cue) => cue.id), ['new', 'overdue', 'future']);
});

test('cross subject draft reloads and completes with independent ratings and all selected evidence', () => {
  const selected = selectJointCues(cues, { physics: ['Unit 2'], chemistry: [] }, 'due', today, []);
  const items = buildStudyQueue(selected, []);
  const task = { key: 'joint', title: jointCueSubjectName(selected), detail: '', type: 'special' as const, date: today, durationMinutes: 8, subjectName: jointCueSubjectName(selected), cueIds: selected.map((cue) => cue.id), scope: { cueIds: selected.map((cue) => cue.id) } };
  assert.deepEqual(cuesForLearningTask(cues, task), selected);
  const draft: StudyDraft = { id: 'joint', mode: 'cue', task, items, index: 1, revealed: {}, responses: {}, assessments: {}, updatedAt: '2026-10-01T01:00:00Z' };
  const bank = { ...emptyQuestionBank(), drafts: { joint: draft } };
  assert.deepEqual(reconcileStudyDraft(readQuestionBank(JSON.parse(JSON.stringify(bank))).drafts.joint, cues, []).items, items);
  let state = { ...createEmptyScheduleState(), cues };
  const at = new Date('2026-10-01T01:00:00Z');
  state = recordCueStudyAssessment(state, { cueId: 'p2', status: 'stable' }, at, draft.id);
  state = recordCueStudyAssessment(state, { cueId: 'c1', status: 'unclear' }, at, draft.id);
  const result = completeLearningSession(state, task, { studiedContent: '', issue: '', note: '' }, { cueIds: task.cueIds, assessments: [{ cueId: 'p2', status: 'stable' }, { cueId: 'c1', status: 'unclear' }], cueReviewsAlreadyRecorded: true, materials: [], newCues: [], sessionId: draft.id }, at);
  assert.deepEqual(result.learningRecords[0].cues.map((cue) => cue.cueId), ['p2', 'c1']);
  assert.equal(result.cues.find((cue) => cue.id === 'p2')?.status, 'stable');
  assert.equal(result.cues.find((cue) => cue.id === 'c1')?.status, 'unclear');
  assert.equal(result.cues.find((cue) => cue.id === 'p1')?.status, undefined);
  assert.equal(result.cueReviews.length, 2);
});
