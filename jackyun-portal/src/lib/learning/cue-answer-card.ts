import type { StudyCue } from './schedule-control.ts';

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
  return cards.map((item) => item.id === id ? { ...item, updatedAt: at, comparison: { at, version: cue.version ?? 1, prompt: cue.prompt, answer: cue.answer ?? '', markingPoints: [...cue.markingPoints], checkedPoints: [] } } : item);
}

export function checkCueAnswerPoint(cards: CueAnswerCard[], id: string, index: number, checked: boolean, at: string): CueAnswerCard[] {
  return cards.map((card) => {
    if (card.id !== id || !card.comparison || !Number.isInteger(index) || index < 0 || index >= card.comparison.markingPoints.length) return card;
    const checkedPoints = card.comparison.checkedPoints.filter((point) => point !== index);
    return { ...card, updatedAt: at, comparison: { ...card.comparison, checkedPoints: checked ? [...checkedPoints, index].sort((a, b) => a - b) : checkedPoints } };
  });
}
