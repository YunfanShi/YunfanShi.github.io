'use client';

import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { StudyCue } from '@/lib/learning/schedule-control';
import { bufferedCueAnswer, cueAnswerInput, isCueAnswerShortcut, type CueAnswerCard } from '@/lib/learning/cue-answer-card';
import LatexRenderer from '../latex-renderer';
import styles from './schedule-control.module.css';

export default function CueAnswerCardPanel({ cue, card, previousCards, legacyMemo, inputRef, onText, onCompare, onCheck, onClose }: {
  cue: StudyCue; card?: CueAnswerCard; previousCards: CueAnswerCard[]; legacyMemo?: string; inputRef: RefObject<HTMLTextAreaElement | null>;
  onText: (text: string) => void; onCompare: () => void; onCheck: (index: number, checked: boolean) => void; onClose: () => void;
}) {
  const [buffer] = useState(() => bufferedCueAnswer(onText));
  useEffect(() => { buffer.setSave(onText); }, [buffer, onText]);
  const [text, setText] = useState(card?.text ?? '');
  useEffect(() => { if (!buffer.pending) queueMicrotask(() => setText(card?.text ?? '')); }, [buffer, card?.text]);
  const prompt = useMemo(() => <LatexRenderer content={cue.prompt} />, [cue.prompt]);
  const close = () => { buffer.flush(); onClose(); };
  useEffect(() => {
    const flush = () => buffer.flush();
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [buffer]);
  const [compositionText, setCompositionText] = useState<string | null>(null);
  const acceptInput = (value: string, inserted?: string | null) => {
    const result = cueAnswerInput(compositionText ?? text, value, inserted);
    if (result.close) close();
    else { setText(result.text); buffer.write(result.text); }
  };
  const comparison = text.trim() && text === card?.text ? card.comparison : undefined;
  return <aside className={styles.answerCard} aria-label="CUE 答题卡" onKeyDown={(event) => {
    if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isCueAnswerShortcut(event.key) || event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) close();
    }
  }}>
    <header className="flex items-start gap-3 border-b border-[var(--card-border)] p-4"><span className="material-icons-round text-[var(--brand)]">edit_note</span><div className="min-w-0 flex-1"><h2 className="font-semibold">CUE 答题卡</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">自动保存 · 按 ～ / · 收起</p></div><button aria-label="关闭答题卡" className="h-11 w-11 shrink-0 rounded-xl border border-[var(--card-border)]" onClick={close}>×</button></header>
    <div className="space-y-4 overflow-y-auto p-4"><p className="text-sm font-semibold">{prompt}</p><label className="block text-sm">我的作答<textarea ref={inputRef} aria-label="CUE 我的作答" rows={4} maxLength={10_000} className={styles.answerInput} value={compositionText ?? text} onCompositionStart={() => setCompositionText(text)} onCompositionEnd={(event) => { setCompositionText(null); acceptInput(event.currentTarget.value, event.data); }} onBlur={() => buffer.flush()} onChange={(event) => {
        if (compositionText !== null || (event.nativeEvent as InputEvent).isComposing) setCompositionText(event.target.value);
        else acceptInput(event.target.value, (event.nativeEvent as InputEvent).data);
      }} placeholder="先独立回忆，再写下答案或解题过程。支持 LaTeX。" /></label>
      <div className="flex flex-wrap items-center gap-2"><button disabled={!text.trim()} onClick={() => { buffer.flush(); onCompare(); }} className="min-h-11 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-40">{comparison ? '重新对照答案' : '写完了，对照答案'}</button><span className="text-xs text-[var(--muted-foreground)]">{text ? `${text.length} 字符 · ${buffer.pending ? '正在保存' : '已保存'}` : '空白时不比较'}</span></div>
      {comparison && <section className={styles.answerComparison} aria-label="作答对照"><p className="text-xs text-[var(--muted-foreground)]">自主对照 · 不自动判分，掌握状态仍由你选择{comparison.version !== (cue.version ?? 1) ? ` · 参考内容为提交时 v${comparison.version}，可重新对照最新版本` : ''}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="min-w-0 rounded-xl border border-[var(--card-border)] p-3"><h3 className="mb-2 text-sm font-semibold">我的答案</h3><LatexRenderer content={card!.text} /></div><div className="min-w-0 rounded-xl border border-[var(--card-border)] p-3"><h3 className="mb-2 text-sm font-semibold">参考答案</h3><LatexRenderer content={comparison.answer || '未提供参考答案，请对照评分点。'} /></div></div>{comparison.markingPoints.length > 0 && <fieldset className="mt-4 space-y-2"><legend className="text-sm font-semibold">评分点自查 · {comparison.checkedPoints.length} / {comparison.markingPoints.length}</legend><p className="text-xs text-[var(--muted-foreground)]">勾选我的答案已覆盖的要点；不等同于系统评分。</p>{comparison.markingPoints.map((point, index) => <label key={index} className="flex min-h-11 items-start gap-3 rounded-xl border border-[var(--card-border)] p-3"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={comparison.checkedPoints.includes(index)} onChange={(event) => onCheck(index, event.target.checked)} /><span className="min-w-0 text-sm"><LatexRenderer content={point} /></span></label>)}</fieldset>}</section>}
      {previousCards.length > 0 && <details className="rounded-xl border border-[var(--card-border)] p-3 text-sm"><summary className="cursor-pointer">之前的作答（最近 {previousCards.length} 次）</summary>{previousCards.map((previous) => <div key={previous.id} className="mt-3 border-t border-[var(--card-border)] pt-3"><time className="text-xs text-[var(--muted-foreground)]">{new Date(previous.updatedAt).toLocaleString()}</time><LatexRenderer content={previous.text} /></div>)}</details>}
      {legacyMemo && <details className="rounded-xl border border-[var(--card-border)] p-3 text-sm"><summary className="cursor-pointer">以前的备忘录（保留）</summary><div className="mt-3 whitespace-pre-wrap break-words"><LatexRenderer content={legacyMemo} /></div></details>}
    </div>
  </aside>;
}
