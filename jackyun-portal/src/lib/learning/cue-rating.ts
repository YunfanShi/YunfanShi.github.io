import { cueContentSignature, cueNeedsAiAnalysis } from './learning-assistance.ts';
import type { CueReview, StudyCue } from './schedule-control.ts';
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
  return prioritized.slice(0, 10);
}
