import type { TrainingHintEvent } from './independent-training.ts';

export const DEEP_CUE_DIMENSIONS = ['definition', 'principle', 'conditions', 'transfer'] as const;
export type DeepCueDimension = typeof DEEP_CUE_DIMENSIONS[number];
export const deepCueLabels: Record<DeepCueDimension, string> = { definition: 'Definition 它是什么', principle: 'Principle 为什么成立', conditions: 'Conditions 何时适用', transfer: 'Transfer 条件变化怎么办' };
export type CueDeepUnderstanding = { gap?: string } & Partial<Record<DeepCueDimension, { question: string; answer: string }>>;
export const cueBottlenecks = { recall: '记忆提取', principle: '原理理解', conditions: '适用条件', modelling: '建立关系', calculation: '计算执行', time: '时间策略' } as const;
export interface CueTrainingEvidence {
  sessionId?: string;
  independentMode?: boolean;
  attempt?: string;
  bottleneck?: keyof typeof cueBottlenecks;
  hints?: TrainingHintEvent[];
  answers?: Partial<Record<DeepCueDimension, string>>;
  revealed?: DeepCueDimension[];
}
export function parseCueDeepUnderstanding(value: unknown, partial = false): CueDeepUnderstanding | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Deep Understanding 必须为对象。');
  const raw = value as Record<string, unknown>, result: CueDeepUnderstanding = {};
  const text = (v: unknown, max: number): string => {
    if (typeof v !== 'string' || v.length > max) throw Error(`深度 Cue 内容必须是最多 ${max} 字的文字。`);
    return v.trim();
  };
  if (raw.gap !== undefined) result.gap = text(raw.gap, 1000);
  for (const key of DEEP_CUE_DIMENSIONS) {
    if (raw[key] === undefined) continue;
    if (!raw[key] || typeof raw[key] !== 'object' || Array.isArray(raw[key])) throw Error(`${key} 需要 question 和 answer。`);
    const row = raw[key] as Record<string, unknown>;
    const question = text(row.question, 500), answer = text(row.answer, 3000);
    if (!question && !answer) continue;
    if (!partial && (!question || !answer)) throw Error(`${deepCueLabels[key]} 请同时填写问题与参考解释，或清空该维度。`);
    if (question || answer) result[key] = { question, answer };
  }
  return result;
}
export function hasDeepUnderstanding(value?: CueDeepUnderstanding): boolean {
  return Boolean(value && (value.gap?.trim() || DEEP_CUE_DIMENSIONS.some(key=>value[key]?.question.trim() || value[key]?.answer.trim())));
}
export function validateCueTrainingEvidence(value?: CueTrainingEvidence): CueTrainingEvidence | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || (value.independentMode !== undefined && typeof value.independentMode !== 'boolean') || (value.bottleneck !== undefined && !Object.hasOwn(cueBottlenecks,value.bottleneck))) throw Error('Cue 训练证据格式无效。');
  if (value.sessionId !== undefined && (typeof value.sessionId !== 'string' || value.sessionId.length>200 || !value.sessionId)) throw Error('Cue 训练会话无效。');
  if (value.attempt !== undefined && (typeof value.attempt !== 'string' || value.attempt.length > 5000)) throw Error('独立尝试内容格式无效。');
  if (value.hints !== undefined && (!Array.isArray(value.hints) || value.hints.length > 100 || new Set(value.hints.map(h=>h?.id)).size!==value.hints.length || value.hints.some(h=>!h || typeof h.id!=='string' || !h.id || ![1,2,3,4].includes(h.level) || !Number.isFinite(Date.parse(h.at))))) throw Error('Cue 提示记录格式无效。');
  if (value.answers !== undefined && (!value.answers || typeof value.answers!=='object' || Array.isArray(value.answers) || Object.entries(value.answers).some(([key,text])=>!DEEP_CUE_DIMENSIONS.includes(key as DeepCueDimension)||typeof text!=='string'||text.length>5000))) throw Error('深度 Cue 作答格式无效。');
  if (value.revealed !== undefined && (!Array.isArray(value.revealed)||value.revealed.some(key=>!DEEP_CUE_DIMENSIONS.includes(key)))) throw Error('深度 Cue 揭示记录无效。');
  return structuredClone(value);
}

export function cueTrainingSummary(value?: CueTrainingEvidence): string {
  if (!value) return '';
  const hints=value.hints===undefined?'提示未记录':`实际提示 ${value.hints.length} 次，最高层级 ${Math.max(0,...value.hints.map(h=>h.level))}`;
  return [value.bottleneck?cueBottlenecks[value.bottleneck]:'',hints].filter(Boolean).join(' · ');
}
