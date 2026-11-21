import { prioritizeCueReviews, dateKey, type CueReview, type ScheduleControlState, type StudyCue } from './schedule-control.ts';
import { todayCueQueue } from './cue-dashboard.ts';

export const CUE_MINUTES = 4;
export type CueBudget = 15 | 30 | 60;
export function recommendCueBudget(cues: StudyCue[], reviews: CueReview[], budget: CueBudget = 30) {
  const ranked = prioritizeCueReviews(cues, reviews);
  const ordered = ranked.map(({ cue }) => cue);
  const priorityById = new Map(ranked.map(({ cue, priority }) => [cue.id, priority]));
  const reasonsById = new Map(ranked.map(({ cue, reason }) => [cue.id, reason]));
  const count = Math.floor(budget / CUE_MINUTES);
  return { selected: ordered.slice(0, count), remaining: ordered.slice(count), ordered, priorityById, reasonsById };
}

/** Only called after an explicit user action; recommendation itself is read-only. */
export function addCueBudgetTask(state: ScheduleControlState, ids: string[], now = new Date(), id = crypto.randomUUID()) {
  const today = dateKey(now);
  const allowed = new Set(todayCueQueue(state, today).map(cue => cue.id));
  const cueIds = [...new Set(ids)].filter(id => allowed.has(id));
  if (!cueIds.length) return { state, created: false, count: 0 };
  const same = state.manualTasks.some(task => task.date === today && task.type === 'cue-review' && task.scope?.cueIds?.length === cueIds.length && task.scope.cueIds.every(id => cueIds.includes(id)));
  if (same) return { state, created: false, count: cueIds.length };
  const cues = state.cues.filter(cue => cueIds.includes(cue.id));
  const subjects = new Set(cues.map(cue => cue.subjectId));
  const task = { id, type: 'cue-review' as const, title: `CUE 预算学习 · ${cueIds.length} 条`, date: today,
    durationMinutes: cueIds.length * CUE_MINUTES, scope: { cueIds },
    ...(subjects.size === 1 ? { subjectId: cues[0].subjectId, subject: cues[0].subjectName } : {}),
    note: '用户确认加入；开始时按当前内容和冷却状态重新校验。',
  };
  return { state: { ...state, manualTasks: [...state.manualTasks, task] }, created: true, count: cueIds.length };
}
