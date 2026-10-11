'use client';

import type { ReactNode } from 'react';
import type { StudyCue } from '@/lib/learning/schedule-control';
import LatexRenderer from '../latex-renderer';
import styles from './schedule-control.module.css';

/** Touch-first pages: selection precedes evidence for multiple-choice cues. */
export default function MobileCueCard({ cue, revealed, selectedChoice, onReveal, onChoice, evidence }: {
  cue: StudyCue;
  revealed: boolean;
  selectedChoice?: number;
  onReveal: () => void;
  onChoice: (index: number) => void;
  evidence: ReactNode;
}) {
  const multipleChoice = cue.type === 'multiple-choice' || cue.display === 'multiple-choice';
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
