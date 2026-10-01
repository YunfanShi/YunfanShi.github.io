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

test('old cue-only joint drafts migrate into the normal Cue page without losing progress', async () => {
  const { legacyCueStudyDraft } = await import('../src/lib/learning/joint-cue-study.ts');
  const { saveCueStudyDraft, allCueStudyDrafts } = await import('../src/lib/learning/schedule-control.ts');
  const items = buildStudyQueue(cues.slice(0, 3), []);
  const old: StudyDraft = { id: 'old-joint', mode: 'cue', task: { key: 'old-joint', title: 'Joint', detail: '', type: 'special', date: today, durationMinutes: 12, subjectName: jointCueSubjectName(cues.slice(0, 3)) }, items, index: 2, revealed: { 'cue:c1': true }, responses: { 'cue:c1': { text: '', selectedChoices: [1], paper: false, submitted: false, issue: '' } }, assessments: { 'cue:p1': 'stable', 'cue:p2': 'partial' }, updatedAt: '2026-10-01T01:00:00Z' };
  const migrated = legacyCueStudyDraft(old, cues)!;
  assert.deepEqual(migrated.cueIds, ['p1', 'p2', 'c1']);
  assert.deepEqual(migrated.assessments, { p1: 'stable', p2: 'partial' });
  assert.equal(migrated.index, 2);
  assert.equal(migrated.revealed, true);
  assert.equal(migrated.selectedChoice, 1);
  assert.equal(migrated.id, old.id);
  const saved = saveCueStudyDraft({ ...createEmptyScheduleState(), cues }, migrated);
  assert.deepEqual(cuesForLearningTask(cues, Object.values(allCueStudyDrafts(JSON.parse(JSON.stringify(saved))))[0].task), cues.slice(0, 3));
  assert.equal(legacyCueStudyDraft({ ...old, mode: 'mixed' }, cues), null);
});

test('pure Cue starts and old Cue resumes reuse the original Cue study entry point', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/components/modules/schedule/schedule-control.tsx', import.meta.url), 'utf8');
  const start = source.slice(source.indexOf('  const startUnifiedStudy ='), source.indexOf('  const resumeUnifiedStudy ='));
  assert.match(start, /if \(mode === 'cue'\) \{ startCueStudy\(/);
  assert.match(source, /onStart=\{startUnifiedStudy\} onResume=\{resumeUnifiedStudy\}/);
});


test('catalog reconciliation cannot fold a joint Cue draft into its longest matching subject', async () => {
  const { legacyCueStudyDraft } = await import('../src/lib/learning/joint-cue-study.ts');
  const { reconcileScheduleSubjects, saveCueStudyDraft, allCueStudyDrafts } = await import('../src/lib/learning/schedule-control.ts');
  const input = [cue('physics-cue', 'Physics'), cue('cs-cue', 'Computer Science')];
  const task = { key: 'joint-catalog', title: 'Joint', detail: '', type: 'special' as const, date: today, durationMinutes: 8, subjectName: jointCueSubjectName(input) };
  const migrated = legacyCueStudyDraft({ id: task.key, task, mode: 'cue', items: buildStudyQueue(input, []), index: 0, revealed: {}, responses: {}, assessments: {}, updatedAt: today }, input)!;
  const state = saveCueStudyDraft({ ...createEmptyScheduleState(), cues: input, learningCatalog: input.map((item) => ({ id: item.subjectId, name: item.subjectName, units: [], materialProgress: {} })) }, migrated);
  const result = reconcileScheduleSubjects(state);
  const saved = Object.values(allCueStudyDrafts(result))[0];
  assert.equal(saved.task.subjectName, task.subjectName);
  assert.equal(saved.task.subjectId, undefined);
  assert.deepEqual(saved.cueIds, input.map((cue) => cue.id));
});
