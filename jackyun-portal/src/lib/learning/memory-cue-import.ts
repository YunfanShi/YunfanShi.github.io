import { normalizeDefinitionCard } from '../definition-cards.ts';
import { normalizePropertyDeck } from '../property-decks.ts';
import type { CueCreateOperation, StudyCue } from './schedule-control.ts';

export interface MemoryCueCandidate { id: string; source: string; operation: CueCreateOperation; }
export function memoryCueCandidates(definitions: unknown, decks: unknown, subjectName: string, unit: string): MemoryCueCandidate[] {
  const candidates: MemoryCueCandidate[] = [];
  for (const value of Array.isArray(definitions) ? definitions : []) {
    const card = normalizeDefinitionCard(value);
    if (!card?.term.trim() || !card.definition.trim()) continue;
    candidates.push({ id: `definition:${card.id}`, source: `DEFINITIONS · ${card.deckTitle || '定义卡'}`, operation: {
      action: 'create', subjectName, unit, prompt: `Define ${card.term.trim()}.`, answer: card.definition.trim(),
      type: 'definition', display: 'definition-card', markingPoints: [card.definition.trim()],
      subtitle: `来源：DEFINITIONS · ${card.deckTitle || '定义卡'}`,
    } });
  }
  for (const value of Array.isArray(decks) ? decks : []) {
    const deck = normalizePropertyDeck(value);
    if (!deck || deck.items.length < 2 || deck.items.some((item) => !item.trim())) continue;
    for (const row of deck.properties) {
      if (!row.label.trim() || deck.items.some((_, index) => !row.values[index]?.trim() || row.values[index] === '（未填写）')) continue;
      const points = deck.items.map((item, index) => `${item}: ${row.values[index].trim()}`);
      candidates.push({ id: `comparison:${deck.id}:${row.id}`, source: `对比记忆 · ${deck.title}`, operation: {
        action: 'create', subjectName, unit, prompt: `比较 ${deck.items.join('、')} 在 ${row.label} 方面的差异。`,
        answer: points.join('\n'), type: 'compare', display: 'comparison', markingPoints: points,
        subtitle: `来源：对比记忆 · ${deck.title}`,
      } });
    }
  }
  return candidates;
}
export function newMemoryCueOperations(candidates: MemoryCueCandidate[], cues: StudyCue[]): CueCreateOperation[] {
  const key = (item: Pick<CueCreateOperation, 'subjectName' | 'unit' | 'prompt' | 'answer'>) => JSON.stringify([item.subjectName, item.unit, item.prompt.trim(), item.answer?.trim() ?? '']);
  const existing = new Set(cues.map(key));
  return candidates.flatMap(({ operation }) => { const id = key(operation); if (existing.has(id)) return []; existing.add(id); return [operation]; });
}
