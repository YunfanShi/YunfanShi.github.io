export type WritingTask = 'task1-academic' | 'task1-general' | 'task2';
export type ReviewMode = 'diagnose' | 'recheck' | 'upgrade';
export type ExternalResponseFormat = 'json' | 'markdown';

export interface DiffChunk {
  type: 'same' | 'added' | 'removed';
  text: string;
}

export interface WritingIssue {
  id: string;
  category: 'Grammar' | 'Vocabulary / Collocation' | 'Sentence Structure' | 'Cohesion' | 'Logic / Development' | 'Task Response / Achievement';
  severity: 'high' | 'medium' | 'low';
  quote: string;
  explanation: string;
  selfRevisionPrompt: string;
  ruleKey: string;
}

export interface LanguageUpgrade {
  original: string;
  suggestion: string;
  why: string;
  type: 'necessary' | 'natural' | 'optional';
}

export interface WritingFeedback {
  bandEstimate: string;
  summary: string;
  priorities: string[];
  issues: WritingIssue[];
  upgrades: LanguageUpgrade[];
  readyForUpgrade: boolean;
}

export interface ErrorHistoryEntry {
  essayId: string;
  ruleKeys: string[];
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function writeRedundantJson(storage: KeyValueStorage, primaryKey: string, mirrorKey: string, value: unknown): void {
  const payload = JSON.stringify(value);
  storage.setItem(primaryKey, payload);
  storage.setItem(mirrorKey, payload);
}

export function readFirstValidJson<T>(storage: KeyValueStorage, keys: string[], validate: (value: unknown) => value is T): T | null {
  for (const key of keys) {
    try {
      const value = JSON.parse(storage.getItem(key) || 'null') as unknown;
      if (validate(value)) return value;
    } catch { /* Try the next redundant copy. */ }
  }
  return null;
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function diffTokens(text: string): string[] {
  return text.match(/\s+|[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*|[^\s]/gu) ?? [];
}

export function diffWriting(original: string, current: string): DiffChunk[] {
  const before = diffTokens(original);
  const after = diffTokens(current);
  if (before.length * after.length > 1_500_000) {
    return [{ type: 'removed', text: original }, { type: 'added', text: current }];
  }
  const table = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1));
  for (let i = 1; i <= before.length; i += 1) {
    for (let j = 1; j <= after.length; j += 1) {
      table[i][j] = before[i - 1] === after[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  const reversed: DiffChunk[] = [];
  let i = before.length; let j = after.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && before[i - 1] === after[j - 1]) { reversed.push({ type: 'same', text: before[i - 1] }); i -= 1; j -= 1; }
    else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) { reversed.push({ type: 'added', text: after[j - 1] }); j -= 1; }
    else { reversed.push({ type: 'removed', text: before[i - 1] }); i -= 1; }
  }
  const chunks: DiffChunk[] = [];
  for (const part of reversed.reverse()) {
    const last = chunks.at(-1);
    if (last?.type === part.type) last.text += part.text;
    else chunks.push({ ...part });
  }
  return chunks;
}

export function targetWords(task: WritingTask): number {
  return task === 'task2' ? 250 : 150;
}

export function taskLabel(task: WritingTask): string {
  if (task === 'task1-academic') return 'Academic Task 1';
  if (task === 'task1-general') return 'General Training Task 1';
  return 'Task 2';
}

export function buildWritingReviewPrompt(input: {
  task: WritingTask;
  question: string;
  essay: string;
  originalEssay: string;
  mode: ReviewMode;
  previousRuleKeys?: string[];
  outputLanguage?: 'en' | 'zh';
  responseFormat?: ExternalResponseFormat;
}): string {
  const modeInstruction = input.mode === 'upgrade'
    ? '主要错误应已收敛。区分 necessary correction、natural upgrade、optional sophistication；保持原观点，只做 same idea, better English。'
    : input.mode === 'recheck'
      ? '这是学生自己修改后的版本。重点检查上一轮主要问题是否解决，并只报告仍然重要或新引入的问题。'
      : '这是原始独立写作。先诊断问题，让学生自己修改；不要代写整句或整篇。';

  const responseLanguage = input.outputLanguage === 'zh'
    ? 'All summaries, explanations, priorities, prompts, and upgrade reasons must be in Simplified Chinese.'
    : 'All summaries, explanations, priorities, prompts, and upgrade reasons must be in clear English.';

  const formatInstruction = input.responseFormat === 'markdown'
    ? `Return Markdown only, using exactly these headings:\n# Band estimate\n# Summary\n# Fix first\n# Issues\nFor every issue use: ## [Severity] Category — rule_key, then Quote, Explanation, and Self-revision prompt.\n# Language upgrades\n# Ready for upgrade\nDo not wrap the report in a code fence.`
    : `Return valid JSON only, with no Markdown.\n\nJSON shape:\n{\n  "bandEstimate": "5.5–6.0",\n  "summary": "short summary",\n  "priorities": ["what to fix first"],\n  "issues": [{\n    "id": "issue-1",\n    "category": "Grammar|Vocabulary / Collocation|Sentence Structure|Cohesion|Logic / Development|Task Response / Achievement",\n    "severity": "high|medium|low",\n    "quote": "short exact fragment",\n    "explanation": "why this is a problem",\n    "selfRevisionPrompt": "the smallest prompt that helps the student revise",\n    "ruleKey": "stable_error_key"\n  }],\n  "upgrades": [{\n    "original": "short fragment",\n    "suggestion": "a better local expression, not a full rewrite",\n    "why": "why it is better",\n    "type": "necessary|natural|optional"\n  }],\n  "readyForUpgrade": false\n}`;

  return `You are a rigorous but restrained IELTS Writing coach. Follow the Correction → Transfer method.\n\n${modeInstruction}\n\n${responseLanguage}\n\nRules:\n- Never generate a complete model answer or rewrite the whole essay.\n- Every issue must quote a short fragment and use selfRevisionPrompt to ask a question or give the smallest useful hint.\n- Return only the 3–8 issues with the greatest score impact. Do not invent minor problems to fill a quota.\n- Use stable, short English ruleKey values such as article_usage, subject_verb_agreement, or unclear_causal_chain.\n- bandEstimate must be a range such as 5.5–6.0, never a promised exam score.\n- readyForUpgrade is true only after the main grammar, logic, and task-response problems have clearly converged.\n- Return upgrades only in upgrade mode. Label each necessary, natural, or optional. Otherwise return an empty array.\n- For Task 1, also check overview, comparison objects, tense, and data language. For Task 2, also check position, topic sentences, explanation, examples, causal chains, relevance, and conclusion.\n\n${formatInstruction}\n\nTask: ${taskLabel(input.task)}\nQuestion: ${input.question || 'No question supplied. Do not judge Task Response; analyse only the visible language and structure.'}\nPrevious issue keys: ${input.previousRuleKeys?.join(', ') || 'none'}\nOriginal attempt:\n${input.originalEssay || input.essay}\n\nCurrent draft:\n${input.essay}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function parseWritingFeedback(raw: string): WritingFeedback {
  const unfenced = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 没有返回可读取的反馈，请重试。');
  const value = JSON.parse(unfenced.slice(start, end + 1)) as Partial<WritingFeedback>;
  if (typeof value.summary !== 'string' || !Array.isArray(value.issues)) throw new Error('AI 反馈格式不完整，请重试。');

  const allowedCategories = new Set<WritingIssue['category']>([
    'Grammar', 'Vocabulary / Collocation', 'Sentence Structure', 'Cohesion', 'Logic / Development', 'Task Response / Achievement',
  ]);
  const allowedSeverities = new Set<WritingIssue['severity']>(['high', 'medium', 'low']);
  const issues = value.issues.filter((issue): issue is WritingIssue => Boolean(
    issue && typeof issue.id === 'string' && allowedCategories.has(issue.category) &&
    allowedSeverities.has(issue.severity) && typeof issue.quote === 'string' &&
    typeof issue.explanation === 'string' && typeof issue.selfRevisionPrompt === 'string' && typeof issue.ruleKey === 'string',
  ));
  const upgrades = Array.isArray(value.upgrades) ? value.upgrades.filter((upgrade): upgrade is LanguageUpgrade => Boolean(
    upgrade && typeof upgrade.original === 'string' && typeof upgrade.suggestion === 'string' &&
    typeof upgrade.why === 'string' && ['necessary', 'natural', 'optional'].includes(upgrade.type),
  )) : [];

  return {
    bandEstimate: typeof value.bandEstimate === 'string' ? value.bandEstimate : '未估分',
    summary: value.summary,
    priorities: isStringArray(value.priorities) ? value.priorities.slice(0, 4) : [],
    issues: issues.slice(0, 8),
    upgrades: upgrades.slice(0, 8),
    readyForUpgrade: value.readyForUpgrade === true,
  };
}

export function recurringRuleKeys(history: ErrorHistoryEntry[]): string[] {
  const essaysByRule = new Map<string, Set<string>>();
  for (const entry of history) {
    for (const key of new Set(entry.ruleKeys.filter(Boolean))) {
      const essays = essaysByRule.get(key) ?? new Set<string>();
      essays.add(entry.essayId);
      essaysByRule.set(key, essays);
    }
  }
  return [...essaysByRule.entries()].filter(([, essays]) => essays.size >= 2).map(([key]) => key).sort();
}

export function updateErrorHistory(history: ErrorHistoryEntry[], essayId: string, ruleKeys: string[]): ErrorHistoryEntry[] {
  const previousKeys = history.find((entry) => entry.essayId === essayId)?.ruleKeys ?? [];
  return [
    ...history.filter((entry) => entry.essayId !== essayId),
    { essayId, ruleKeys: [...new Set([...previousKeys, ...ruleKeys].filter(Boolean))] },
  ];
}
