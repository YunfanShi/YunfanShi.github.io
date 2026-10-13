export const SCHEDULE_STORAGE_KEY = 'jackyun_schedule_control_v1';

/** A missing or reset browser state must never replace a populated Schedule. */
export function scheduleHasContent(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (state.timetable != null) return true;
  if (typeof state.importedAt === 'string' && state.importedAt.length > 0) return true;
  return ['manualTasks', 'completions', 'cancellations', 'reviewProgress', 'cues',
    'timedPracticeRecords', 'cueReviews', 'learningRecords', 'learningCatalog', 'learningReminders',
    'cueCollectionUpdates', 'cueChangeHistory', 'cueMemos', 'cueAnswerCards', 'cueSimilarityDecisions'].some((key) => {
      const item = state[key];
      return Array.isArray(item) ? item.length > 0 : Boolean(item && typeof item === 'object' && Object.keys(item).length > 0);
    });
}

export function unsafeScheduleReplacement(previous: unknown, next: unknown): boolean {
  return scheduleHasContent(previous) && !scheduleHasContent(next);
}

export function shouldQueueLocalValue(key: string, current: string | undefined, previous: string | undefined): boolean {
  // An absent key at startup is not an intentional deletion.
  if (current === undefined && previous === undefined) return false;
  if (key !== SCHEDULE_STORAGE_KEY) return true;
  if (current === undefined) return false;
  try { return scheduleHasContent(JSON.parse(current)); }
  catch { return false; }
}
