'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { StudyCue } from '@/lib/learning/schedule-control';
import { cueAnswerInput, isCueAnswerShortcut, type CueAnswerCard } from '@/lib/learning/cue-answer-card';
import { checkpointCueAnswerDraft, CUE_ANSWER_DRAFT_HISTORY_DELAY, moveCueAnswerDraftHistory, readCueAnswerDraftHistory, writeCueAnswerDraftHistory, type CueAnswerDraftHistory } from '@/lib/learning/cue-answer-draft-history';
import LatexRenderer from '../latex-renderer';
import styles from './schedule-control.module.css';
import { callAiApi } from '@/lib/ai-config';
import { parseAiJson, readAiResponseContent } from '@/lib/ai-json';
import { localCueSelfCheck, sharedCueSpans, cueSelfCheckMessages, parseCueSelfCheck, type CueSelfCheck } from '@/lib/learning/cue-self-check';

function SharedText({ text, other }: { text: string; other: string }) {
  return <p className="whitespace-pre-wrap break-words text-sm">{sharedCueSpans(text, other).map((span, index) => span.matched ? <mark key={index} className="rounded bg-amber-200 text-black dark:bg-amber-300">{span.text}</mark> : <span key={index}>{span.text}</span>)}</p>;
}

export default function CueAnswerCardPanel({ sessionId, cue, card, previousCards, legacyMemo, inputRef, onCompare, onCheck, onClose }: {
  sessionId: string; cue: StudyCue; card?: CueAnswerCard; previousCards: CueAnswerCard[]; legacyMemo?: string; inputRef: RefObject<HTMLTextAreaElement | null>;
  onCompare: (text: string) => void; onCheck: (index: number, checked: boolean) => void; onClose: () => void;
}) {
  const [text, setText] = useState(card?.text ?? '');
  const [history, setHistory] = useState<CueAnswerDraftHistory>(() => ({ text: card?.text ?? '', versions: [{ text: card?.text ?? '', savedAt: '' }], activeIndex: 0 }));
  const [savedLocally, setSavedLocally] = useState(true);
  const historyRef = useRef(history);
  const checkpointTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);
  const updateHistory = useCallback((next: CueAnswerDraftHistory, persist = true) => {
    historyRef.current = next;
    setHistory(next);
    if (persist) setSavedLocally(writeCueAnswerDraftHistory(sessionId, cue.id, next));
  }, [sessionId, cue.id]);
  const checkpoint = useCallback(() => {
    if (checkpointTimer.current) clearTimeout(checkpointTimer.current);
    checkpointTimer.current = null;
    updateHistory(checkpointCueAnswerDraft(historyRef.current, new Date().toISOString()));
  }, [updateHistory]);
  const saveDraft = useCallback((value: string) => {
    const branch = historyRef.current.versions.slice(0, historyRef.current.activeIndex + 1);
    const next = { ...historyRef.current, text: value.slice(0, 10_000), versions: branch, activeIndex: branch.length - 1 };
    updateHistory(next);
    setText(next.text);
    if (checkpointTimer.current) clearTimeout(checkpointTimer.current);
    checkpointTimer.current = setTimeout(() => {
      checkpointTimer.current = null;
      updateHistory(checkpointCueAnswerDraft(historyRef.current, new Date().toISOString()));
    }, CUE_ANSWER_DRAFT_HISTORY_DELAY);
  }, [updateHistory]);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const restored = readCueAnswerDraftHistory(sessionId, cue.id, card?.text ?? '');
    updateHistory(restored, false);
    setText(restored.text);
  }, [sessionId, cue.id, card?.text, updateHistory]);
  const prompt = useMemo(() => <LatexRenderer content={cue.prompt} />, [cue.prompt]);
  const close = () => { checkpoint(); onClose(); };
  useEffect(() => {
    const flush = () => checkpoint();
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); if (checkpointTimer.current) clearTimeout(checkpointTimer.current); };
  }, [checkpoint]);
  const [compositionText, setCompositionText] = useState<string | null>(null);
  const acceptInput = (value: string, inserted?: string | null) => {
    const result = cueAnswerInput(compositionText ?? text, value, inserted);
    if (result.close) close();
    else saveDraft(result.text);
  };
  const comparison = text.trim() && text === card?.text ? card.comparison : undefined;
  const local = useMemo(() => comparison ? localCueSelfCheck(text, comparison.answer, comparison.markingPoints) : null, [text, comparison]);
  const [ai, setAi] = useState<{ key: string; result: CueSelfCheck } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const contextKey = JSON.stringify([card?.id, text, comparison?.at, cue.version, cue.answer, cue.markingPoints]);
  const latest = useRef(contextKey);
  useEffect(() => { latest.current = contextKey; request.current?.abort(); request.current = null; }, [contextKey]);
  useEffect(() => () => { latest.current = ''; request.current?.abort(); }, []);
  const apply = (result: CueSelfCheck) => {
    result.points.filter(point => point.covered && !comparison?.checkedPoints.includes(point.index)).forEach(point => onCheck(point.index, true));
  };
  const assist = async () => {
    if (!comparison || !local || request.current) return;
    const key = contextKey, controller = new AbortController();
    request.current = controller; setBusy(true); setError('');
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await callAiApi(cueSelfCheckMessages(text, comparison.prompt, comparison.answer, comparison.markingPoints), { stream: false, temperature: 0.1, maxTokens: 3000, signal: controller.signal });
      const content = await readAiResponseContent(response);
      const result = parseCueSelfCheck(parseAiJson(content), text, comparison.markingPoints.length);
      if (controller.signal.aborted || latest.current !== key) return;
      if (!comparison.answer.trim()) result.similarity = null;
      setAi({ key, result }); apply(result);
    } catch (cause) {
      if (latest.current === key) setError(controller.signal.aborted ? 'AI 自查已取消或超时，可重试；本地对比仍可使用。' : cause instanceof Error ? cause.message : 'AI 自查失败，请重试。');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) request.current = null;
      setBusy(false);
    }
  };
  const aiResult = ai?.key === contextKey ? ai.result : null;
  const report = aiResult ?? local;
  return <aside className={styles.answerCard} aria-label="CUE 答题卡" onKeyDown={(event) => {
    if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isCueAnswerShortcut(event.key) || event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) close();
    }
  }}>
    <header className="flex items-start gap-3 border-b border-[var(--card-border)] p-4"><span className="material-icons-round text-[var(--brand)]">edit_note</span><div className="min-w-0 flex-1"><h2 className="font-semibold">CUE 答题卡</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">草稿仅保存在本机 · 最多 5 个版本 · 按 ～ / · 收起</p></div><button aria-label="关闭答题卡" className="h-11 w-11 shrink-0 rounded-xl border border-[var(--card-border)]" onClick={close}>×</button></header>
    <div className="space-y-4 overflow-y-auto p-4"><p className="text-sm font-semibold">{prompt}</p><label className="block text-sm">我的作答<textarea ref={inputRef} aria-label="CUE 我的作答" rows={4} maxLength={10_000} className={styles.answerInput} value={compositionText ?? text} onCompositionStart={() => setCompositionText(text)} onCompositionEnd={(event) => { setCompositionText(null); acceptInput(event.currentTarget.value, event.data); }} onBlur={checkpoint} onChange={(event) => {
        if (compositionText !== null || (event.nativeEvent as InputEvent).isComposing) { setCompositionText(event.target.value); saveDraft(event.target.value); }
        else acceptInput(event.target.value, (event.nativeEvent as InputEvent).data);
      }} placeholder="先独立回忆，再写下答案或解题过程。支持 LaTeX。" /></label>
      <div className="flex flex-wrap items-center gap-2"><button type="button" aria-label="恢复较旧版本" title="恢复较旧版本" disabled={history.activeIndex <= 0} onClick={() => { if (checkpointTimer.current) clearTimeout(checkpointTimer.current); checkpointTimer.current = null; const next = moveCueAnswerDraftHistory(historyRef.current, -1); updateHistory(next); setText(next.text); }} className="min-h-11 rounded-xl border border-[var(--card-border)] px-3 text-sm disabled:opacity-40">较旧版本</button><button type="button" aria-label="恢复较新版本" title="恢复较新版本" disabled={history.activeIndex >= history.versions.length - 1} onClick={() => { if (checkpointTimer.current) clearTimeout(checkpointTimer.current); checkpointTimer.current = null; const next = moveCueAnswerDraftHistory(historyRef.current, 1); updateHistory(next); setText(next.text); }} className="min-h-11 rounded-xl border border-[var(--card-border)] px-3 text-sm disabled:opacity-40">较新版本</button><span className="text-xs text-[var(--muted-foreground)]">本机版本 {history.activeIndex + 1}/{history.versions.length}</span><button disabled={!text.trim()} onClick={() => { checkpoint(); onCompare(text); }} className="min-h-11 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-40">{comparison ? '重新对照答案' : '写完了，对照答案'}</button><span className="text-xs text-[var(--muted-foreground)]">{text ? `${text.length} 字符 · ${savedLocally ? '本机已保存' : '本机保存失败'}` : '空白时不比较'}</span></div>
      {comparison && <section className={styles.answerComparison} aria-label="作答对照">
        <p className="text-xs text-[var(--muted-foreground)]">本地已自动对比 · 可调整 MS · 掌握状态仍由你选择{comparison.version !== (cue.version ?? 1) ? ` · 参考内容为提交时 v${comparison.version}，可重新对照最新版本` : ''}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="min-h-11 rounded-xl border border-[var(--card-border)] px-4 text-sm disabled:opacity-40" disabled={!local || busy} onClick={() => { if (local) { setAi(null); setError(''); apply(local); } }}>重新本地检查 MS</button>
          <button className="min-h-11 rounded-xl bg-[var(--brand)] px-4 text-sm text-white disabled:opacity-40" disabled={!local || busy || compositionText !== null} onClick={assist}>{busy ? 'AI 正在自查…' : 'AI 辅助自查并勾选 MS'}</button>
          {busy && <button className="min-h-11 rounded-xl border border-[var(--card-border)] px-4 text-sm" onClick={() => request.current?.abort()}>取消</button>}
        </div>
        {!local && <p className="mt-2 text-xs text-[var(--muted-foreground)]">没有参考答案和 MS，已跳过对比。</p>}
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        {report && <div role="status" className="mt-3 space-y-2 rounded-xl border border-[var(--card-border)] p-3 text-sm">
          <p className="font-semibold">{aiResult ? 'AI 辅助评价' : '本地文本对比'} · {report.similarity === null ? '未提供参考答案' : `相似度 ${report.similarity}%`}</p>
          <p className="whitespace-pre-wrap break-words">{report.summary}</p><p className="text-xs text-[var(--muted-foreground)]">相似度不是得分；自动勾选仅补充覆盖项，保留已有勾选，可手动调整。</p>
        </div>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-[var(--card-border)] p-3"><h3 className="mb-2 text-sm font-semibold">我的答案</h3><LatexRenderer content={card!.text} /></div>
          <div className="min-w-0 rounded-xl border border-[var(--card-border)] p-3"><h3 className="mb-2 text-sm font-semibold">参考答案</h3><LatexRenderer content={comparison.answer || '未提供参考答案，请对照评分点。'} /></div>
        </div>
        {local && <details className="mt-3 rounded-xl border border-[var(--card-border)] p-3" open><summary className="cursor-pointer text-sm font-semibold">相同文本高亮 · 原始文本</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="min-w-0"><p className="mb-2 text-xs">我的答案</p><SharedText text={text} other={[comparison.answer, ...comparison.markingPoints].join('\n')} /></div><div className="min-w-0"><p className="mb-2 text-xs">参考答案与 MS</p><SharedText text={[comparison.answer, ...comparison.markingPoints].filter(Boolean).join('\n')} other={text} /></div></div></details>}
        {comparison.markingPoints.length > 0 && <fieldset className="mt-4 space-y-2"><legend className="text-sm font-semibold">评分点自查 MS · {comparison.checkedPoints.length} / {comparison.markingPoints.length}</legend><p className="text-xs text-[var(--muted-foreground)]">勾选我的答案已覆盖的要点；辅助结果需自行核对。</p>{comparison.markingPoints.map((point, index) => <label key={index} className="flex min-h-11 items-start gap-3 rounded-xl border border-[var(--card-border)] p-3"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" disabled={busy} checked={comparison.checkedPoints.includes(index)} onChange={(event) => onCheck(index, event.target.checked)} /><span className="min-w-0 text-sm"><LatexRenderer content={point} />{report?.points[index] && <span className="mt-2 block text-xs text-[var(--muted-foreground)]">{report.points[index].similarity}% · {report.points[index].reason}{report.points[index].evidence && ` 依据：${report.points[index].evidence}`}</span>}</span></label>)}</fieldset>}
      </section>}
      {previousCards.length > 0 && <details className="rounded-xl border border-[var(--card-border)] p-3 text-sm"><summary className="cursor-pointer">之前的作答（最近 {previousCards.length} 次）</summary>{previousCards.map((previous) => <div key={previous.id} className="mt-3 border-t border-[var(--card-border)] pt-3"><time className="text-xs text-[var(--muted-foreground)]">{new Date(previous.updatedAt).toLocaleString()}</time><LatexRenderer content={previous.text} /></div>)}</details>}
      {legacyMemo && <details className="rounded-xl border border-[var(--card-border)] p-3 text-sm"><summary className="cursor-pointer">以前的备忘录（保留）</summary><div className="mt-3 whitespace-pre-wrap break-words"><LatexRenderer content={legacyMemo} /></div></details>}
    </div>
  </aside>;
}
