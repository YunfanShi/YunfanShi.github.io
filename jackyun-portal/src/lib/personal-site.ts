export type PersonalSiteBlock =
  | { id: string; type: 'heading'; text: string }
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'countdown'; title: string; date: string }
  | { id: string; type: 'tasks'; title: string; items: string[] }
  | { id: string; type: 'progress'; title: string; value: number }
  | { id: string; type: 'links'; title: string; items: Array<{ label: string; url: string }> };

export interface PersonalSiteDefinition {
  id: string;
  name: string;
  schemaVersion: 1;
  theme: 'light' | 'dark' | 'blue' | 'purple';
  blocks: PersonalSiteBlock[];
  updatedAt: string;
}

function text(value: unknown, max = 300): string { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }

export function validatePersonalSite(value: unknown, fallbackName = '我的网站'): PersonalSiteDefinition {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const allowedThemes = ['light', 'dark', 'blue', 'purple'] as const;
  const theme = allowedThemes.includes(raw.theme as typeof allowedThemes[number]) ? raw.theme as typeof allowedThemes[number] : 'light';
  const blocks: PersonalSiteBlock[] = [];
  for (const [index, item] of (Array.isArray(raw.blocks) ? raw.blocks : []).slice(0, 12).entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const block = item as Record<string, unknown>; const id = `block-${index + 1}`;
    if (block.type === 'heading') blocks.push({ id, type: 'heading', text: text(block.text, 100) || '欢迎' });
    else if (block.type === 'text') blocks.push({ id, type: 'text', text: text(block.text, 600) });
    else if (block.type === 'countdown') blocks.push({ id, type: 'countdown', title: text(block.title, 80) || '倒计时', date: /^\d{4}-\d{2}-\d{2}$/.test(text(block.date, 10)) ? text(block.date, 10) : new Date().toISOString().slice(0, 10) });
    else if (block.type === 'tasks') blocks.push({ id, type: 'tasks', title: text(block.title, 80) || '任务', items: (Array.isArray(block.items) ? block.items : []).slice(0, 10).map((entry) => text(entry, 100)).filter(Boolean) });
    else if (block.type === 'progress') blocks.push({ id, type: 'progress', title: text(block.title, 80) || '进度', value: Math.max(0, Math.min(100, Number(block.value) || 0)) });
    else if (block.type === 'links') blocks.push({ id, type: 'links', title: text(block.title, 80) || '链接', items: (Array.isArray(block.items) ? block.items : []).slice(0, 8).flatMap((entry) => { if (!entry || typeof entry !== 'object') return []; const link = entry as Record<string, unknown>; const url = text(link.url, 500); return /^https?:\/\//i.test(url) ? [{ label: text(link.label, 80) || url, url }] : []; }) });
  }
  return { id: text(raw.id, 80) || crypto.randomUUID(), name: text(raw.name, 80) || fallbackName, schemaVersion: 1, theme, blocks: blocks.length ? blocks : [{ id: 'block-1', type: 'heading', text: fallbackName }], updatedAt: new Date().toISOString() };
}

