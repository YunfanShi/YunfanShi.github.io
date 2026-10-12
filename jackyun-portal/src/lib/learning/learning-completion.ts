import { dateKey, type LearningStatus, type ScheduleControlState } from './schedule-control.ts';
import { todayCueQueue } from './cue-dashboard.ts';
export function summarizeLearningCompletion(state: ScheduleControlState, cueIds: string[], questions: number, statuses: LearningStatus[], now = new Date()) {
  const ids = new Set(cueIds);
  const next = state.cues.filter(cue => ids.has(cue.id) && cue.nextReviewDate).map(cue => cue.nextReviewDate!).sort();
  return { cues: ids.size, questions, stable: statuses.filter(s => s === 'stable').length,
    partial: statuses.filter(s => s === 'partial').length, unclear: statuses.filter(s => s === 'unclear').length,
    remaining: todayCueQueue(state, dateKey(now)).length, nextDate: next[0] || null };
}
