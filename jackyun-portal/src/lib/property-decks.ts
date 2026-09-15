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

export interface PropertyDeckDraft {
  title: string;
  items: string[];
  properties: Array<{ label: string; values: string[] }>;
}

export interface PropertyDeckImportResult {
  draft: PropertyDeckDraft | null;
  errors: string[];
}

export const EMPTY_PROPERTY_VALUE = '（未填写）';

export const PROPERTY_IMPORT_REQUIREMENTS = `对比记忆自定义格式要求

1. 第一行填写 @title: 表格名称
2. 第二行填写 @items: 对象1 | 对象2 | 对象3
3. 后续每行填写 性质名称: 对象1的值 | 对象2的值 | 对象3的值
4. 每行的值数量必须与对象数量一致
5. 分隔符请使用英文竖线 |（也支持全角竖线 ｜ 或 Tab）

示例：
@title: Electromagnetic communication
@items: Radio | Microwave | Infrared
Frequency: Low | Medium | High
Range: Long | Long / line of sight | Short
Bandwidth: Low | High | High
Need for repeaters: Low | Yes, over long distance | No`;

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

function splitValues(value: string): string[] {
  return value.split(/\s*(?:\||｜|\t)\s*/u).map((entry) => entry.trim());
}

function draftFromObject(value: unknown): PropertyDeckDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const title = String(record.title ?? record['标题'] ?? '').trim();
  const items = nonEmptyStrings(record.items ?? record.objects ?? record['对象']);
  const rawProperties = record.properties ?? record.rows ?? record['性质'];
  if (!title || !items.length || !Array.isArray(rawProperties)) return null;
  const properties = rawProperties.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const label = String(row.label ?? row.property ?? row.name ?? row['名称'] ?? '').trim();
    if (!label || !Array.isArray(row.values)) return [];
    return [{ label, values: row.values.map((cell) => String(cell ?? '').trim()) }];
  });
  return properties.length ? { title, items, properties } : null;
}

export function parsePropertyDeckImport(input: string): PropertyDeckImportResult {
  const text = input.replace(/^\uFEFF/u, '').trim();
  if (!text) return { draft: null, errors: ['请先粘贴要导入的内容。'] };
  if (/^[{[]/u.test(text)) {
    try {
      const draft = draftFromObject(JSON.parse(text) as unknown);
      if (!draft) return { draft: null, errors: ['JSON 缺少 title、items 或 properties。'] };
      const errors = draft.properties.flatMap((row) => row.values.length === draft.items.length ? [] : [`「${row.label}」有 ${row.values.length} 个值，但需要 ${draft.items.length} 个。`]);
      return { draft: errors.length ? null : draft, errors };
    } catch {
      return { draft: null, errors: ['JSON 格式无效。'] };
    }
  }

  let title = '';
  let items: string[] = [];
  const rows: Array<{ label: string; values: string[]; line: number }> = [];
  const errors: string[] = [];
  text.split(/\r?\n/u).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const directive = line.match(/^[@＠]\s*(title|标题|items|objects|对象)\s*[:：=＝]\s*(.+)$/iu);
    if (directive) {
      const key = directive[1].toLowerCase();
      if (key === 'title' || key === '标题') title = directive[2].trim();
      else items = splitValues(directive[2]).filter(Boolean);
      return;
    }
    const row = line.match(/^(.+?)\s*[:：]\s*(.+)$/u);
    if (!row) { errors.push(`第 ${index + 1} 行无法识别，请使用“性质: 值1 | 值2”的格式。`); return; }
    rows.push({ label: row[1].trim(), values: splitValues(row[2]), line: index + 1 });
  });
  if (!title) errors.push('缺少 @title: 表格名称。');
  if (!items.length) errors.push('缺少 @items: 对象1 | 对象2。');
  if (!rows.length) errors.push('至少需要一行性质。');
  if (items.length) rows.forEach((row) => { if (row.values.length !== items.length) errors.push(`第 ${row.line} 行「${row.label}」有 ${row.values.length} 个值，但需要 ${items.length} 个。`); });
  return errors.length ? { draft: null, errors } : { draft: { title, items, properties: rows.map(({ label, values }) => ({ label, values })) }, errors: [] };
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

/** Return only the distinct answer choices from the prompt's table row. */
export function propertyRowOptions(deck: PropertyDeck, rowIndex: number): string[] {
  const values = deck.properties[rowIndex]?.values ?? [];
  return [...new Set(values.map((value) => value.trim() || EMPTY_PROPERTY_VALUE))];
}
