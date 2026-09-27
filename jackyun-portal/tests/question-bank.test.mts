import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyQuestionOperations, buildStudyQueue, checkQuestionAnswer, copyCueToQuestion, emptyQuestionBank, emptyResponse,
  itemKey, parseQuestionImport, questionMatchesFilter, questionReviewTasks, readQuestionBank, reconcileQuestionSubjects, reconcileStudyDraft, recordQuestionAttempt, removeQuestion,
  type QuestionBankState, type QuestionContent, type StudyDraft,
} from '../src/lib/learning/question-bank.ts';
import { completeLearningSession, createEmptyScheduleState, cuesForLearningTask, dateKey, postponeLearningTask, recordCueStudyAssessment, tasksForDate, type LearningTask, type StudyCue } from '../src/lib/learning/schedule-control.ts';
import { isSyncableStorageKey, syncValueFits } from '../src/lib/local-workspace.ts';
import { localPageValues } from '../src/lib/backup/local.ts';
import { legacyBackupPage } from '../src/lib/backup/pages.ts';
import { inspectCloudBackup } from '../src/lib/backup/inspection.ts';
import { threeWayMerge } from '../src/lib/sync/merge.ts';
import { joinSyncParts, splitSyncBody } from '../src/lib/sync/transfer.ts';

const at = '2026-09-26T08:00:00.000Z';
const today = new Date('2026-09-27T08:00:00.000Z');
const content: QuestionContent = { subjectId: 'physics', subjectName: 'Physics', unit: 'Forces', subsection: '', type: 'single', prompt: 'Which is a vector?', choices: ['Force', 'Mass'], correctChoices: [0], answer: 'Force', explanation: 'It has direction.', markingPoints: ['direction'], linkedCueIds: [] };
function bankWith(ids = ['q1']) { let index = 0; return applyQuestionOperations(emptyQuestionBank(), ids.map(() => ({ action: 'create', question: content })), at, () => ids[index++]); }
function cue(id = 'c1', subjectId = 'physics'): StudyCue { return { id, subjectId, subjectName: subjectId === 'physics' ? 'Physics' : subjectId, unit: 'Forces', subsection: '', prompt: 'Define force', answer: 'A vector', type: 'definition', markingPoints: ['direction'], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: at, updatedAt: at }; }
function draft(bank: QuestionBankState): StudyDraft { const items = buildStudyQueue([cue()], bank.questions); return { id: 'session-1', mode: 'mixed', task: { key: 'study-task', title: 'Study', detail: '', type: 'special', date: dateKey(today), durationMinutes: 30, subjectId: 'physics', subjectName: 'Physics' }, items, index: 1, revealed: { 'question:q1': true }, responses: { 'question:q1': { ...emptyResponse(), text: 'my answer', submitted: true } }, assessments: {}, updatedAt: today.toISOString() }; }
const correctResponse = { ...emptyResponse(), selectedChoices: [0], submitted: true };

test('import preview rejects invalid objective answers and unknown updates without changing state', () => {
  const bank = bankWith();
  assert.throws(() => parseQuestionImport({ version: 1, operations: [{ action: 'create', question: { ...content, correctChoices: [2] } }] }, bank), /序号/);
  assert.throws(() => parseQuestionImport({ version: 1, operations: [{ action: 'update', id: 'missing', changes: { prompt: 'new' } }] }, bank), /不存在/);
  assert.throws(() => parseQuestionImport({ version: 1, operations: [{ action: 'update', id: 'q1', changes: { version: 9 } }] }, bank), /不支持/);
  assert.equal(bank.questions[0].version, 1);
});

test('incremental import edits only supplied fields and preserves identities and evidence', () => {
  const bank = recordQuestionAttempt(bankWith(), 'q1', 's1', correctResponse, 'partial', at);
  const operations = parseQuestionImport({ version: 1, operations: [{ action: 'update', id: 'q1', changes: { prompt: 'Revised prompt' } }] }, bank);
  const next = applyQuestionOperations(bank, operations, today.toISOString(), () => 'unused');
  assert.equal(next.questions[0].version, 2);
  assert.equal(next.questions[0].answer, content.answer);
  assert.equal(next.questions[0].id, 'q1');
  assert.equal(next.attempts[0].snapshot.prompt, content.prompt);
  assert.equal(next.attempts[0].questionVersion, 1);
  assert.equal(next.reviews.q1.status, 'partial');
});

