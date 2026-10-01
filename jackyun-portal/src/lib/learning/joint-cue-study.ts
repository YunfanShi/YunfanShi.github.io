import { cueMatchesStatusFilter, dateKey, type CueReview, type CueStatusFilter, type StudyCue } from './schedule-control.ts';

export const DEFAULT_STUDY_FILTER = 'due';
// An absent subject is unselected; an empty unit list means all its units.
export type JointCueSelection = Record<string, string[]>;

export function selectJointCues(cues: StudyCue[], selection: JointCueSelection, filter: CueStatusFilter, today: string, reviews: CueReview[]): StudyCue[] {
  const history = new Map<string, CueReview[]>();
  for (const review of reviews) history.set(review.cueId, [...(history.get(review.cueId) ?? []), review]);
  return cues.filter((cue) => {
    const units = selection[cue.subjectId];
    return units !== undefined && (!units.length || units.includes(cue.unit))
      && (!cue.lastReviewedAt || dateKey(new Date(cue.lastReviewedAt)) < today)
      && cueMatchesStatusFilter(cue, filter, today, history.get(cue.id));
  });
}

export function jointCueSubjectName(cues: StudyCue[]): string {
  return `联合 CUE · ${[...new Set(cues.map((cue) => cue.subjectName))].join('、')}`;
}
