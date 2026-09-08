export type DefinitionCard = {
  id: string;
  term: string;
  definition: string;
  note: string;
  createdAt: string;
  dueAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
};

export type DefinitionCardDraft = Pick<DefinitionCard, 'term' | 'definition' | 'note'>;
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

const TERM_KEYS = ['term', 'front', 'name', 'concept', 'object', '术语', '概念'];
const DEFINITION_KEYS = ['definition', 'back', 'meaning', 'description', 'contains', '定义', '释义'];
const NOTE_KEYS = ['note', 'notes', 'example', '备注', '例子'];
const LINE_CARD_PATTERN = /^(.+?)(?:\s+::\s+|\s+[—–-]\s+|\s*:\s+)(.+)$/u;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';
}

function field(record: Record<string, unknown>, keys: string[]): string {
  const actual = Object.keys(record).find((key) => keys.includes(key.toLowerCase()));
  return actual ? clean(record[actual]) : '';
}

function fromRecords(value: unknown): DefinitionCardDraft[] {
  const records = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as { cards?: unknown }).cards) ? (value as { cards: unknown[] }).cards : [];
  return records.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const term = field(record, TERM_KEYS);
    const definition = field(record, DEFINITION_KEYS);
    return term && definition ? [{ term, definition, note: field(record, NOTE_KEYS) }] : [];
  });
}

function splitDelimitedRow(row: string, delimiter: ',' | '\t'): string[] {
  if (delimiter === '\t') return row.split('\t').map((cell) => cell.trim());
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"' && row[index + 1] === '"' && quoted) { current += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { cells.push(current.trim()); current = ''; }
    else current += character;
  }
  cells.push(current.trim());
  return cells;
}

function parseDelimited(lines: string[], delimiter: ',' | '\t'): DefinitionCardDraft[] {
  const rows = lines.map((line) => splitDelimitedRow(line, delimiter));
  if (!rows.length) return [];
  const normalizedHeader = rows[0].map((cell) => cell.toLowerCase());
  const termIndex = normalizedHeader.findIndex((cell) => TERM_KEYS.includes(cell));
  const definitionIndex = normalizedHeader.findIndex((cell) => DEFINITION_KEYS.includes(cell));
  const noteIndex = normalizedHeader.findIndex((cell) => NOTE_KEYS.includes(cell));
  const hasHeader = termIndex >= 0 && definitionIndex >= 0;
  return rows.slice(hasHeader ? 1 : 0).flatMap((row) => {
    const term = clean(row[hasHeader ? termIndex : 0]);
    const definition = clean(row[hasHeader ? definitionIndex : 1]);
    const note = clean(row[hasHeader && noteIndex >= 0 ? noteIndex : 2]);
    return term && definition ? [{ term, definition, note }] : [];
  });
}

function deduplicate(cards: DefinitionCardDraft[]): DefinitionCardDraft[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = `${card.term.toLocaleLowerCase()}\u0000${card.definition.toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Parse JSON, CSV/TSV, or one-card-per-line text without guessing incomplete rows. */
export function parseDefinitionCards(input: string): DefinitionCardDraft[] {
  const text = input.replace(/^\uFEFF/u, '').trim();
  if (!text) return [];

  if (/^[\[{]/u.test(text)) {
    try {
      const parsed = fromRecords(JSON.parse(text) as unknown);
      if (parsed.length) return deduplicate(parsed);
    } catch { /* Continue with deterministic text parsing. */ }
  }

  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines.some((line) => line.includes('\t'))) return deduplicate(parseDelimited(lines, '\t'));
  const csvHeader = splitDelimitedRow(lines[0], ',').map((cell) => cell.toLowerCase());
  const hasCsvHeader = csvHeader.some((cell) => TERM_KEYS.includes(cell)) && csvHeader.some((cell) => DEFINITION_KEYS.includes(cell));
  if (hasCsvHeader || (lines.every((line) => line.includes(',')) && !lines.some((line) => LINE_CARD_PATTERN.test(line)))) {
    const parsed = parseDelimited(lines, ',');
    if (parsed.length) return deduplicate(parsed);
  }

  const cards = lines.flatMap((line) => {
    const match = line.match(LINE_CARD_PATTERN);
    if (!match) return [];
    const term = clean(match[1].replace(/^[-*]\s*/u, ''));
    const definition = clean(match[2]);
    return term && definition ? [{ term, definition, note: '' }] : [];
  });
  return deduplicate(cards);
}

export function createDefinitionCard(draft: DefinitionCardDraft, now = new Date()): DefinitionCard {
  const timestamp = now.toISOString();
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `card-${now.getTime()}-${Math.random().toString(36).slice(2)}`,
    ...draft,
    createdAt: timestamp,
    dueAt: timestamp,
    intervalDays: 0,
    easeFactor: 2.5,
    repetitions: 0,
    lapses: 0,
  };
}

export function isDefinitionCard(value: unknown): value is DefinitionCard {
  if (!value || typeof value !== 'object') return false;
  const card = value as Partial<DefinitionCard>;
  return typeof card.id === 'string' && typeof card.term === 'string' && typeof card.definition === 'string' && typeof card.dueAt === 'string' && Number.isFinite(card.intervalDays);
}

export function scheduleDefinitionCard(card: DefinitionCard, rating: ReviewRating, now = new Date()): DefinitionCard {
  let intervalDays = card.intervalDays;
  let easeFactor = card.easeFactor;
  let repetitions = card.repetitions;
  let lapses = card.lapses;

  if (rating === 'again') {
    intervalDays = 0;
    repetitions = 0;
    lapses += 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else if (rating === 'hard') {
    intervalDays = Math.max(1, Math.round((intervalDays || 1) * 1.2));
    easeFactor = Math.max(1.3, easeFactor - 0.15);
    repetitions += 1;
  } else if (rating === 'good') {
    intervalDays = repetitions === 0 ? 1 : repetitions === 1 ? 3 : Math.max(4, Math.round(intervalDays * easeFactor));
    repetitions += 1;
  } else {
    intervalDays = repetitions === 0 ? 4 : Math.max(7, Math.round((intervalDays || 1) * easeFactor * 1.3));
    easeFactor = Math.min(3, easeFactor + 0.15);
    repetitions += 1;
  }

  const due = new Date(now);
  if (rating === 'again') due.setMinutes(due.getMinutes() + 10);
  else due.setDate(due.getDate() + intervalDays);
  return { ...card, intervalDays, easeFactor, repetitions, lapses, dueAt: due.toISOString() };
}

export function dueDefinitionCards(cards: DefinitionCard[], now = new Date()): DefinitionCard[] {
  const timestamp = now.getTime();
  return cards.filter((card) => new Date(card.dueAt).getTime() <= timestamp).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}
