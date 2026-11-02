import type { CueReview, CueStudyDraft, StudyCue } from './schedule-control.ts';

export const CUE_EXCHANGE_FORMAT = 'jackyun-cue-exchange';
export type CueExchangeBundle = { format: typeof CUE_EXCHANGE_FORMAT; version: 1; exportedAt: string; cues: StudyCue[] };
export type CueExchangeMatch = { incoming: StudyCue; local?: StudyCue; candidates: StudyCue[]; match: 'id' | 'content' | 'ambiguous' | 'new' };

export function createCueExchangeBundle(cues: StudyCue[], exportedAt = new Date().toISOString()): CueExchangeBundle {
  return { format: CUE_EXCHANGE_FORMAT, version: 1, exportedAt, cues: structuredClone(cues) };
}

export function parseCueExchangeBundle(text: string): CueExchangeBundle {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('文件不是有效的 JSON。'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('CUE 文件格式无效。');
  const bundle = raw as Partial<CueExchangeBundle>;
  if (bundle.format !== CUE_EXCHANGE_FORMAT || bundle.version !== 1 || !Array.isArray(bundle.cues) || !bundle.cues.length) throw new Error('这不是有效的 JackYun CUE 交换文件。');
  if (bundle.cues.length > 2000) throw new Error('一个文件最多包含 2000 张 CUE。');
  const ids = new Set<string>();
  const cues = bundle.cues.map((value, index) => {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id.trim() || typeof value.prompt !== 'string' || !value.prompt.trim() || typeof value.subjectName !== 'string' || typeof value.unit !== 'string' || !Array.isArray(value.markingPoints)) throw new Error(`第 ${index + 1} 张 CUE 缺少必要字段。`);
    if (value.markingPoints.some((point) => typeof point !== 'string') || !['general', 'definition', 'explain', 'state', 'calculate', 'formula', 'derivation', 'proof', 'compare', 'process', 'application', 'diagram', 'multiple-choice', 'knowledge-point', 'caution', 'condition-result'].includes(value.type)) throw new Error(`第 ${index + 1} 张 CUE 的题型或逐条内容无效。`);
    if (value.display && !['standard', 'headline', 'formula', 'steps', 'stepwise', 'comparison', 'scenario', 'definition-card', 'multiple-choice'].includes(value.display)) throw new Error(`第 ${index + 1} 张 CUE 的显示预设无效。`);
    if (value.type === 'multiple-choice' && (!Array.isArray(value.choices) || value.choices.length < 2 || !Number.isInteger(value.correctChoice) || Number(value.correctChoice) < 0 || Number(value.correctChoice) >= value.choices.length)) throw new Error(`第 ${index + 1} 张 CUE 的选择题选项无效。`);
    if (ids.has(value.id)) throw new Error(`文件中 CUE ID 重复：${value.id}`);
    ids.add(value.id);
    if (value.updatedAt && !Number.isFinite(Date.parse(value.updatedAt))) throw new Error(`第 ${index + 1} 张 CUE 的更新时间格式无效。`);
    return value as StudyCue;
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

export const CUE_EXCHANGE_CONTENT_FIELDS = ['subjectName', 'unit', 'subsection', 'prompt', 'subtitle', 'answer', 'type', 'display', 'choices', 'correctChoice', 'markingPoints'] as const;
export type CueExchangeContentField = typeof CUE_EXCHANGE_CONTENT_FIELDS[number];
export const cueExchangeFieldLabels: Record<CueExchangeContentField, string> = {
  subjectName: '学科', unit: '单元', subsection: '章节', prompt: '题目', subtitle: '说明', answer: '答案', type: '类型', display: '显示方式', choices: '选项', correctChoice: '正确选项', markingPoints: '要点与步骤',
};

export function cueExchangeChangedFields(local: StudyCue, incoming: StudyCue): CueExchangeContentField[] {
  return CUE_EXCHANGE_CONTENT_FIELDS.filter((field) => JSON.stringify(local[field] ?? null) !== JSON.stringify(incoming[field] ?? null));
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
