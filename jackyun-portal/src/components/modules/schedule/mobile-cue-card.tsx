'use client';

import type { ReactNode } from 'react';
import type { StudyCue } from '@/lib/learning/schedule-control';
import LatexRenderer from '../latex-renderer';
import styles from './schedule-control.module.css';

/** Touch-first pages: selection precedes evidence for multiple-choice cues. */
export default function MobileCueCard({ cue, revealed, revealedStepCount = 0, selectedChoice, onReveal, onRevealStep, onChoice, evidence }: {
  cue: StudyCue;
  revealed: boolean;
  revealedStepCount?: number;
  selectedChoice?: number;
  onReveal: () => void;
  onRevealStep?: () => void;
  onChoice: (index: number) => void;
  evidence: ReactNode;
}) {
  const multipleChoice = cue.type === 'multiple-choice' || cue.display === 'multiple-choice';
  const stepwise = cue.display === 'stepwise' || ['knowledge-point', 'caution', 'condition-result'].includes(cue.type) || cue.type === 'process' && ['standard', 'steps'].includes(cue.display ?? 'standard');
  if (stepwise && !multipleChoice) {
    const count = Math.min(revealedStepCount, cue.markingPoints.length);
    return <section data-cue-stepwise className={styles.touchCard} aria-label="逐条背诵卡片"><article className={styles.touchAnswer}><p className={styles.touchPageLabel}>逐条回忆 · {count}/{cue.markingPoints.length}</p><div className={styles.touchAnswerTitle}><LatexRenderer content={cue.prompt} /></div>{cue.subtitle && <p className={styles.touchSubtitle}><LatexRenderer content={cue.subtitle} /></p>}<ol className="mt-4 space-y-3">{cue.markingPoints.map((point, index) => <li key={`${index}-${point}`} className="flex gap-3 rounded-xl border border-[var(--card-border)] p-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--brand)]/10 text-xs font-bold text-[var(--brand)]">{index + 1}</span><div className="min-w-0 flex-1">{index < count ? <><LatexRenderer content={point} /><label className="mt-2 flex items-center gap-2 text-xs text-[var(--muted-foreground)]"><input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" />我在揭示前想起来了</label></> : <span className="text-[var(--muted-foreground)]">先自己回忆这一条</span>}</div></li>)}</ol>{!revealed && count < cue.markingPoints.length && <button type="button" className={styles.touchBack} onClick={onRevealStep}>揭示第 {count + 1} 条</button>}{!revealed && count === cue.markingPoints.length && <button type="button" className={styles.touchBack} onClick={onReveal}>显示完整答案并开始整卡自评</button>}{revealed && <div className={styles.touchEvidence}>{evidence}</div>}</article></section>;
  }
  return <section className={styles.touchCard} aria-label="触屏学习卡片">
    {!revealed ? <>
      <button type="button" className={styles.touchPrompt} onClick={multipleChoice ? undefined : onReveal} disabled={multipleChoice} aria-label={multipleChoice ? '题目，请选择下方选项' : '翻到答案页'}>
        <span className={styles.touchPageLabel}>题目</span>
        <span className={styles.touchTitle}><LatexRenderer content={cue.prompt} /></span>
        {cue.subtitle && <span className={styles.touchSubtitle}><LatexRenderer content={cue.subtitle} /></span>}
        <span className={styles.touchHint}>{multipleChoice ? '点击下方选项作答' : '点击卡片查看答案 →'}</span>
      </button>
      {multipleChoice && <div className={styles.touchChoices}>{(cue.choices ?? []).map((choice, index) => <button key={index} type="button" onClick={() => onChoice(index)}><span>{index + 1}</span><LatexRenderer content={choice} /></button>)}</div>}
    </> : <article className={styles.touchAnswer}>
      <p className={styles.touchPageLabel}>答案与判分依据</p>
      <div className={styles.touchAnswerTitle}><LatexRenderer content={cue.prompt} /></div>
      {multipleChoice && <div className={styles.touchChoices}>
        <p role="status">{selectedChoice === undefined ? '已显示正确选项，请核对自评' : selectedChoice === cue.correctChoice ? '选择正确' : '选择错误；正确选项已标出'}</p>
        {(cue.choices ?? []).map((choice, index) => <div key={index} data-correct={index === cue.correctChoice} data-selected={index === selectedChoice}><strong>{index === cue.correctChoice ? '√' : index === selectedChoice ? '○' : index + 1}</strong><LatexRenderer content={choice} /></div>)}
      </div>}
      <div className={styles.touchEvidence}>{evidence}</div>
      <button type="button" className={styles.touchBack} onClick={onReveal}>← 翻回题目页</button>
    </article>}
  </section>;
}
