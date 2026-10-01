import type { StudyDraft } from './question-bank.ts';
import { cueMatchesStatusFilter, dateKey, type CueReview, type CueStatusFilter, type StudyCue, type CueStudyDraft } from './schedule-control.ts';

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

/** Preserve cue-only sessions saved by the former unified-study entry point. */
export function legacyCueStudyDraft(draft: StudyDraft, cues: StudyCue[]): CueStudyDraft | null {
  if (draft.mode !== 'cue' || !draft.items.length || draft.items.some((item) => item.kind !== 'cue')) return null;
  const byId = new Map(cues.map((cue) => [cue.id, cue]));
  const cueIds = draft.items.filter((item) => byId.has(item.id)).map((item) => item.id);
  if (!cueIds.length) return null;
  const currentId = draft.items[Math.min(draft.index, draft.items.length - 1)]?.id;
  const index = Math.max(0, cueIds.indexOf(currentId));
  return {
    id: draft.id, task: { ...draft.task, cueIds, questionIds: [], scope: { ...draft.task.scope, cueIds, questionIds: [] } }, cueIds, index,
    revealed: Boolean(draft.revealed[`cue:${cueIds[index]}`]),
    selectedChoice: draft.responses[`cue:${cueIds[index]}`]?.selectedChoices[0],
    assessments: Object.fromEntries(cueIds.flatMap((id) => draft.assessments[`cue:${id}`] ? [[id, draft.assessments[`cue:${id}`]]] : [])),
    priorStatuses: Object.fromEntries(cueIds.map((id) => [id, byId.get(id)?.status ?? null])),
    updatedAt: draft.updatedAt,
  };
}