test('objective checking uses selected sets while missing answers, subjective and paper work remain self assessed', () => {
  const question = bankWith().questions[0];
  assert.equal(checkQuestionAnswer(question, correctResponse), true);
  assert.equal(checkQuestionAnswer(question, { ...correctResponse, selectedChoices: [1] }), false);
  assert.equal(checkQuestionAnswer({ ...question, type: 'multiple', correctChoices: [0, 1] }, { ...correctResponse, selectedChoices: [1, 0] }), true);
  assert.equal(checkQuestionAnswer({ ...question, type: 'multiple', correctChoices: [0, 1] }, correctResponse), false);
  assert.equal(checkQuestionAnswer({ ...question, type: 'boolean', choices: ['正确', '错误'] }, correctResponse), true);
  assert.equal(checkQuestionAnswer({ ...question, correctChoices: [] }, correctResponse), null);
  assert.equal(checkQuestionAnswer({ ...question, type: 'written' }, correctResponse), null);
  assert.equal(checkQuestionAnswer(question, { ...correctResponse, paper: true }), null);
});

test('correctness, score and mastery stay separate and repeated ratings update one attempt', () => {
  let bank = recordQuestionAttempt(bankWith(), 'q1', 's1', { ...correctResponse, score: 1, issue: 'guess' }, 'unclear', at);
  assert.equal(bank.attempts[0].correct, true);
  assert.equal(bank.reviews.q1.status, 'unclear');
  bank = recordQuestionAttempt(bank, 'q1', 's1', { ...correctResponse, score: 2, issue: 'fixed' }, 'partial', today.toISOString());
  assert.equal(bank.attempts.length, 1);
  assert.equal(bank.attempts[0].score, 2);
  assert.equal(bank.attempts[0].reviewedAt, at);
  assert.equal(bank.attempts[0].status, 'partial');
  assert.equal(bank.reviews.q1.nextReviewDate, '2026-09-27');
});

test('invalid score and unsubmitted responses are rejected before recording', () => {
  const bank = bankWith(); bank.questions[0].maxScore = 3;
  assert.throws(() => recordQuestionAttempt(bank, 'q1', 's1', emptyResponse(), 'stable', at), /先提交/);
  assert.throws(() => recordQuestionAttempt(bank, 'q1', 's1', { ...correctResponse, score: 4 }, 'stable', at), /满分/);
  assert.throws(() => recordQuestionAttempt(bank, 'q1', 's1', { ...correctResponse, score: -1 }, 'stable', at), /非负数/);
  assert.equal(bank.attempts.length, 0);
});

test('submitted snapshots survive edits before rating and the answer basis is immutable', () => {
  const bank = bankWith();
  const snapshot = structuredClone(bank.questions[0]);
  const revised = applyQuestionOperations(bank, [{ action: 'update', id: 'q1', changes: { correctChoices: [1], prompt: 'Edited' } }], today.toISOString(), () => 'unused');
  const next = recordQuestionAttempt(revised, 'q1', 's1', correctResponse, 'stable', today.toISOString(), snapshot);
  assert.equal(next.attempts[0].correct, true);
  assert.equal(next.attempts[0].snapshot.version, 1);
  assert.equal(next.questions[0].version, 2);
});

test('review history belongs to questions and grows only with spaced success', () => {
  let bank = bankWith();
  bank = recordQuestionAttempt(bank, 'q1', 's1', correctResponse, 'stable', at);
  bank = recordQuestionAttempt(bank, 'q1', 's2', correctResponse, 'stable', today.toISOString());
  assert.ok(bank.reviews.q1.intervalDays > 1);
  bank = recordQuestionAttempt(bank, 'q1', 's3', correctResponse, 'unclear', '2026-09-28T08:00:00.000Z');
  assert.equal(bank.reviews.q1.intervalDays, 1);
  assert.equal(bank.reviews.q1.nextReviewDate, '2026-09-29');
});

