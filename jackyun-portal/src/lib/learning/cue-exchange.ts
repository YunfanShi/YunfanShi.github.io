import { parseCueDeepUnderstanding } from './cue-understanding.ts';
import { parseCueSourceFields } from './cue-source.ts';
import type { CueBulkOperation, CueCreateOperation, CueReview, CueStudyDraft, CueUpdateOperation, StudyCue } from './schedule-control.ts';

export const CUE_EXCHANGE_FORMAT = 'jackyun-cue-exchange';
export type CueExchangeBundle = { format: typeof CUE_EXCHANGE_FORMAT; version: 1; exportedAt: string; cues: StudyCue[]; aiPrompt?: string };
export type CueExchangeMatch = { incoming: StudyCue; local?: StudyCue; candidates: StudyCue[]; match: 'id' | 'content' | 'ambiguous' | 'new' };
export type CueExchangeSelection = { incoming: StudyCue; selectedLocalId: string; action: 'add' | 'update' | 'copy' | 'keep' | 'skip' };

const cueTypes = ['general', 'definition', 'explain', 'state', 'calculate', 'formula', 'derivation', 'proof', 'compare', 'process', 'application', 'diagram', 'multiple-choice', 'knowledge-point', 'caution', 'condition-result'] as const satisfies readonly StudyCue['type'][];
const cueDisplays = ['standard', 'headline', 'formula', 'steps', 'stepwise', 'comparison', 'scenario', 'definition-card', 'multiple-choice'] as const satisfies readonly NonNullable<StudyCue['display']>[];

const cueExchangePrompt = [
  '请按我的要求审阅下面的 CUE，只输出一份合法 JSON，不要附加解释。以导出的 JSON 为模板，保留 format: "jackyun-cue-exchange"、version: 1 和 cues 数组，返回时可移除 aiPrompt。',
  'cues 只需包含建议修改的卡片。每张都保留原 id，提供原学科 subjectName、大单元 unit，以及完整的 prompt（题目）、type（题型）、markingPoints（字符串数组）。保留卡片所需的其他字段。新增卡片请使用唯一的新 id。不要改写学习状态、复习日期、间隔、版本号或时间戳。',
  '一张卡聚焦一个可独立回忆或运用的知识点。用 subtitle 写必要条件，避免提前泄露答案。answer 给出准确答案，markingPoints 每项写一个必要得分点或解题步骤。保留原语言与 LaTeX，并在 JSON 字符串内正确转义反斜杠（例如 ' + String.raw`"\(v=u+at\)"` + '）。',
  `type 可用：${cueTypes.join('、')}。display 可用：${cueDisplays.join('、')}。选择题保留 choices（字符串数组）和 correctChoice（从 0 开始的正确选项索引）。`,
  '可选字段缺省时，修改已有卡片会保留该字段。需要清空可选文字字段时使用空字符串。deepUnderstanding 可含 gap 和 definition、principle、conditions、transfer，各维度均需 question 和 answer。',
  '保留可靠的来源和真题依据。有证据时才更新 sourceKind、source、sourceLocation、sourceUrl、examStatus 或 examHistory。examStatus 只接受 unknown、tested、not-tested。',
].join('\n');

export function createCueExchangeBundle(cues: StudyCue[], exportedAt = new Date().toISOString(), { includePrompt = false } = {}): CueExchangeBundle {
  return {
    format: CUE_EXCHANGE_FORMAT,
    version: 1,
    exportedAt,
    ...(includePrompt ? { aiPrompt: cueExchangePrompt } : {}),
    cues: structuredClone(cues),
  };
}

