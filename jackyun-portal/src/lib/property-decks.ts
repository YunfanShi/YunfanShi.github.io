export interface PropertyRow {
  id: string;
  label: string;
  values: string[];
}

export interface PropertyDeck {
  id: string;
  title: string;
  items: string[];
  properties: PropertyRow[];
  createdAt: string;
}

export interface PropertyPrompt {
  rowIndex: number;
  itemIndex: number;
  property: string;
  item: string;
  answer: string;
}

export const EXAMPLE_PROPERTY_DECK: PropertyDeck = {
  id: 'example-electromagnetic-waves',
  title: 'Electromagnetic communication',
  items: ['Radio', 'Microwave', 'Infrared'],
  properties: [
    { id: 'frequency', label: 'Frequency', values: ['Low', 'Medium', 'High'] },
    { id: 'range', label: 'Range', values: ['Long', 'Long / line of sight', 'Short'] },
    { id: 'bandwidth', label: 'Bandwidth', values: ['Low', 'High', 'High'] },
    { id: 'repeaters', label: 'Need for repeaters', values: ['Low', 'Yes, over long distance', 'No'] },
  ],
  createdAt: '2026-09-15T00:00:00.000Z',
};

function nonEmptyStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : [];
}

export function normalizePropertyDeck(value: unknown): PropertyDeck | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PropertyDeck>;
  const items = nonEmptyStrings(candidate.items);
  const title = String(candidate.title ?? '').trim();
  if (!title || !items.length || !Array.isArray(candidate.properties)) return null;
  const properties = candidate.properties.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Partial<PropertyRow>;
    const label = String(row.label ?? '').trim();
    if (!label) return [];
    const values = Array.from({ length: items.length }, (_, itemIndex) => String(row.values?.[itemIndex] ?? '').trim());
    return [{ id: String(row.id ?? `row-${index}`), label, values }];
  });
  if (!properties.length) return null;
  return {
    id: String(candidate.id ?? `deck-${Date.now()}`),
    title,
    items,
    properties,
    createdAt: String(candidate.createdAt ?? new Date().toISOString()),
  };
}

export function propertyPrompts(deck: PropertyDeck): PropertyPrompt[] {
  return deck.properties.flatMap((row, rowIndex) => deck.items.map((item, itemIndex) => ({
    rowIndex,
    itemIndex,
    property: row.label,
    item,
    answer: row.values[itemIndex] ?? '',
  })));
}
