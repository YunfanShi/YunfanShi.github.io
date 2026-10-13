import type { StudyCue } from './schedule-control.ts';

export type CueSearchField = 'prompt' | 'subtitle' | 'answer' | 'ms' | 'location';
export interface CueSearchHit { cue: StudyCue; field: CueSearchField; text: string; terms: string[] }
const clean = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = (text: string) => clean(text).split(/\s+/u).filter(Boolean);
const fields = (cue: StudyCue): [CueSearchField, string][] => [
  ['prompt', cue.prompt], ['subtitle', cue.subtitle ?? ''], ['answer', cue.answer ?? ''],
  ['ms', cue.markingPoints.join('\n')], ['location', `${cue.unit} ${cue.subsection} ${cue.subjectName}`],
];
function contains(text: string, term: string) {
  // Latin searches match complete words; "mass" must not match "biomass".
  return /[\u3400-\u9fff]/u.test(term) ? clean(text).includes(term) : words(text).includes(term);
}
function near(left: string, right: string) {
  if (left === right) return true;
  if (left.length < 4 || right.length < 4 || /[\u3400-\u9fff]/u.test(left + right) || Math.abs(left.length - right.length) > 1) return false;
  // One insertion, deletion or substitution only, and only in the final fallback.
  let i = 0, j = 0, edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (left.length === right.length && left[i] === right[j + 1] && left[i + 1] === right[j]) { i += 2; j += 2; continue; }
    if (left.length >= right.length) i++;
    if (right.length >= left.length) j++;
  }
  return edits + Number(i < left.length || j < right.length) <= 1;
}
export function searchCues(cues: StudyCue[], query: string): { hits: CueSearchHit[]; expanded: boolean } {
  const terms = [...new Set(words(query))];
  if (!terms.length) return { hits: cues.map(cue => ({ cue, field: 'prompt', text: cue.prompt, terms: [] })), expanded: false };
  const primary = cues.flatMap((cue, order) => {
    const match = fields(cue).slice(0, 4).find(([, text]) => terms.every(term => contains(text, term)));
    if (!match) return [];
    const [field, text] = match;
    const exact = clean(text) === clean(query) ? 0 : clean(text).includes(clean(query)) ? 1 : 2;
    return [{ cue, field, text, terms, rank: ['prompt', 'subtitle', 'answer', 'ms'].indexOf(field) * 10 + exact, order }];
  });
  if (primary.length) return { hits: primary.sort((a, b) => a.rank - b.rank || a.order - b.order), expanded: false };
  // Expand only if there is no direct hit. Every query token must still match.
  const fallback = cues.flatMap((cue, order) => {
    const all = fields(cue), text = all.map(([, value]) => value).join(' ');
    const exact = terms.every(term => contains(text, term));
    if (!exact && !terms.every(term => words(text).some(word => near(word, term)))) return [];
    const field = all.find(([, value]) => terms.some(term => words(value).some(word => exact ? contains(word, term) : near(word, term))));
    return [{ cue, field: field?.[0] ?? 'location', text: field?.[1] ?? text, terms: exact ? terms : words(text).filter(word => terms.some(term => near(word, term))), rank: (exact ? 0 : 100) + all.findIndex(([key]) => key === field?.[0]), order }];
  });
  return { hits: fallback.sort((a, b) => a.rank - b.rank || a.order - b.order), expanded: fallback.length > 0 };
}
export function cueHighlightParts(text: string, terms: string[]): { text: string; hit: boolean }[] {
  if (!terms.length) return [{ text, hit: false }];
  const escaped = terms.toSorted((a, b) => b.length - a.length).map(term => {
    const literal = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return /[\u3400-\u9fff]/u.test(term) ? literal : `(?<![\\p{L}\\p{N}])${literal}(?![\\p{L}\\p{N}])`;
  });
  const pattern = new RegExp(escaped.join('|'), 'giu');
  const parts: { text: string; hit: boolean }[] = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index > start) parts.push({ text: text.slice(start, index), hit: false });
    parts.push({ text: match[0], hit: true }); start = index + match[0].length;
  }
  if (start < text.length) parts.push({ text: text.slice(start), hit: false });
  return parts;
}