test('same day attempts stay out of automatic decks but can be selected for manual practice', () => {
  const bank = recordQuestionAttempt(bankWith(), 'q1', 's1', correctResponse, 'unclear', today.toISOString());
  assert.equal(questionReviewTasks(bank, today).length, 0);
  assert.equal(questionMatchesFilter(bank.questions[0], bank, 'all', dateKey(today)), true);
  assert.equal(questionMatchesFilter(bank.questions[0], bank, 'weak', dateKey(today)), true);
});

test('multi-link questions follow every selected related Cue without adding unselected content', () => {
  const bank = bankWith(['q1', 'q2']);
  bank.questions[0].linkedCueIds = ['c1', 'c2', 'not-selected'];
  const queue = buildStudyQueue([cue('c1'), cue('c2')], bank.questions);
  assert.deepEqual(queue.map(itemKey), ['cue:c1', 'cue:c2', 'question:q1', 'question:q2']);
  assert.deepEqual(buildStudyQueue([], [bank.questions[0]]), [{ kind: 'question', id: 'q1' }]);
  assert.deepEqual(buildStudyQueue([cue('c1')], []), [{ kind: 'cue', id: 'c1' }]);
});

test('typed references isolate matching Cue and question IDs', () => {
  const bank = bankWith(['c1']);
  const queue = buildStudyQueue([cue('c1')], bank.questions);
  assert.deepEqual(queue.map(itemKey), ['cue:c1', 'question:c1']);
});

test('draft reconciliation restores answers and removes deleted item ratings with stable current position', () => {
  const bank = bankWith(['q1', 'q2']);
  const stored = draft(bank);
  stored.assessments = { 'question:q1': 'stable', 'cue:gone': 'unclear' };
  const restored = reconcileStudyDraft(stored, [cue()], bank.questions);
  assert.equal(restored.responses['question:q1'].text, 'my answer');
  assert.equal(restored.index, 1);
  const removed = reconcileStudyDraft(stored, [cue()], bank.questions.filter((item) => item.id !== 'q1'));
  assert.equal(removed.items.length, 2);
  assert.deepEqual(removed.assessments, {});
  assert.deepEqual(removed.responses, {});
  assert.equal(removed.items[removed.index].id, 'q2');
});

test('deleting questions retains historic snapshots but removes draft membership', () => {
  let bank = recordQuestionAttempt(bankWith(), 'q1', 's1', correctResponse, 'stable', at);
  bank.drafts['session-1'] = draft(bank);
  bank = removeQuestion(bank, 'q1');
  assert.equal(bank.questions.length, 0);
  assert.equal(bank.attempts.length, 1);
  assert.equal(bank.attempts[0].snapshot.prompt, content.prompt);
  assert.equal(bank.drafts['session-1'].items.length, 1);
  assert.equal(bank.reviews.q1, undefined);
});

test('copying a Cue creates a new question without transferring learning history', () => {
  const source = { ...cue(), choices: ['Yes', 'No'], correctChoice: 0, status: 'stable' as const };
  const next = applyQuestionOperations(emptyQuestionBank(), [{ action: 'create', question: copyCueToQuestion(source) }], at, () => 'new-question');
  assert.equal(next.questions[0].id, 'new-question');
  assert.equal(next.questions[0].sourceCueId, source.id);
  assert.deepEqual(next.questions[0].correctChoices, [0]);
  assert.deepEqual(next.reviews, {});
  assert.equal(source.status, 'stable');
});

