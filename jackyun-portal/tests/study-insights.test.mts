import test from 'node:test';
import assert from 'node:assert/strict';
import { CUE_RULES, QUESTION_RULES, cueImportPrompt, questionExportOperations, questionImportPrompt } from '../src/lib/learning/study-prompts.ts';
import { studyEvidence, studyMetrics, studyReportData } from '../src/lib/learning/study-insights.ts';
import { applyQuestionOperations, emptyQuestionBank, parseQuestionImport, readQuestionBank, validateQuestion, recordQuestionAttempt, emptyResponse } from '../src/lib/learning/question-bank.ts';
import { createEmptyScheduleState, type StudyCue } from '../src/lib/learning/schedule-control.ts';
const at = '2026-09-27T08:00:00.000Z';
const question = { subjectId: 'math', subjectName: 'Math', unit: 'Indices', subsection: '', type: 'written', prompt: '根据图1计算面积', choices: [], correctChoices: [], answer: '', explanation: '', markingPoints: [], linkedCueIds: [], source: '教材 p.12 Q3', imageRequests: [{ id: 'fig1', description: 'Q3 中长方形图，保留尺寸', source: 'p.12 Q3', placement: 'prompt' }] };
const cue: StudyCue = { id: 'c1', subjectId: 'math', subjectName: 'Math', unit: 'Indices', subsection: '', type: 'formula', prompt: '写出乘方运算规则', markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: at, updatedAt: at };

test('image requirements survive imports, storage and historical attempts independently', () => {
  let bank = applyQuestionOperations(emptyQuestionBank(), parseQuestionImport({ version: 1, operations: [{ action: 'create', question }] }, emptyQuestionBank()), at, () => 'q1');
  assert.equal(readQuestionBank(JSON.parse(JSON.stringify(bank))).questions[0].imageRequests?.[0].source, 'p.12 Q3');
  bank = recordQuestionAttempt(bank, 'q1', 'session1', { ...emptyResponse(), submitted: true, issue: '忘记单位' }, 'partial', at);
  const image = { id: 'image1', url: 'data:image/png;base64,AAAA', alt: '原题图', placement: 'prompt' };
  bank = applyQuestionOperations(bank, parseQuestionImport({ version: 1, operations: [{ action: 'update', id: 'q1', changes: { images: [image], imageRequests: [{ ...question.imageRequests[0], imageId: 'image1' }] } }] }, bank), at, () => 'unused');
  assert.equal(bank.questions[0].imageRequests?.[0].imageId, 'image1');
  assert.equal(bank.attempts[0].snapshot.imageRequests?.[0].imageId, undefined);
  assert.throws(() => validateQuestion({ ...question, imageRequests: [{ ...question.imageRequests[0], imageId: 'fake' }] }));
  assert.throws(() => validateQuestion({ ...question, images: [image], imageRequests: [{ ...question.imageRequests[0], placement: 'answer', imageId: 'image1' }] }));
  assert.throws(() => validateQuestion({ ...question, imageRequests: [question.imageRequests[0], question.imageRequests[0]] }));
});

test('subject charts include independent question snapshots and do not equate green with objective correctness', () => {
  let bank = applyQuestionOperations(emptyQuestionBank(), parseQuestionImport({ version: 1, operations: [{ action: 'create', question }] }, emptyQuestionBank()), at, () => 'q1');
  bank = recordQuestionAttempt(bank, 'q1', 'session1', { ...emptyResponse(), submitted: true, issue: '忘记单位' }, 'stable', at);
  const evidence = studyEvidence([cue], [{ id: 'r1', cueId: cue.id, status: 'partial', reviewedAt: at, nextReviewDate: '2026-09-28', note: 'possibly definition issue' }, { id: 'deleted', cueId: 'deleted', status: 'unclear', reviewedAt: at, nextReviewDate: '2026-09-28' }], bank.attempts);
  assert.deepEqual(studyMetrics(evidence, 'subject'), [{ key: 'math', label: 'Math', stable: 1, partial: 1, unclear: 0, attempts: 2, objective: 0, correct: 0 }]);
  assert.equal(studyMetrics(evidence, 'issue')[0].label, '忘记单位');
  assert.equal(studyMetrics(evidence, 'issue')[0].attempts, 1);
  assert.equal(studyMetrics(evidence, 'cueType')[0].attempts, 1);
  assert.equal(studyMetrics(evidence, 'questionType')[0].attempts, 1);
  assert.equal(studyMetrics(evidence, 'subject', 'another').length, 0);
  assert.equal(studyReportData(evidence).attempts, 2);
  assert.equal(studyMetrics([{ ...evidence[0], subjectId: 'physics', subject: 'Physics' }, evidence[1]], 'unit').length, 2);
});

test('separate Cue and question prompts retain their own rules and compatible data', () => {
  const prompt = cueImportPrompt('Math', ['Indices'], [cue]);
  assert.ok(prompt.includes(CUE_RULES)); assert.equal(prompt.includes(QUESTION_RULES), false); assert.ok(prompt.includes('"id":"c1"'));
  assert.ok(prompt.includes('最多 200 条')); assert.ok(prompt.includes('create 不输出 subsection'));
  const bank = applyQuestionOperations(emptyQuestionBank(), parseQuestionImport({ version: 1, operations: [{ action: 'create', question: { ...question, images: [{ id: 'i1', url: 'data:image/png;base64,AAAA', alt: 'diagram', placement: 'prompt' }] } }] }, emptyQuestionBank()), at, () => 'q1');
  const state = createEmptyScheduleState();
  const questionPrompt = questionImportPrompt(state.learningCatalog, [cue], bank.questions);
  assert.ok(questionPrompt.includes(QUESTION_RULES));
  assert.equal(questionPrompt.includes(CUE_RULES), false);
  assert.equal(questionPrompt.includes('CUE RULES'), false);
  assert.equal(questionPrompt.includes('替代上文'), false);
  assert.ok(questionPrompt.includes('相关的 (a)/(b)/(c) 小问'));
  assert.ok(questionPrompt.includes('AI 生成练习'));
  assert.ok(questionPrompt.includes('每题最多 6 个'));
  assert.ok(questionPrompt.includes('single、multiple、boolean、written'));
  assert.ok(questionPrompt.includes('imageRequests')); assert.ok(questionPrompt.includes('q1')); assert.ok(questionPrompt.includes('existingImageInfo'));
  assert.equal(questionPrompt.includes('data:image/png;base64'), false);
  const exported = { version: 1, operations: questionExportOperations(bank.questions) };
  const operations = parseQuestionImport(JSON.parse(JSON.stringify(exported)), bank);
  assert.equal(operations[0].action, 'update');
  if (operations[0].action === 'update') assert.equal(operations[0].changes.images?.[0].url, 'data:image/png;base64,AAAA');
});
