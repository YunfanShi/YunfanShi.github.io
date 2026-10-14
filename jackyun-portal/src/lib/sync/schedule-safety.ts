import { canonicalJson } from './hash.ts';
export const SCHEDULE_STORAGE_KEY = 'jackyun_schedule_control_v1';

/** A missing or reset browser state must never replace a populated Schedule. */
export function scheduleHasContent(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (state.timetable != null) return true;
  if (typeof state.importedAt === 'string' && state.importedAt.length > 0) return true;
  return ['manualTasks', 'completions', 'cancellations', 'reviewProgress', 'cues',
    'timedPracticeRecords', 'practiceSessions', 'practiceTimerConfig', 'examDiagnoses', 'practiceFrequencies', 'cueReviews', 'learningRecords', 'learningCatalog', 'learningReminders',
    'cueCollectionUpdates', 'cueChangeHistory', 'cueMemos', 'cueAnswerCards', 'cueSimilarityDecisions'].some((key) => {
      const item = state[key];
      return Array.isArray(item) ? item.length > 0 : Boolean(item && typeof item === 'object' && Object.keys(item).length > 0);
    });
}

export function unsafeScheduleReplacement(previous: unknown, next: unknown): boolean {
  if (scheduleHasContent(previous) && !scheduleHasContent(next)) return true;
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object') return false;
  const before = previous as Record<string, unknown>, after = next as Record<string, unknown>;
  const records = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [];
  // Also checked by both existing server adapters. A stale client cannot erase
  // immutable evidence even when it has subsequently read the latest revision.
  for (const d of records(before.examDiagnoses)) {
    const replacement = records(after.examDiagnoses).find(x => x.id === d.id);
    if (!replacement || ['originalAnswer','sourceRecordId','sourceSessionId','sourceQuestionId'].some(k => (k!=='originalAnswer' || d.originalAnswer) && canonicalJson(d[k]) !== canonicalJson(replacement[k]))) return true;
    for (const field of ['reviews','events']) for (const entry of records(d[field])) if (canonicalJson(entry) !== canonicalJson(records(replacement[field]).find(x => x.id === entry.id))) return true;
  }
  for (const s of records(before.practiceSessions)) for (const q of records(s.questions)) {
    if (!q.firstAttempt) continue;
    const replacement = records(records(after.practiceSessions).find(x => x.id === s.id)?.questions).find(x => x.id === q.id);
    if (!replacement || canonicalJson(q.firstAttempt) !== canonicalJson(replacement.firstAttempt)) return true;
  }
  for(const r of records(before.timedPracticeRecords)) {
    if(!r.firstResults) continue;
    const replacement=records(after.timedPracticeRecords).find(x=>x.id===r.id);
    if(!replacement || canonicalJson(r.firstResults)!==canonicalJson(replacement.firstResults)) return true;
    for(const entry of records(r.corrections)) if(canonicalJson(entry)!==canonicalJson(records(replacement.corrections).find(x=>x.id===entry.id))) return true;
  }
  return false;
}

export function shouldQueueLocalValue(key: string, current: string | undefined, previous: string | undefined): boolean {
  // An absent key at startup is not an intentional deletion.
  if (current === undefined && previous === undefined) return false;
  if (key !== SCHEDULE_STORAGE_KEY) return true;
  if (current === undefined) return false;
  try { return scheduleHasContent(JSON.parse(current)); }
  catch { return false; }
}
