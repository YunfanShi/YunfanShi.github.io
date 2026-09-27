import { cueContentSignature, cueNeedsAiAnalysis, parseLearningAdvice, type CueAiAdvice, type DailyLearningAdvice } from './learning-assistance.ts';
import type { CueReview, StudyCue } from './schedule-control.ts';
export const CUE_RATING_BATCH_SIZE = 3;
export type CueRatingPhase = 'queued' | 'sending' | 'waiting' | 'reading' | 'validating' | 'rated' | 'failed' | 'cancelled' | 'stale';
export interface CueRatingJob { phase: CueRatingPhase; updatedAt: string; startedAt?: string; error?: string }
export const ratingPhaseLabels: Record<CueRatingPhase, string> = { queued: '未发送 · 已排队', sending: '正在发起请求', waiting: '请求已发起 · 等待服务器响应', reading: '已收到响应 · 正在读取结果', validating: '正在校验 ID、内容版本与评级格式', rated: '结果已保存', failed: '请求未完成 · 可重试', cancelled: '本轮已停止 · 未保存新评级', stale: '内容已改变 · 旧响应已丢弃' };
export function ratingCategory(cue: StudyCue, reviews: CueReview[], job?: CueRatingJob): 'pending' | 'active' | 'rated' | 'failed' {
  if (job && ['queued', 'sending', 'waiting', 'reading', 'validating'].includes(job.phase)) return 'active';
  if (job?.phase === 'failed') return 'failed';
  return cueNeedsAiAnalysis(cue, reviews) ? 'pending' : 'rated';
}
export function cueAnalysisKey(cue: StudyCue, reviews: CueReview[]): string {
  return JSON.stringify([cue.id, cueContentSignature(cue), reviews.filter((review) => review.cueId === cue.id).map((review) => review.reviewedAt).sort().at(-1)]);
}
export function cueRatingCandidates(cues: StudyCue[], reviews: CueReview[], forced: Set<string>, attempted: Set<string>): StudyCue[] {
  const prioritized = [...cues.filter((cue) => forced.has(cue.id)), ...cues.filter((cue) => !forced.has(cue.id) && cueNeedsAiAnalysis(cue, reviews) && !attempted.has(cueAnalysisKey(cue, reviews)))];
  return prioritized.slice(0, CUE_RATING_BATCH_SIZE);
}

/** Current work first; unrelated historical ratings stay in the library. */
export function ratingProgressRows(cues: StudyCue[], reviews: CueReview[], jobs: Record<string, CueRatingJob>): StudyCue[] {
  const priority = (cue: StudyCue) => {
    const job = jobs[cue.id];
    if (job && ['sending', 'waiting', 'reading', 'validating'].includes(job.phase)) return 0;
    if (job?.phase === 'failed') return 1;
    if (job?.phase === 'queued') return 2;
    if (cueNeedsAiAnalysis(cue, reviews) && !job) return 3;
    return 4;
  };
  return cues.filter((cue) => Boolean(jobs[cue.id]) || cueNeedsAiAnalysis(cue, reviews)).toSorted((a, b) => priority(a) - priority(b));
}

/** A model may omit rows. Save only individually validated identities and values. */
export function parseCueRatingBatch(value: unknown, cues: StudyCue[], now: string, needsDaily: boolean) {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { cues?: unknown }).cues)) throw new Error('AI 建议缺少 cues 数组。');
  const raw = value as { cues: unknown[]; daily?: unknown };
  const expected = new Map(cues.map((cue) => [cue.id, cue]));
  const seen = new Set<string>();
  const results: Record<string, CueAiAdvice> = {};
  const failed: Record<string, string> = {};
  for (const row of raw.cues) {
    const id = row && typeof row === 'object' ? (row as { id?: unknown }).id : undefined;
    if (typeof id !== 'string' || !expected.has(id) || seen.has(id)) throw new Error('AI 返回了无效或重复的 CUE ID，本响应未保存。');
    seen.add(id);
    try { results[id] = parseLearningAdvice({ cues: [row] }, [expected.get(id)!], now).cues[id]; }
    catch (error) { failed[id] = error instanceof Error ? error.message : '本条评级无效。'; }
  }
  for (const cue of cues) if (!seen.has(cue.id)) failed[cue.id] = 'AI 未返回本条 CUE 评级。';
  let daily: DailyLearningAdvice | undefined;
  let dailyError: string | undefined;
  if (needsDaily) {
    try {
      daily = parseLearningAdvice({ cues: [], daily: raw.daily }, [], now).daily;
      if (!daily) dailyError = 'AI 未返回当天容量建议。';
    } catch (error) { dailyError = error instanceof Error ? error.message : '容量建议无效。'; }
  }
  return { cues: results, failed, daily, dailyError };
}

/** At most two automatic follow-up attempts per content/evidence version. */
export function planCueRatingRetries(failedIds: string[], cues: StudyCue[], reviews: CueReview[], attempts: Map<string, number>) {
  const retry: string[] = [];
  const exhausted: string[] = [];
  for (const id of failedIds) {
    const cue = cues.find((item) => item.id === id);
    if (!cue) continue;
    const key = cueAnalysisKey(cue, reviews);
    const count = attempts.get(key) ?? 0;
    if (count < 2) { attempts.set(key, count + 1); retry.push(id); }
    else exhausted.push(id);
  }
  return { retry, exhausted };
}
