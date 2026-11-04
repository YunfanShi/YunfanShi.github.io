'use client';

import { difficultyFactors, difficultyLabels, effectiveCueDifficulty, type CueDifficulty } from '@/lib/learning/learning-assistance';
import { cueContentSignature } from '@/lib/learning/learning-assistance';
import type { CueReview, StudyCue } from '@/lib/learning/schedule-control';
import { studyInputClass } from './study-ui';

export default function CueDifficultyPicker({ cue, reviews = [], onChange, compact = true }: {
  cue: StudyCue;
  reviews?: CueReview[];
  onChange?: (difficulty?: CueDifficulty) => void;
  compact?: boolean;
}) {
  const validAi = cue.aiAdvice?.signature === cueContentSignature(cue);
  const effective = effectiveCueDifficulty(cue, reviews);
  const content = <div className="space-y-2 rounded-xl border border-[var(--card-border)] p-3 text-sm">
    <p>系统采用：{difficultyLabels[effective]} · 间隔系数 ×{difficultyFactors[effective].toFixed(2)}</p>
    {onChange && <label className="block">我的评级<select aria-label="修改 CUE 难度" className={studyInputClass} value={cue.userDifficulty ?? ''} onChange={(event) => onChange((event.target.value || undefined) as CueDifficulty | undefined)}><option value="">跟随 AI / 系统</option>{Object.entries(difficultyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
    <p className="text-xs text-[var(--muted-foreground)]">{validAi ? `AI 基础评级：${difficultyLabels[cue.aiAdvice!.difficulty]}。${cue.aiAdvice!.reason}` : '等待后台自动分析；暂用中等或你的评级。'}{cue.userDifficulty ? ` 你的基础评级：${difficultyLabels[cue.userDifficulty]}。` : ''}系统结合实际 √ / △ / ○ 调整；反复失误提高难度，未掌握项优先修复，稳定项按系数延长或缩短间隔，最长 18 天。</p>
    {validAi && <p className="text-xs text-[var(--muted-foreground)]">分析时间：{new Date(cue.aiAdvice!.generatedAt).toLocaleString()}</p>}
    {validAi && cue.aiAdvice?.classificationNote && <p className="text-xs text-[var(--muted-foreground)]">{cue.aiAdvice.classificationNote}</p>}
    {validAi && cue.aiAdvice?.qualityIssue && <p className="text-xs text-amber-700 dark:text-amber-200">提示质量：{cue.aiAdvice.qualityIssue}</p>}
  </div>;
  return compact ? <details className="text-sm"><summary className="cursor-pointer text-[var(--muted-foreground)]">CUE 信息 · {difficultyLabels[effective]} · 系数 ×{difficultyFactors[effective].toFixed(2)}</summary><div className="mt-2">{content}</div></details> : content;
}