export function parseCueExchangeBundle(text: string): CueExchangeBundle {
  const input = text.trim();
  const fenced = input.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
  let raw: unknown;
  try { raw = JSON.parse(fenced?.[1] ?? input); } catch { throw new Error('请输入有效的 JSON，或粘贴 AI 返回的完整 JSON 代码块。'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('CUE 文件格式无效。');
  const bundle = raw as Partial<CueExchangeBundle>;
  if (bundle.format !== CUE_EXCHANGE_FORMAT || bundle.version !== 1 || !Array.isArray(bundle.cues) || !bundle.cues.length) throw new Error('这不是有效的 JackYun CUE 交换文件。');
  if (bundle.cues.length > 2000) throw new Error('一个文件最多包含 2000 张 CUE。');
  const ids = new Set<string>();
  const cues = bundle.cues.map((value, index) => {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id.trim() || typeof value.prompt !== 'string' || !value.prompt.trim() || typeof value.subjectName !== 'string' || !value.subjectName.trim() || typeof value.unit !== 'string' || !value.unit.trim() || !Array.isArray(value.markingPoints)) throw new Error(`第 ${index + 1} 张 CUE 缺少必要字段。`);
    if (value.markingPoints.some((point) => typeof point !== 'string') || !cueTypes.includes(value.type)) throw new Error(`第 ${index + 1} 张 CUE 的题型或逐条内容无效。`);
    if (value.display && !cueDisplays.includes(value.display)) throw new Error(`第 ${index + 1} 张 CUE 的显示预设无效。`);
    if ([value.subsection, value.subtitle, value.answer].some((field) => field !== undefined && typeof field !== 'string')) throw new Error(`第 ${index + 1} 张 CUE 的章节、说明或答案必须是文字。`);
    if (value.choices !== undefined && (!Array.isArray(value.choices) || value.choices.some((choice) => typeof choice !== 'string'))) throw new Error(`第 ${index + 1} 张 CUE 的选项必须是文字数组。`);
    if (value.correctChoice !== undefined && (!Number.isInteger(value.correctChoice) || Number(value.correctChoice) < 0 || Number(value.correctChoice) >= (value.choices?.length ?? 0))) throw new Error(`第 ${index + 1} 张 CUE 的正确选项索引无效。`);
    if (value.type === 'multiple-choice' && (!Array.isArray(value.choices) || value.choices.length < 2 || !Number.isInteger(value.correctChoice) || Number(value.correctChoice) < 0 || Number(value.correctChoice) >= value.choices.length)) throw new Error(`第 ${index + 1} 张 CUE 的选择题选项无效。`);
    if (ids.has(value.id)) throw new Error(`文件中 CUE ID 重复：${value.id}`);
    ids.add(value.id);
    if (value.updatedAt && !Number.isFinite(Date.parse(value.updatedAt))) throw new Error(`第 ${index + 1} 张 CUE 的更新时间格式无效。`);
    try {
      return { ...value, ...(value.deepUnderstanding !== undefined ? { deepUnderstanding: parseCueDeepUnderstanding(value.deepUnderstanding) } : {}), ...parseCueSourceFields(value as unknown as Record<string, unknown>) };
    } catch (error) {
      throw new Error(`第 ${index + 1} 张 CUE：${(error as Error).message}`);
    }
  });
  if (bundle.exportedAt && !Number.isFinite(Date.parse(bundle.exportedAt))) throw new Error('文件导出时间格式无效。');
  return { format: CUE_EXCHANGE_FORMAT, version: 1, exportedAt: bundle.exportedAt ?? '', cues };
}

const contentKey = (cue: StudyCue) => [cue.subjectName, cue.unit, cue.prompt]
  .map((part) => part.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')).join('\u0000');

export function matchCueExchange(incoming: StudyCue[], local: StudyCue[]): CueExchangeMatch[] {
  const localById = new Map(local.map((cue) => [cue.id, cue]));
  const localByContent = new Map<string, StudyCue[]>();
  for (const cue of local) localByContent.set(contentKey(cue), [...(localByContent.get(contentKey(cue)) ?? []), cue]);
  return incoming.map((cue) => {
    const byId = localById.get(cue.id);
    if (byId) return { incoming: cue, local: byId, candidates: [byId], match: 'id' };
    const candidates = localByContent.get(contentKey(cue)) ?? [];
    if (candidates.length === 1) return { incoming: cue, local: candidates[0], candidates, match: 'content' };
    if (candidates.length > 1) return { incoming: cue, candidates, match: 'ambiguous' };
    return { incoming: cue, candidates: [], match: 'new' };
  });
}

export const CUE_EXCHANGE_CONTENT_FIELDS = ['deepUnderstanding', 'subjectName', 'unit', 'subsection', 'prompt', 'subtitle', 'answer', 'type', 'display', 'choices', 'correctChoice', 'markingPoints', 'sourceKind', 'source', 'sourceLocation', 'sourceUrl', 'examStatus', 'examHistory'] as const;
export type CueExchangeContentField = typeof CUE_EXCHANGE_CONTENT_FIELDS[number];
export const cueExchangeFieldLabels: Record<CueExchangeContentField, string> = {
  deepUnderstanding: '深度理解', subjectName: '学科', unit: '单元', subsection: '章节', prompt: '题目', subtitle: '说明', answer: '答案', type: '类型', display: '显示方式', choices: '选项', correctChoice: '正确选项', markingPoints: '要点与步骤', examStatus: '真题考查情况', examHistory: '考试依据', sourceKind: '来源类型', source: '具体来源', sourceLocation: '来源位置', sourceUrl: '来源链接',
};

export function cueExchangeChangedFields(local: StudyCue, incoming: StudyCue): CueExchangeContentField[] {
  return CUE_EXCHANGE_CONTENT_FIELDS.filter((field) => incoming[field] !== undefined && JSON.stringify(local[field] ?? '') !== JSON.stringify(incoming[field]));
}

export function buildCueExchangeOperations(selections: CueExchangeSelection[], localById: ReadonlyMap<string, StudyCue>): CueBulkOperation[] {
  const operations: CueBulkOperation[] = [];
  const updated = new Set<string>();
  for (const { incoming, action, selectedLocalId } of selections) {
    if (action === 'keep' || action === 'skip') continue;
    if (action === 'update') {
      const local = localById.get(selectedLocalId);
      if (!local) throw new Error('所选的本地 CUE 已不存在，请重新预览。');
      const changed = cueExchangeChangedFields(local, incoming);
      if (!changed.length) continue;
      if (updated.has(local.id)) throw new Error(`多张外部卡片选中了同一张本地 CUE「${local.prompt}」。请只保留一条更新。`);
      updated.add(local.id);
      const fields: Omit<CueUpdateOperation, 'action' | 'id'> = Object.fromEntries(changed.map((field) => [field, incoming[field]]));
      operations.push({ ...fields, action: 'update', id: local.id });
    } else {
      const fields: Omit<CueCreateOperation, 'action'> = {
        ...Object.fromEntries(CUE_EXCHANGE_CONTENT_FIELDS.map((field) => [field, incoming[field]])),
        subjectName: incoming.subjectName,
        unit: incoming.unit,
        prompt: incoming.prompt,
        type: incoming.type,
        display: incoming.display || 'standard',
        markingPoints: incoming.markingPoints,
      };
      operations.push({ ...fields, action: 'create' });
    }
  }
  return operations;
}

export function cueExchangeProgress(cue: StudyCue, reviews: CueReview[], drafts: CueStudyDraft[]) {
  const history = reviews.filter((review) => review.cueId === cue.id).toSorted((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
  const draft = drafts.find((item) => item.cueIds.includes(cue.id) && item.assessments[cue.id] === undefined);
  const isCurrentDraftCue = draft?.cueIds[draft.index] === cue.id;
  return {
    status: cue.status ?? '未判定',
    reviewCount: history.length,
    lastReviewedAt: history[0]?.reviewedAt ?? cue.lastReviewedAt,
    nextReviewDate: cue.nextReviewDate,
    draft: draft ? { updatedAt: draft.updatedAt, position: draft.cueIds.indexOf(cue.id) + 1, total: draft.cueIds.length, revealed: isCurrentDraftCue ? draft.revealed : false, revealedStepCount: isCurrentDraftCue ? draft.revealedStepCount ?? 0 : 0 } : undefined,
  };
}
