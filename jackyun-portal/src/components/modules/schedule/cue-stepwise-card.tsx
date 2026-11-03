'use client';

import type { ReactNode } from 'react';
import type { StudyCue } from '@/lib/learning/schedule-control';
import LatexRenderer from '../latex-renderer';

export function isCueStepwise(cue: StudyCue) {
  return cue.display === 'stepwise' || cue.display === 'steps';
}

export default function CueStepwiseCard({ cue, revealed, revealedStepCount, onReveal, onRevealNext, onRevealPrevious, evidence }: {
  cue: StudyCue;
  revealed: boolean;
  revealedStepCount: number;
  onReveal: () => void;
  onRevealNext: () => void;
  onRevealPrevious: () => void;
  evidence: ReactNode;
}) {
  const total = cue.markingPoints.length;
  const count = Math.min(revealedStepCount, total);
  const currentStep = count > 0 ? cue.markingPoints[count - 1] : undefined;

  return <section data-cue-stepwise className="my-auto mx-auto w-full max-w-5xl py-3 text-left">
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--card-border)] pb-3">
        <p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--brand)]">逐条回忆 · {count}/{total}</p>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-black/10 dark:bg-white/15" role="progressbar" aria-label="逐条背诵进度" aria-valuemin={0} aria-valuemax={total} aria-valuenow={count}><div className="h-full bg-[var(--brand)]" style={{ width: `${total ? count / total * 100 : 0}%` }} /></div>
      </header>
      <div className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.9fr)] md:items-start">
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-relaxed sm:text-2xl"><LatexRenderer content={cue.prompt} /></h2>
          {cue.subtitle && <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]"><LatexRenderer content={cue.subtitle} /></p>}
        </div>
        <div aria-live="polite" className="flex min-h-28 min-w-0 items-center rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4 sm:min-h-32 sm:p-5">
          {currentStep ? <div className="flex min-w-0 items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--brand)]/10 text-sm font-bold text-[var(--brand)]">{count}</span><div className="min-w-0 leading-7"><LatexRenderer content={currentStep} /></div></div> : <p className="text-sm text-[var(--muted-foreground)]">{total ? '先回忆第一条内容，再揭示核对。' : '这张卡还没有逐条内容，可在显示答案后查看完整答案。'}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--card-border)] pt-3">
        <button type="button" disabled={count === 0} onClick={onRevealPrevious} className="min-h-10 rounded-full border border-[var(--card-border)] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">← 退回上一条</button>
        {!revealed && count < total && <button type="button" onClick={onRevealNext} className="min-h-10 rounded-full bg-[var(--brand)] px-5 text-sm font-semibold text-white dark:text-[#202124]">揭示第 {count + 1} 条 →</button>}
        {!revealed && count === total && <button type="button" onClick={onReveal} className="min-h-10 rounded-full bg-[var(--brand)] px-5 text-sm font-semibold text-white dark:text-[#202124]">显示完整答案</button>}
        {revealed && <button type="button" onClick={onReveal} className="min-h-10 rounded-full border border-[var(--card-border)] px-4 text-sm font-semibold">收起完整答案</button>}
      </div>
      {revealed && <div data-cue-evidence className="mt-4 border-t border-[var(--card-border)] pt-4"><CueEvidenceContent evidence={evidence} /></div>}
    </article>
  </section>;
}

function CueEvidenceContent({ evidence }: { evidence: ReactNode }) {
  return <>{evidence}</>;
}