test('questions and Cues share light-day capacity and heavy days limit both to one batch', () => {
  const state = createEmptyScheduleState();
  state.cues = [cue('a', 'A'), cue('b', 'B'), cue('c', 'C')];
  const bank = bankWith();
  bank.reviews.q1 = { status: 'unclear', intervalDays: 1, easeFactor: 2.5, streak: 0, nextReviewDate: dateKey(today), lastReviewedAt: at, scheduleReason: '' };
  let tasks = tasksForDate(state, today, questionReviewTasks(bank, today));
  assert.equal(tasks.filter((item) => item.cueIds?.length || item.questionIds?.length).length, 2);
  assert.ok(tasks.some((item) => item.questionIds?.includes('q1')));
  state.timetable = { version: 1, name: 'Busy', courses: [{ id: 'course', name: 'Course', color: '#000', review: false, sessions: Array.from({ length: 4 }, (_, index) => ({ day: 7, start: `0${index + 8}:00`, end: `0${index + 8}:40` })) }] };
  tasks = tasksForDate(state, today, questionReviewTasks(bank, today));
  assert.equal(tasks.filter((item) => item.cueIds?.length || item.questionIds?.length).length, 1);
  assert.deepEqual(tasks[0].questionIds, ['q1']);
});

test('merged same-subject learning deduplicates question references and preserves them on postponement', () => {
  const state = createEmptyScheduleState(); state.cues = [cue()];
  const bank = bankWith();
  const tasks = tasksForDate(state, today, questionReviewTasks(bank, today));
  assert.equal(tasks.length, 1);
  assert.deepEqual(tasks[0].cueIds, ['c1']);
  assert.deepEqual(tasks[0].questionIds, ['q1']);
  const postponed = postponeLearningTask(state, tasks[0], '2026-09-28');
  assert.deepEqual(postponed.manualTasks[0].scope?.questionIds, ['q1']);
  assert.deepEqual(tasksForDate(postponed, today, questionReviewTasks(bank, today)), []);
});

test('mixed completion persists independent results, snapshots and is idempotent', () => {
  const bank = recordQuestionAttempt(bankWith(), 'q1', 's1', correctResponse, 'partial', today.toISOString());
  let state = createEmptyScheduleState(); state.cues = [cue()];
  state = recordCueStudyAssessment(state, { cueId: 'c1', status: 'stable' }, today, 's1');
  const task: LearningTask = { key: 'task', title: 'Mixed', detail: '', type: 'special', date: dateKey(today), durationMinutes: 30, subjectId: 'physics', subjectName: 'Physics' };
  const evidence = { materials: [], cueIds: ['c1'], newCues: [], assessments: [{ cueId: 'c1', status: 'stable' as const }], cueReviewsAlreadyRecorded: true, questionAttempts: bank.attempts, sessionId: 's1' };
  const complete = completeLearningSession(state, task, { studiedContent: '', issue: '', note: '' }, evidence, today);
  assert.equal(complete.cues[0].status, 'stable');
  assert.equal(complete.learningRecords[0].status, 'partial');
  assert.equal(complete.learningRecords[0].questionAttempts?.[0].status, 'partial');
  assert.equal(complete.cueReviews.length, 1);
  assert.equal(complete.completions.task.questionIds?.[0], 'q1');
  assert.equal(completeLearningSession(complete, task, { studiedContent: '', issue: '', note: '' }, evidence, new Date('2026-09-28')).learningRecords.length, 1);
});

test('question-only completion can pass without inventing Cue evidence', () => {
  const bank = recordQuestionAttempt(bankWith(), 'q1', 's1', correctResponse, 'stable', today.toISOString());
  const task: LearningTask = { key: 'task', title: 'Questions', detail: '', type: 'practice', date: dateKey(today), durationMinutes: 8 };
  const result = completeLearningSession(createEmptyScheduleState(), task, { studiedContent: '', issue: '', note: '' }, { materials: [], cueIds: [], newCues: [], assessments: [], questionAttempts: bank.attempts, sessionId: 's1' }, today);
  assert.equal(result.learningRecords[0].status, 'stable');
  assert.deepEqual(result.learningRecords[0].cues, []);
  assert.ok(result.completions.task);
});

