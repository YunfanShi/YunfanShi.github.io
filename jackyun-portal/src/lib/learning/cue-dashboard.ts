import { allCueStudyDrafts, cueActivityTag, cueMatchesStatusFilter, dateKey, isCueMasteryPaused, type ScheduleControlState, type StudyCue } from './schedule-control.ts';

export function uniqueCues(cues: StudyCue[]): StudyCue[] {
  return [...new Map(cues.map(cue => [cue.id, cue])).values()];
}

/** The dashboard and entry preview use exactly the same due eligibility. */
export function todayCueQueue(state: Pick<ScheduleControlState, 'cues' | 'cueReviews'>, today: string): StudyCue[] {
  return uniqueCues(state.cues).filter(cue => !isCueMasteryPaused(cue, today) && cueMatchesStatusFilter(cue, 'due', today, state.cueReviews));
}

export function cueDashboard(state: ScheduleControlState, today: string) {
  const cues = uniqueCues(state.cues);
  const due = todayCueQueue(state, today);
  const fresh = cues.filter(cue => ['new', 'updated'].includes(cueActivityTag(cue, today)));
  const weak = cues.filter(cue => cueMatchesStatusFilter(cue, 'weak', today));
  const learned = cues.filter(cue => cue.lastReviewedAt && dateKey(new Date(cue.lastReviewedAt)) === today && cueActivityTag(cue, today) !== 'updated');
  const cooling = cues.filter(cue => isCueMasteryPaused(cue, today));
  const subjects = [...new Map(cues.map(cue => [cue.subjectId, cue.subjectName])).entries()].map(([id, name]) => ({
    id, name, due: due.filter(cue => cue.subjectId === id).length,
    fresh: fresh.filter(cue => cue.subjectId === id).length, weak: weak.filter(cue => cue.subjectId === id).length,
  })).sort((a, b) => b.due - a.due || a.name.localeCompare(b.name));
  const drafts = Object.values(allCueStudyDrafts(state)).map(draft => {
    const ids = draft.cueIds.filter(id => cues.some(cue => cue.id === id));
    return { id: draft.id, name: draft.task.subjectName || draft.task.title, count: ids.length, done: ids.filter(id => draft.assessments[id]).length };
  }).filter(draft => draft.count > 0);
  return { total: cues.length, due: due.length, fresh: fresh.length, weak: weak.length, learned: learned.length, cooling: cooling.length, subjects, drafts };
}

export function cueEntryHref(subject = '', filter = 'due', draft = '') {
  const params = new URLSearchParams({ view: 'cue', mode: 'cue', filter });
  if (subject) params.set('subject', subject);
  if (draft) params.set('draft', draft);
  return `/schedule?${params}`;
}
