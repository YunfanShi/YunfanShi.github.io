import type { LearningStatus } from './schedule-control.ts';

export type CuePracticeItem = { cueId: string; after: number; availableAt: number };
export type CuePracticeState = { completed: number; pending: CuePracticeItem[]; active?: string; rating?: LearningStatus };
export const emptyCuePractice = (): CuePracticeState => ({ completed: 0, pending: [] });

/** Count a retrieval once. Editing its color cannot erase the delayed confirmation. */
export function rateCuePractice(state: CuePracticeState, cueId: string, status: LearningStatus, fresh: boolean, now: number): CuePracticeState {
  const completed = state.completed + Number(fresh);
  const previous = state.pending.find((item) => item.cueId === cueId);
  let pending = state.pending.filter((item) => item.cueId !== cueId);
  if (status !== 'stable') {
    const gap = status === 'unclear' ? 3 : 5;
    pending = [...pending, { cueId, after: completed + gap, availableAt: now + (status === 'unclear' ? 60_000 : 90_000) }];
  } else if (previous && !(fresh && state.active === cueId)) pending.push(previous);
  return { ...state, completed, pending, ...(state.active === cueId ? { rating: status } : {}) };
}

/** Other retrievals supply the gap; a small deck uses time instead of immediate repetition. */
export function dueCuePractice(state: CuePracticeState, now: number, exclude?: string) {
  return state.pending.find((item) => item.cueId !== exclude && (state.completed >= item.after || now >= item.availableAt));
}
export function enterCuePractice(state: CuePracticeState, now: number, exclude?: string): CuePracticeState {
  const item = dueCuePractice(state, now, exclude);
  return { ...state, active: item?.cueId, rating: undefined };
}
