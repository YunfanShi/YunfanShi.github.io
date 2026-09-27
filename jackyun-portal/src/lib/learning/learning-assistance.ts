import type { CueReview, StudyCue } from './schedule-control.ts';

export type CueDifficulty = 'easy' | 'medium' | 'hard' | 'extreme';
export const difficultyLabels: Record<CueDifficulty, string> = { easy: '简单', medium: '中等', hard: '难', extreme: '极限' };
export const difficultyFactors: Record<CueDifficulty, number> = { easy: 1.5, medium: 1, hard: 0.75, extreme: 0.5 };
export const cueSkills = ['general', 'definition', 'calculate', 'explain', 'proof', 'formula', 'state'] as const;
export interface CueAiAdvice { skill?: typeof cueSkills[number]; signature: string; difficulty: CueDifficulty; reason: string; qualityIssue?: string; suggestedPrompt?: string; generatedAt: string }
export interface DailyLearningAdvice { date: string; batchLimit: number; reason: string }
export function cueContentSignature(cue: StudyCue): string {
  return JSON.stringify([cue.subjectName, cue.unit, cue.type, cue.prompt, cue.subtitle, cue.answer, cue.choices, cue.correctChoice, cue.markingPoints]);
}
export function effectiveCueDifficulty(cue: StudyCue, reviews: CueReview[] = []): CueDifficulty {
  const candidate = cue.userDifficulty ?? (cue.aiAdvice?.signature === cueContentSignature(cue) ? cue.aiAdvice.difficulty : 'medium');
  const base = Object.hasOwn(difficultyLabels, candidate) ? candidate : 'medium';
  const recent = reviews.filter((review) => review.cueId === cue.id).toSorted((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)).slice(0, 5);
  const redDays = new Set(recent.filter((review) => review.status === 'unclear').map((review) => review.reviewedAt.slice(0, 10))).size;
  const weakDays = new Set(recent.filter((review) => review.status !== 'stable').map((review) => review.reviewedAt.slice(0, 10))).size;
  if (redDays >= 3) return 'extreme';
  if (weakDays >= 3 && (base === 'easy' || base === 'medium')) return 'hard';
  return base;
}
/** Evidence summary, not a prediction or a permanent label about the learner. */
export function cueProfileType(cue: StudyCue): string { return cue.aiAdvice?.signature === cueContentSignature(cue) && cue.aiAdvice.skill ? cue.aiAdvice.skill : cue.type; }
export function learningProfile(cues: StudyCue[], reviews: CueReview[]) {
  const groups = new Map<string, { subject: string; type: string; attempts: number; weak: number }>();
  const byId = new Map(cues.map((cue) => [cue.id, cue]));
  for (const review of reviews) {
    const cue = byId.get(review.cueId); if (!cue) continue;
    const type = cueProfileType(cue);
    const key = `${cue.subjectId}:${type}`;
    const group = groups.get(key) ?? { subject: cue.subjectName, type, attempts: 0, weak: 0 };
    group.attempts += 1; if (review.status !== 'stable') group.weak += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.weak / b.attempts - a.weak / a.attempts);
}
export function parseLearningAdvice(value: unknown, cues: StudyCue[], now: string): { cues: Record<string, CueAiAdvice>; daily?: DailyLearningAdvice } {
  if (!value || typeof value !== 'object') throw new Error('AI 建议需要 JSON 对象。');
  const raw = value as { cues?: unknown; daily?: unknown };
  if (!Array.isArray(raw.cues)) throw new Error('AI 建议缺少 cues。');
  const results: Record<string, CueAiAdvice> = {};
  for (const row of raw.cues) {
    if (!row || typeof row !== 'object') throw new Error('AI 建议格式错误。');
    const item = row as Record<string, unknown>; const cue = cues.find((cue) => cue.id === item.id);
    if (!cue || results[cue.id] || !Object.hasOwn(difficultyLabels, String(item.difficulty)) || typeof item.reason !== 'string' || !item.reason.trim()) throw new Error('AI 返回了无效 ID、重复 ID 或难度。');
    if ((item.qualityIssue !== undefined && typeof item.qualityIssue !== 'string') || (item.suggestedPrompt !== undefined && typeof item.suggestedPrompt !== 'string')) throw new Error('AI 质量建议必须为文本。');
    if (item.skill !== undefined && !cueSkills.includes(item.skill as typeof cueSkills[number])) throw new Error('AI 能力维度不在允许范围内。');
    results[cue.id] = { ...(item.skill ? { skill: item.skill as typeof cueSkills[number] } : {}), signature: cueContentSignature(cue), difficulty: item.difficulty as CueDifficulty, reason: item.reason.slice(0, 500), qualityIssue: String(item.qualityIssue ?? '').slice(0, 500), suggestedPrompt: String(item.suggestedPrompt ?? '').slice(0, 500), generatedAt: now };
  }
  if (Object.keys(results).length !== cues.length) throw new Error('AI 未完整返回本批 CUE 评级。');
  let daily: DailyLearningAdvice | undefined;
  if (raw.daily) {
    const item = raw.daily as Record<string, unknown>;
    if (typeof item.batchLimit !== 'number' || ![1, 2].includes(item.batchLimit) || typeof item.reason !== 'string') throw new Error('AI 每日容量必须为 1 或 2 批。');
    daily = { date: now.slice(0, 10), batchLimit: Number(item.batchLimit), reason: item.reason.slice(0, 500) };
  }
  return { cues: results, daily };
}
