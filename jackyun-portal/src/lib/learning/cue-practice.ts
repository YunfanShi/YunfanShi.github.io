import type { LearningStatus } from './schedule-control.ts';

export type CuePracticeItem = { cueId: string; after: number; availableAt: number; policy?: 2 };
export type CuePracticeState = { completed: number; pending: CuePracticeItem[]; active?: string; rating?: LearningStatus; returnCueId?: string };
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
export function rateCuePractice(state: CuePracticeState, cueId: string, status: LearningStatus, fresh: boolean, now: number, random = Math.random): CuePracticeState {
  const completed = state.completed + Number(fresh);
  const previous = state.pending.find(item => item.cueId === cueId);
  const pending = state.pending.filter(item => item.cueId !== cueId);
  if (status !== 'stable') pending.push(!fresh && previous ? previous : schedule(cueId, status, completed, now, random));
  else if (previous && !(fresh && state.active === cueId)) pending.push(previous);
  return { ...state, completed, pending, ...(state.active === cueId ? { rating: status } : {}) };
}
/** Either enough other retrievals or enough time makes a practice due. */
export function dueCuePractice(state: CuePracticeState, now: number, exclude?: string) {
  return state.pending.find(item => item.cueId !== exclude && (state.completed >= item.after || now >= item.availableAt));
}
export function enterCuePractice(state: CuePracticeState, now: number, exclude?: string, returnCueId?: string): CuePracticeState {
  const item = dueCuePractice(state, now, exclude);
  return { ...state, active: item?.cueId, rating: undefined, returnCueId: item ? state.returnCueId ?? returnCueId : undefined };
}
/** Resolve by identity after shuffling/filtering, including an exhausted main queue. */
export function cuePracticeReturnIndex(state: CuePracticeState, cueIds: string[], fallback = 0): number {
  const index = cueIds.indexOf(state.returnCueId ?? '');
  return index >= 0 ? index : Math.min(Math.max(0, fallback), Math.max(0, cueIds.length - 1));
}
