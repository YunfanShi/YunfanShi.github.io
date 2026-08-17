export const COMPANION_CATEGORIES = [
  'AI 助手',
  '考试资料',
  '编程学习',
  '课程平台',
  '语言学习',
  '数理工具',
  '研究阅读',
  'JackYun',
  '其他学习',
] as const;

export type CompanionCategory = (typeof COMPANION_CATEGORIES)[number];

export const COMPANION_HOST_RULES: ReadonlyArray<{
  category: CompanionCategory;
  hosts: readonly string[];
}> = [
  { category: 'AI 助手', hosts: ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'chat.deepseek.com', 'chat.qwen.ai', 'perplexity.ai', 'notebooklm.google.com'] },
  { category: '考试资料', hosts: ['bestexamhelp.com', 'znotes.org', 'pastpapers.papacambridge.com', 'revisiontown.com', 'savemyexams.com', 'physicsandmathstutor.com', 'cambridgeinternational.org', 'qualifications.pearson.com', 'ielts.org', 'chinaielts.org'] },
  { category: '编程学习', hosts: ['luogu.com.cn', 'w3schools.com', 'freecodecamp.org', 'ocw.mit.edu', 'github.com'] },
  { category: '课程平台', hosts: ['khanacademy.org', 'edx.org', 'coursera.org', 'youtube.com'] },
  { category: '语言学习', hosts: ['bbc.co.uk', 'dictionary.cambridge.org', 'youglish.com', 'ankiweb.net'] },
  { category: '数理工具', hosts: ['wolframalpha.com', 'geogebra.org', 'phet.colorado.edu'] },
  { category: '研究阅读', hosts: ['scholar.google.com', 'arxiv.org', 'wikipedia.org', 'archive.org'] },
  { category: 'JackYun', hosts: ['jackyun.top', 'yunfanshi.github.io'] },
];

export function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

export function getCompanionCategory(hostname: string): CompanionCategory | null {
  const normalized = normalizeHostname(hostname);
  for (const rule of COMPANION_HOST_RULES) {
    if (rule.hosts.some((allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`))) return rule.category;
  }
  return null;
}

export function isAllowedCompanionHost(hostname: string): boolean {
  return getCompanionCategory(hostname) !== null;
}

export function isCompanionEnabled(): boolean {
  return process.env.COMPANION_V1_ENABLED === 'true';
}

export interface CompanionActivityInput {
  activityDate: string;
  resourceKey: string;
  hostname: string;
  category: CompanionCategory;
  activeSeconds: number;
  visits: number;
}

export interface NavigationPreferencesV2 {
  version: 2;
  musicMode: 'player' | 'sync';
  answerSheetMode: 'standard' | 'sync';
  layoutMode: 'grouped' | 'flat';
  groupOrder: string[];
  itemOrder: Record<string, string[]>;
  hiddenItems: string[];
  pinnedItems: string[];
  collapsedGroups: string[];
  adaptiveEnabled: boolean;
}

export const DEFAULT_NAVIGATION_PREFERENCES: NavigationPreferencesV2 = {
  version: 2,
  musicMode: 'player',
  answerSheetMode: 'standard',
  layoutMode: 'grouped',
  groupOrder: ['home', 'learning', 'practice', 'time', 'tools', 'relax', 'system'],
  itemOrder: {
    home: ['dashboard'],
    learning: ['study-plan', 'goal', 'study-guide', 'learning-resources', 'vocab'],
    practice: ['answer-sheet', 'answer-sheet-sync', 'mock', 'quizwise'],
    time: ['time-management', 'activity', 'schedule'],
    tools: ['tools', 'userscripts'],
    relax: ['music-player', 'music-sync', 'bilibili-sync', 'poem', 'relax'],
    system: ['settings', 'update', 'help-center', 'admin'],
  },
  hiddenItems: [],
  pinnedItems: [],
  collapsedGroups: [],
  adaptiveEnabled: false,
};

export function coerceNavigationPreferences(value: unknown): NavigationPreferencesV2 {
  const input = value && typeof value === 'object' ? value as Partial<NavigationPreferencesV2> : {};
  const legacy = input as Partial<NavigationPreferencesV2> & { musicMode?: string; answerSheetMode?: string };
  return {
    ...DEFAULT_NAVIGATION_PREFERENCES,
    musicMode: legacy.musicMode === 'sync' ? 'sync' : 'player',
    answerSheetMode: legacy.answerSheetMode === 'sync' ? 'sync' : 'standard',
    layoutMode: input.layoutMode === 'flat' ? 'flat' : 'grouped',
    groupOrder: Array.isArray(input.groupOrder) ? input.groupOrder.filter((item): item is string => typeof item === 'string') : [...DEFAULT_NAVIGATION_PREFERENCES.groupOrder],
    itemOrder: input.itemOrder && typeof input.itemOrder === 'object' ? input.itemOrder : { ...DEFAULT_NAVIGATION_PREFERENCES.itemOrder },
    hiddenItems: Array.isArray(input.hiddenItems) ? input.hiddenItems.filter((item): item is string => typeof item === 'string') : [],
    pinnedItems: Array.isArray(input.pinnedItems) ? input.pinnedItems.filter((item): item is string => typeof item === 'string') : [],
    collapsedGroups: Array.isArray(input.collapsedGroups) ? input.collapsedGroups.filter((item): item is string => typeof item === 'string') : [],
    adaptiveEnabled: input.adaptiveEnabled === true,
  };
}
