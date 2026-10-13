import type { CueReview, LearningStatus } from './schedule-control.ts';

export type CuePracticePolicy = { trigger: 'questions' | 'time'; questions: number; minutes: number };
export const defaultCuePracticePolicy: CuePracticePolicy = { trigger: 'questions', questions: 5, minutes: 5 };
export function cuePracticeIsDue(state: CuePracticeState, item: CuePracticeItem, now: number, policy?: CuePracticePolicy) {
  return policy ? policy.trigger === 'questions' ? state.completed >= item.after : now >= item.availableAt : state.completed >= item.after || now >= item.availableAt;
}
export function rescheduleCuePractice(state: CuePracticeState, now: number, policy: CuePracticePolicy): CuePracticeState {
  return { ...state, pending: state.pending.map(item => ({ ...item, after: state.completed + policy.questions, availableAt: now + policy.minutes * 60_000 })) };
}
export type CuePracticeItem = { cueId: string; after: number; availableAt: number; policy?: 2 };
export type CuePracticeResult = { status: LearningStatus; attempts: number; reviewedAt: number };
export type CuePracticeState = { completed: number; pending: CuePracticeItem[]; active?: string; rating?: LearningStatus; returnCueId?: string; mode?: boolean; lastCueId?: string; results?: Record<string, CuePracticeResult> };
export const emptyCuePractice = (): CuePracticeState => ({ completed: 0, pending: [] });
const integer = (min: number, max: number, random: () => number) => min + Math.floor(Math.min(.999999999, Math.max(0, random())) * (max - min + 1));
const schedule = (cueId: string, status: LearningStatus, completed: number, now: number, random: () => number): CuePracticeItem => ({
  cueId, after: completed + (status === 'unclear' ? integer(4, 6, random) : integer(6, 10, random)),
  availableAt: now + integer(300_000, 600_000, random), policy: 2,
});

/** Upgrade old short waits once; saved random windows remain stable across reloads. */
export function normalizeCuePractice(state: CuePracticeState, assessments: Record<string, LearningStatus>, now: number, random = Math.random): CuePracticeState {
  return { ...state, pending: state.pending.map(item => item.policy === 2 ? item : schedule(item.cueId, assessments[item.cueId] ?? 'partial', state.completed, now, random)) };
}
/** Count a retrieval once. Editing its color cannot erase or reroll delayed confirmation. */
export function rateCuePractice(state: CuePracticeState, cueId: string, status: LearningStatus, fresh: boolean, now: number, random = Math.random, policy?: CuePracticePolicy): CuePracticeState {
  const completed = state.completed + Number(fresh);
  const previous = state.pending.find(item => item.cueId === cueId);
  const pending = state.pending.filter(item => item.cueId !== cueId);
  if (status !== 'stable') pending.push(!fresh && previous ? previous : policy ? { cueId, after: completed + policy.questions, availableAt: now + policy.minutes * 60_000, policy: 2 } : schedule(cueId, status, completed, now, random));
  else if (previous && state.active !== cueId) pending.push(previous);
  const result = state.results?.[cueId];
  return { ...state, completed, pending, ...(state.active === cueId ? { rating: status, results: { ...state.results, [cueId]: { status, attempts: (result?.attempts ?? 0) + Number(fresh), reviewedAt: now } } } : {}) };
}
/** Either enough other retrievals or enough time makes a practice due. */
export function dueCuePractice(state: CuePracticeState, now: number, exclude?: string, roundComplete = false, policy?: CuePracticePolicy) {
  // Once all primary Cues are rated, rotate the remaining weak items without a dead-end wait.
  if (roundComplete) return state.pending.find(item => item.cueId !== exclude) ?? state.pending[0];
  return state.pending.find(item => item.cueId !== exclude && (state.pending.length <= 1 || item.cueId !== state.lastCueId) && cuePracticeIsDue(state, item, now, policy));
}
export function enterCuePractice(state: CuePracticeState, now: number, exclude?: string, returnCueId?: string, mode = state.mode ?? false, roundComplete = false, policy?: CuePracticePolicy): CuePracticeState {
  const item = dueCuePractice(state, now, exclude, roundComplete, policy);
  return { ...state, pending: item ? [...state.pending.filter(candidate => candidate.cueId !== item.cueId), item] : state.pending, mode, active: item?.cueId, lastCueId: item?.cueId ?? state.lastCueId, rating: undefined, returnCueId: item || mode ? state.returnCueId ?? returnCueId : undefined };
}
/** Resolve by identity after shuffling/filtering, including an exhausted main queue. */
export function cuePracticeReturnIndex(state: CuePracticeState, cueIds: string[], fallback = 0): number {
  const index = cueIds.indexOf(state.returnCueId ?? '');
  return index >= 0 ? index : Math.min(Math.max(0, fallback), Math.max(0, cueIds.length - 1));
}

/** Complete directory: passed attempts remain visible after leaving the pending queue. */
export function cuePracticeDirectory(state: CuePracticeState) {
  return [...new Set([...state.pending.map(item => item.cueId), ...Object.keys(state.results ?? {})])];
}
export function cuePracticeLabel(state: CuePracticeState, cueId: string, now: number, roundComplete = false, policy?: CuePracticePolicy): string {
  if (state.active === cueId && state.rating === undefined) return '正在重练';
  if (state.results?.[cueId]?.status === 'stable') return '重练已通过';
  const item = state.pending.find(item => item.cueId === cueId);
  if (!item) return '仍需重练';
  const due = roundComplete || cuePracticeIsDue(state, item, now, policy);
  return due ? '待重练' : state.results?.[cueId] ? '仍需重练 · 等待间隔' : '等待间隔';
}

/** A newer primary review supersedes an older retry badge. */
export function latestCuePracticeAttempt(reviews: CueReview[], cueId: string) {
  return reviews.filter(review => review.cueId === cueId).toSorted((left, right) => right.reviewedAt.localeCompare(left.reviewedAt))[0]?.practiceAttempts?.at(-1);
}

/** An inserted retry returns to its saved normal Cue immediately on success. */
export function finishAutomaticCuePractice(state: CuePracticeState, status: LearningStatus): CuePracticeState {
  return state.active && !state.mode && status === 'stable' ? { ...state, active: undefined, rating: undefined, returnCueId: undefined } : state;
}
