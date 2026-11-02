import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectScheduleVersion } from '../src/lib/backup/inspection.ts';

test('Schedule comparison includes CUE mastery, reviews, unfinished study, and question progress', () => {
  const saved = {
    cues: [{ id: 'cue-1', prompt: '打印机设置', status: 'partial', nextReviewDate: '2026-11-01' }],
    cueReviews: [{ id: 'review-1', cueId: 'cue-1', reviewedAt: '2026-10-31T10:00:00.000Z' }],
    cueStudyDrafts: { active: { cueIds: ['cue-1', 'cue-2'], index: 0, updatedAt: '2026-11-01T09:00:00.000Z' } },
  };
  const current = {
    cues: [{ id: 'cue-1', prompt: '打印机设置', status: 'stable', nextReviewDate: '2026-11-05' }],
    cueReviews: [{ id: 'review-1', cueId: 'cue-1', reviewedAt: '2026-10-31T10:00:00.000Z' }, { id: 'review-2', cueId: 'cue-1', reviewedAt: '2026-11-01T10:00:00.000Z' }],
    cueStudyDrafts: { active: { cueIds: ['cue-1', 'cue-2'], index: 1, updatedAt: '2026-11-01T11:00:00.000Z' } },
  };
  const savedQuestions = { questions: [{ id: 'q-1' }], attempts: [{ id: 'a-1' }], drafts: { active: { index: 1 } } };
  const currentQuestions = { questions: [{ id: 'q-1' }, { id: 'q-2' }], attempts: [{ id: 'a-1' }, { id: 'a-2' }], drafts: { active: { index: 1 } } };

  const inspection = inspectScheduleVersion(saved, current, savedQuestions, currentQuestions);
  assert.ok(inspection.comparison.some((line) => line.includes('学习进度') && line.includes('△ 1')));
  assert.ok(inspection.comparison.some((line) => line.includes('未完成学习') && line.includes('第 1/2 张')));
  assert.ok(inspection.comparison.some((line) => line.includes('未完成学习') && line.includes('第 2/2 张')));
  assert.ok(inspection.comparison.some((line) => line.includes('题库：1 题 · 作答 1 次')));
  assert.ok(inspection.comparison.some((line) => line.includes('题库：2 题 · 作答 2 次')));
});