test('question bank, attempts and mixed draft survive serialized sync/backup roundtrip', () => {
  const bank = recordQuestionAttempt(bankWith(), 'q1', 's1', correctResponse, 'partial', at);
  bank.drafts['session-1'] = draft(bank);
  const key = 'jackyun_schedule_questions_v1';
  assert.equal(isSyncableStorageKey(key), true);
  assert.equal(legacyBackupPage(key), 'schedule');
  const values = localPageValues({ [key]: JSON.stringify(bank), unrelated: '{}' }, 'schedule');
  assert.deepEqual(readQuestionBank(JSON.parse(values[key])), bank);
  const inspection = inspectCloudBackup('schedule', { legacy_sync_data: [{ storage_key: key, storage_value: bank }] });
  assert.ok(inspection.facts.includes('题库 1 题'));
  assert.ok(inspection.facts.includes('题目作答 1 次'));
  const large = { ...bank, questions: bank.questions.map((item) => ({ ...item, explanation: 'long'.repeat(110_000) })) };
  const serialized = JSON.stringify(large);
  assert.equal(syncValueFits(large), false);
  const parts = splitSyncBody(serialized);
  assert.equal(JSON.stringify(joinSyncParts(parts)), serialized);
});

test('three-way sync preserves independent question changes and attempts', () => {
  const base = bankWith(['q1', 'q2']);
  const local = applyQuestionOperations(base, [{ action: 'update', id: 'q1', changes: { answer: 'Local answer' } }], today.toISOString(), () => 'unused');
  const remote = recordQuestionAttempt(base, 'q2', 'remote-session', correctResponse, 'partial', today.toISOString());
  const result = threeWayMerge(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  const merged = readQuestionBank(result.merged);
  assert.equal(merged.questions[0].answer, 'Local answer');
  assert.equal(merged.attempts[0].questionId, 'q2');
});

test('malformed saved data raises an error instead of resetting a populated bank', () => {
  assert.throws(() => readQuestionBank({ schemaVersion: 2, questions: [], attempts: [] }), /版本/);
  assert.throws(() => readQuestionBank({ ...bankWith(), questions: [null] }), /对象/);
  assert.throws(() => readQuestionBank({ ...bankWith(), attempts: [{ questionId: 'q1' }] }), /作答历史/);
});

test('an empty explicit Cue deck cannot expand to the entire subject outside daily capacity', () => {
  assert.deepEqual(cuesForLearningTask([cue()], { key: 'course-task', title: 'Course', detail: '', type: 'course-review', date: dateKey(today), durationMinutes: 35, subjectId: 'physics', cueIds: [], scope: { cueIds: [] } }), []);
});

test('catalog renames update live question scope but preserve historical snapshots', () => {
  const bank = recordQuestionAttempt(bankWith(), 'q1', 's1', correctResponse, 'stable', at);
  const next = reconcileQuestionSubjects(bank, [{ id: 'physics', name: 'Physics renamed', units: [{ name: 'Dynamics', subsections: [], renameFrom: 'Forces' }], materialProgress: {} }]);
  assert.equal(next.questions[0].subjectName, 'Physics renamed');
  assert.equal(next.questions[0].unit, 'Dynamics');
  assert.equal(next.attempts[0].snapshot.unit, 'Forces');
  assert.equal(next.attempts[0].snapshot.subjectName, 'Physics');
});

test('rating an old submitted revision does not mark the revised question as reviewed', () => {
  const bank = bankWith();
  const snapshot = structuredClone(bank.questions[0]);
  const edited = applyQuestionOperations(bank, [{ action: 'update', id: 'q1', changes: { answer: 'Revised' } }], '2026-09-27T07:00:00.000Z', () => 'unused');
  const rated = recordQuestionAttempt(edited, 'q1', 's1', correctResponse, 'stable', today.toISOString(), snapshot);
  assert.equal(questionMatchesFilter(rated.questions[0], rated, 'unreviewed', dateKey(today)), true);
  assert.equal(questionReviewTasks(rated, today).length, 0);
  assert.equal(questionReviewTasks(rated, new Date('2026-09-28T08:00:00.000Z')).length, 1);
});
