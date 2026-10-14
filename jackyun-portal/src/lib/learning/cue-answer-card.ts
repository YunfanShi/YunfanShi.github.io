import type { StudyCue } from './schedule-control.ts';
import { localCueSelfCheck } from './cue-self-check.ts';

export interface CueAnswerCard {
  id: string;
  sessionId: string;
  cueId: string;
  text: string;
  updatedAt: string;
  comparison?: { at: string; version: number; prompt: string; answer: string; markingPoints: string[]; checkedPoints: number[] };
}
export const cueAnswerCardId = (sessionId: string, cueId: string) => JSON.stringify([sessionId, cueId]);

export function editCueAnswerCard(cards: CueAnswerCard[], sessionId: string, cueId: string, text: string, at: string): CueAnswerCard[] {
  const id = cueAnswerCardId(sessionId, cueId);
  const existing = cards.find((card) => card.id === id);
  if ((!existing && !text.trim()) || existing?.text === text) return cards;
  const next: CueAnswerCard = { id, sessionId, cueId, text: text.slice(0, 10_000), updatedAt: at };
  return [...cards.filter((card) => card.id !== id), next];
}

export function compareCueAnswerCard(cards: CueAnswerCard[], sessionId: string, cue: StudyCue, at: string): CueAnswerCard[] {
  const id = cueAnswerCardId(sessionId, cue.id);
  const card = cards.find((item) => item.id === id);
  if (!card?.text.trim()) return cards;
  const result = localCueSelfCheck(card.text, cue.answer ?? '', cue.markingPoints);
  const sameReference = card.comparison && card.comparison.version === (cue.version ?? 1) && card.comparison.answer === (cue.answer ?? '') && JSON.stringify(card.comparison.markingPoints) === JSON.stringify(cue.markingPoints);
  const checkedPoints = sameReference ? [...card.comparison!.checkedPoints] : result?.points.filter(point => point.covered).map(point => point.index) ?? [];
  return cards.map((item) => item.id === id ? { ...item, updatedAt: at, comparison: { at, version: cue.version ?? 1, prompt: cue.prompt, answer: cue.answer ?? '', markingPoints: [...cue.markingPoints], checkedPoints } } : item);
}

export function checkCueAnswerPoint(cards: CueAnswerCard[], id: string, index: number, checked: boolean, at: string): CueAnswerCard[] {
  return cards.map((card) => {
    if (card.id !== id || !card.comparison || !Number.isInteger(index) || index < 0 || index >= card.comparison.markingPoints.length) return card;
    const checkedPoints = card.comparison.checkedPoints.filter((point) => point !== index);
    return { ...card, updatedAt: at, comparison: { ...card.comparison, checkedPoints: checked ? [...checkedPoints, index].sort((a, b) => a - b) : checkedPoints } };
  });
}

/** Treat a single shortcut insertion as a command; keep ordinary text and pasted answers. */
export const isCueAnswerShortcut = (key: string) => ['`', '~', '～', '·'].includes(key);
export function cueAnswerInput(previous: string, next: string, inserted?: string | null) {
  if ((inserted && isCueAnswerShortcut(inserted)) || (next !== previous && isCueAnswerShortcut(next))) return { text: previous, close: true };
  if (next.length === previous.length + 1) {
    let index = 0;
    while (index < previous.length && previous[index] === next[index]) index++;
    if (isCueAnswerShortcut(next[index]) && previous.slice(index) === next.slice(index + 1)) return { text: previous, close: true };
  }
  return { text: next, close: false };
}

/** Batch parent persistence while keeping the textarea immediate. Flush at every exit boundary. */
export function bufferedCueAnswer(save: (text: string) => void, delay = 450, timers = { set: (callback: () => void, wait: number) => setTimeout(callback, wait), clear: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle) }) {
  let writer = save;
  let pending: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer !== undefined) timers.clear(timer);
    timer = undefined;
    if (pending !== undefined) { const text = pending; pending = undefined; writer(text); }
  };
  return {
    setSave(next: (text: string) => void) { writer = next; },
    write(text: string) { pending = text; if (timer !== undefined) timers.clear(timer); timer = timers.set(flush, delay); },
    flush,
    get pending() { return pending !== undefined; },
  };
}
