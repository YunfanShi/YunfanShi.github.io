export type WritingTask = 'task1-academic' | 'task1-general' | 'task2';
import { parseAiJson } from './ai-json.ts';
export type ReviewMode = 'diagnose' | 'recheck' | 'upgrade';
export type ExternalResponseFormat = 'json' | 'markdown';
export type WritingStage = 0 | 1 | 2 | 3;
export type WritingGuidanceMode = 'hint' | 'correction';

export interface DiffChunk {
  type: 'same' | 'added' | 'removed';
  text: string;
}

export interface QuoteHighlightChunk {
  text: string;
  highlighted: boolean;
  issueIds: string[];
}

export interface QuoteRange {
  start: number;
  end: number;
}

export interface WritingIssue {
  id: string;
  category: 'Grammar' | 'Vocabulary / Collocation' | 'Sentence Structure' | 'Cohesion' | 'Logic / Development' | 'Task Response / Achievement';
  severity: 'high' | 'medium' | 'low';
  quote: string;
  explanation: string;
  selfRevisionPrompt?: string;
  correction?: string;
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

export function coerceWritingStage(value: string | null): WritingStage | null {
  if (value === null || value.trim() === '') return null;
  const stage = Number(value);
  return Number.isInteger(stage) && stage >= 0 && stage <= 3 ? stage as WritingStage : null;
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

interface NormalizedCharacter { value: string; start: number; end: number; }
interface NormalizedWord { value: string; start: number; end: number; }

function normalizedCharacters(text: string): NormalizedCharacter[] {
  const characters: NormalizedCharacter[] = [];
  let offset = 0;
  for (const original of text) {
    const start = offset;
    offset += original.length;
    if (/[\u200B-\u200D\u2060\uFEFF]/u.test(original)) continue;
    let canonical = original.normalize('NFKC').toLocaleLowerCase();
    canonical = canonical
      .replace(/[‘’‚‛′`´]/gu, "'")
      .replace(/[“”„‟″]/gu, '"')
      .replace(/[‐‑‒–—―−]/gu, '-')
      .replace(/…/gu, '...');
    if (/\s/u.test(canonical)) canonical = ' ';
    for (const value of canonical) {
      const previous = characters.at(-1);
      if (value === ' ' && previous?.value === ' ') { previous.end = offset; continue; }
      characters.push({ value, start, end: offset });
    }
  }
  const punctuation = /[-,.;:!?()[\]{}"']/u;
  return characters.filter((character, index) => {
    if (character.value !== ' ') return true;
    const previous = characters[index - 1]?.value;
    const next = characters[index + 1]?.value;
    return !((previous && punctuation.test(previous)) || (next && punctuation.test(next)));
  });
}

function normalizedQuoteRanges(text: string, quote: string): QuoteRange[] {
  const source = normalizedCharacters(text);
  const normalizedQuote = normalizedCharacters(quote).map((character) => character.value).join('').trim();
  if (!source.length || !normalizedQuote) return [];
  const unwrapped = normalizedQuote.match(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u)?.slice(1).find((value) => value !== undefined)?.trim();
  const candidates = [...new Set([normalizedQuote, unwrapped].filter((value): value is string => Boolean(value)))];
  const sourceValue = source.map((character) => character.value).join('');
  const ranges: QuoteRange[] = [];
  for (const candidate of candidates) {
    let fromIndex = 0;
    while (fromIndex <= sourceValue.length - candidate.length) {
      const matchIndex = sourceValue.indexOf(candidate, fromIndex);
      if (matchIndex < 0) break;
      const first = source[matchIndex];
      const last = source[matchIndex + candidate.length - 1];
      if (first && last) ranges.push({ start: first.start, end: last.end });
      fromIndex = matchIndex + Math.max(1, candidate.length);
    }
    if (ranges.length) break;
  }
  if (!ranges.length) {
    // Compatible models occasionally change only punctuation around an otherwise
    // verbatim quote. Match the same consecutive word sequence as a conservative
    // fallback so the editor can still locate it without fuzzy paraphrase matches.
    const sourceWords = normalizedWords(text);
    const quoteWords = normalizedWords(quote);
    if (quoteWords.length >= 2) {
      for (let index = 0; index <= sourceWords.length - quoteWords.length; index += 1) {
        if (quoteWords.every((word, offset) => sourceWords[index + offset]?.value === word.value)) {
          ranges.push({ start: sourceWords[index].start, end: sourceWords[index + quoteWords.length - 1].end });
          index += quoteWords.length - 1;
        }
      }
    }
  }
  return ranges.filter((range, index) => !ranges.slice(0, index).some((existing) => existing.start === range.start && existing.end === range.end));
}

function normalizedWords(text: string): NormalizedWord[] {
  return [...text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)].map((match) => ({
    value: match[0].normalize('NFKC').toLocaleLowerCase().replace(/’/gu, "'"),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function findQuotedTextRange(text: string, quote: string): QuoteRange | null {
  return normalizedQuoteRanges(text, quote)[0] ?? null;
}

export function highlightQuotedText(text: string, quotes: Array<{ id: string; quote: string }>): QuoteHighlightChunk[] {
  if (!text) return [];
  const matches: Array<{ start: number; end: number; id: string }> = [];
  for (const item of quotes) {
    for (const range of normalizedQuoteRanges(text, item.quote)) matches.push({ ...range, id: item.id });
  }
  if (!matches.length) return [{ text, highlighted: false, issueIds: [] }];
  const boundaries = new Set([0, text.length]);
  for (const match of matches) { boundaries.add(match.start); boundaries.add(match.end); }
  const points = [...boundaries].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const issueIds = [...new Set(matches.filter((match) => match.start < end && match.end > start).map((match) => match.id))];
    return { text: text.slice(start, end), highlighted: issueIds.length > 0, issueIds };
  });
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
  guidanceMode?: WritingGuidanceMode;
}): string {
  const guidanceMode = input.guidanceMode ?? 'hint';
  const modeInstruction = input.mode === 'upgrade'
    ? '主要错误应已收敛。区分 necessary correction、natural upgrade、optional sophistication；保持原观点，只做 same idea, better English。'
    : input.mode === 'recheck'
      ? '这是学生自己修改后的版本。重点检查上一轮主要问题是否解决，并只报告仍然重要或新引入的问题。'
      : '这是原始独立写作。先诊断问题，让学生自己修改；不要代写整句或整篇。';

  const responseLanguage = input.outputLanguage === 'zh'
    ? `Write summary, priorities, explanations, ${guidanceMode === 'hint' ? 'self-revision prompts' : 'correction explanations'}, and upgrade reasons in Simplified Chinese. Keep category, severity, type, ruleKey, and every quote/original/suggestion/correction field in English.`
    : `Write summary, priorities, explanations, ${guidanceMode === 'hint' ? 'self-revision prompts' : 'correction explanations'}, and upgrade reasons in clear English. Keep every quote exactly as it appears in the English draft.`;

  const issueResponseField = guidanceMode === 'hint'
    ? '    "selfRevisionPrompt": "the smallest question or hint that helps the student revise",'
    : '    "correction": "the corrected version of quote only, not a full rewrite unless quote is a full sentence",';
  const guidanceRule = guidanceMode === 'hint'
    ? '- For each issue, return selfRevisionPrompt with the smallest useful question or hint. Do not reveal the corrected wording and omit correction.'
    : '- For each issue, return correction with the corrected wording for quote. Do not ask a self-revision question and omit selfRevisionPrompt.';

  const formatInstruction = input.responseFormat === 'markdown'
    ? `Return Markdown only, using exactly these headings:\n# Band estimate\n# Summary\n# Fix first\n# Issues\nFor every issue use: ## [Severity] Category — rule_key, then Quote, Explanation, and ${guidanceMode === 'hint' ? 'Self-revision prompt' : 'Correction'}.\n# Language upgrades\n# Ready for upgrade\nDo not wrap the report in a code fence.`
    : `Return valid JSON only, with no Markdown.\n\nJSON shape:\n{\n  "bandEstimate": "5.5–6.0",\n  "summary": "short summary",\n  "priorities": ["what to fix first"],\n  "issues": [{\n    "id": "issue-1",\n    "category": "Grammar|Vocabulary / Collocation|Sentence Structure|Cohesion|Logic / Development|Task Response / Achievement",\n    "severity": "high|medium|low",\n    "quote": "short exact fragment",\n    "explanation": "why this is a problem",\n${issueResponseField}\n    "ruleKey": "stable_error_key"\n  }],\n  "upgrades": [{\n    "original": "short verbatim fragment copied from Current draft",\n    "suggestion": "a better local expression, not a full rewrite",\n    "why": "why it is better",\n    "type": "necessary|natural|optional"\n  }],\n  "readyForUpgrade": false\n}`;

  return `You are a rigorous but restrained IELTS Writing coach. Follow the Correction → Transfer method.\n\n${modeInstruction}\n\n${responseLanguage}\n\nRules:\n- Never generate a complete model answer or rewrite the whole essay.\n- Every issue.quote and every upgrades.original MUST be a short, verbatim substring copied from Current draft. Never translate, correct, normalize, paraphrase, or add quotation marks to these source fields.\n${guidanceRule}\n- Return only the 3–8 issues with the greatest score impact. Do not invent minor problems to fill a quota.\n- Use stable, short English ruleKey values such as article_usage, subject_verb_agreement, or unclear_causal_chain. Never escape underscores in JSON strings.\n- bandEstimate must be a range such as 5.5–6.0, never a promised exam score.\n- readyForUpgrade is true only after the main grammar, logic, and task-response problems have clearly converged.\n- Return upgrades only in upgrade mode. Label each necessary, natural, or optional. Otherwise return an empty array.\n- For Task 1, also check overview, comparison objects, tense, and data language. For Task 2, also check position, topic sentences, explanation, examples, causal chains, relevance, and conclusion.\n\n${formatInstruction}\n\nTask: ${taskLabel(input.task)}\nQuestion: ${input.question || 'No question supplied. Do not judge Task Response; analyse only the visible language and structure.'}\nPrevious issue keys: ${input.previousRuleKeys?.join(', ') || 'none'}\nOriginal attempt:\n${input.originalEssay || input.essay}\n\nCurrent draft:\n${input.essay}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function parseWritingFeedback(raw: string): WritingFeedback {
  const value = parseAiJson(raw) as Partial<WritingFeedback>;
  if (typeof value.summary !== 'string' || !Array.isArray(value.issues)) throw new Error('AI 反馈格式不完整，请重试。');

  const allowedCategories = new Set<WritingIssue['category']>([
    'Grammar', 'Vocabulary / Collocation', 'Sentence Structure', 'Cohesion', 'Logic / Development', 'Task Response / Achievement',
  ]);
  const allowedSeverities = new Set<WritingIssue['severity']>(['high', 'medium', 'low']);
  const issues = value.issues.filter((issue): issue is WritingIssue => Boolean(
    issue && typeof issue.id === 'string' && allowedCategories.has(issue.category) &&
    allowedSeverities.has(issue.severity) && typeof issue.quote === 'string' &&
    typeof issue.explanation === 'string' && (typeof issue.selfRevisionPrompt === 'string' || typeof issue.correction === 'string') && typeof issue.ruleKey === 'string',
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
