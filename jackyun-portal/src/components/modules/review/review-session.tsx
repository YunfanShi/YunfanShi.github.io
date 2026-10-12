'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { runOfflineMutation, saveOfflineSnapshot, readOfflineSnapshot, listOfflineMutations } from '@/lib/offline/workspace';
import { fetchSyncWithTimeout } from '@/lib/request-timeout';
import { dateKey } from '@/lib/learning/timezone';
import { advanceReviewSnapshot, reviewCompletion } from '@/lib/learning/review-queue';
import type { ReviewSnapshot } from '@/types/review';

const QUALITY_ACTIONS = [
  { quality: 1, label: '忘记了', color: '#d93025' },
  { quality: 3, label: '有点模糊', color: '#f9ab00' },
  { quality: 5, label: '记得很牢', color: '#188038' },
] as const;

export default function ReviewSession({ userId, initialSnapshot }: { userId: string; initialSnapshot: ReviewSnapshot }) {
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ReviewSnapshot>(initialSnapshot);
  const [cacheReady, setCacheReady] = useState(false);
  const operationInFlight = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const accept = (value: ReviewSnapshot) => setSnapshot({ ...value, dueCount: value.dueCount ?? null });
    void Promise.all([readOfflineSnapshot<ReviewSnapshot>(userId, 'review'), listOfflineMutations(userId)]).then(([cached, pending]) => {
      if (cancelled) return;
      const queued = pending.some(item => item.kind.startsWith('review.'));
      if (cached && (!navigator.onLine || queued)) accept({ ...cached, verifiedAt: navigator.onLine ? cached.verifiedAt : undefined, pendingLocal: queued || cached.pendingLocal });
      else if (!queued && navigator.onLine) void saveOfflineSnapshot(userId, 'review', initialSnapshot);
      else if (queued) accept({ ...initialSnapshot, dueItems: initialSnapshot.dueItems.filter(item => !pending.some(op => op.payload.reviewItemId === item.id)), pendingLocal: true, verifiedAt: undefined });
      else if (!navigator.onLine) accept({ ...initialSnapshot, verifiedAt: undefined });
      setCacheReady(true);
    }).catch(() => { if (!cancelled) { setError('本机复习缓存读取失败，请保留页面并重试。'); } });
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; scope: string; value: ReviewSnapshot }>).detail;
      if (detail.scope === 'review' && (!detail.userId || detail.userId === userId)) accept(detail.value);
    };
    const offline = () => setSnapshot(current => ({ ...current, verifiedAt: undefined }));
    const timer = window.setInterval(() => setSnapshot(current => current.verifiedAt && dateKey(new Date(current.verifiedAt), 'Asia/Shanghai') !== dateKey(new Date(), 'Asia/Shanghai') ? { ...current, verifiedAt: undefined } : current), 60_000);
    window.addEventListener('offline', offline);
    window.addEventListener('jackyun-offline-snapshot', update);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('offline', offline); window.removeEventListener('jackyun-offline-snapshot', update); };
  }, [userId, initialSnapshot]);
  const items = snapshot.dueItems;
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const startedAtRef = useRef<number | null>(null);
  const current = items[0];

  function markStarted() {
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
  }

  async function advance(quality: number | null, queued: boolean) {
    const next = advanceReviewSnapshot(snapshot, current, quality, queued);
    await saveOfflineSnapshot(userId, 'review', next);
    setSnapshot(next);
    startedAtRef.current = null; setAnswer(''); setRevealed(false);
  }

  function finishCurrent(quality: number) {
    if (!current || operationInFlight.current || !cacheReady) return;
    operationInFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await runOfflineMutation(userId, 'review.attempt', {
          reviewItemId: current.id, quality, answer,
          durationSeconds: startedAtRef.current === null ? 0 : Math.floor((Date.now() - startedAtRef.current) / 1000),
        });
        await advance(quality, result === 'queued');
        if (result === 'queued') setError('本机已记录，待同步');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '保存复习结果失败');
      } finally { operationInFlight.current = false; }
    });
  }

  function archiveCurrent() {
    if (!current || operationInFlight.current || !cacheReady) return;
    operationInFlight.current = true;
    startTransition(async () => {
      try {
        const result = await runOfflineMutation(userId, 'review.archive', { reviewItemId: current.id });
        await advance(null, result === 'queued');
        if (result === 'queued') setError('本机已记录，待同步');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '归档失败');
      } finally { operationInFlight.current = false; }
    });
  }

  async function loadNext() {
    if (operationInFlight.current) return;
    operationInFlight.current = true; setError(null);
    startTransition(async () => {
      try {
        const pending = await listOfflineMutations(userId);
        if (!navigator.onLine || pending.some(item => item.kind.startsWith('review.'))) throw new Error('本机已记录，待同步；联网并完成上传后可复核剩余复习。');
        const response = await fetchSyncWithTimeout('/api/review/queue', { cache: 'no-store' });
        if (!response.ok) throw new Error('下一批复习读取失败，请重试。');
        const next = await response.json() as ReviewSnapshot;
        if (!Array.isArray(next.dueItems) || typeof next.dueCount !== 'number') throw new Error('复习数据不完整，请重试。');
        await saveOfflineSnapshot(userId, 'review', next); setSnapshot(next);
      } catch (cause) { setError(cause instanceof Error ? cause.message : '复核失败，请重试。'); }
      finally { operationInFlight.current = false; }
    });
  }
  const cards = <section className="my-6 grid grid-cols-3 gap-3" aria-label="复习统计">{[['今日到期', snapshot.dueCount ?? '待复核'], ['学习中', snapshot.activeCount], ['已掌握', snapshot.masteredCount]].map(([label, count]) => <div key={label} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4"><p className="text-xs text-[var(--muted-foreground)]">{label}</p><strong className="mt-2 block text-2xl">{count}</strong></div>)}</section>;
  const completion = reviewCompletion(snapshot);
  if (!current) return <>{cards}<div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] px-6 py-12 text-center">
    <h2 className="text-xl font-semibold">{completion === 'complete' ? '今天的复习完成了' : '本批复习完成了'}</h2>
    <p className="mt-2 text-sm">{snapshot.pendingLocal ? '本机已记录，待同步。' : completion === 'more' ? `还有 ${snapshot.dueCount ?? '待复核'} 题等待复习。` : completion === 'complete' ? '已联网确认当前没有到期错题。' : '请联网复核剩余内容，当前结果尚未确认全部完成。'}</p>
    {completion !== 'complete' && <button type="button" disabled={isPending || !cacheReady} onClick={() => void loadNext()} className="mt-4 min-h-11 rounded-xl border border-[var(--card-border)] px-4">{isPending ? '正在读取…' : completion === 'more' ? '加载下一批' : '复核剩余复习'}</button>}
    {error && <p role="alert" className="mt-3">{error}</p>}
  </div></>;

  return (
    <>{cards}<div className="overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--surface-shadow)]">
      <div className="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-4 sm:px-7">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#1a73e8]">{current.subject}</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">本批剩余 {items.length} 题 · 连续答对 {current.streak} 次</p>
        </div>
        <button type="button" onClick={archiveCurrent} disabled={isPending || !cacheReady} className="text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)]">暂不复习</button>
      </div>

      <div className="space-y-5 p-5 sm:p-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">题目</p>
          <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-[var(--foreground)]">{current.question_text}</p>
          {current.options?.length ? (
            <ul className="mt-4 grid gap-2">
              {current.options.map((option) => (
                <li key={option.label} className="rounded-xl bg-[var(--background)] px-4 py-3 text-sm"><strong>{option.label}.</strong> {option.text}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-[var(--muted-foreground)]">重新作答</span>
          <textarea
            value={answer}
            onChange={(event) => { markStarted(); setAnswer(event.target.value); }}
            rows={4}
            placeholder="先写出你的答案，再查看解析"
            className="mt-2 w-full resize-y rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm outline-none focus:border-[#1a73e8]"
          />
        </label>

        {!revealed ? (
          <button type="button" onClick={() => { markStarted(); setRevealed(true); }} className="w-full rounded-xl border border-[#1a73e8] py-3 text-sm font-semibold text-[#1a73e8]">查看答案并自评</button>
        ) : (
          <div className="space-y-4 rounded-2xl bg-[var(--background)] p-4">
            <div><p className="text-xs font-semibold text-[#188038]">参考答案</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{current.correct_answer}</p></div>
            {current.explanation && <div><p className="text-xs font-semibold text-[var(--muted-foreground)]">解析</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{current.explanation}</p></div>}
            <div className="grid gap-2 sm:grid-cols-3">
              {QUALITY_ACTIONS.map((action) => (
                <button
                  key={action.quality}
                  type="button"
                  disabled={isPending || !cacheReady}
                  onClick={() => finishCurrent(action.quality)}
                  className="rounded-xl border px-3 py-3 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: action.color, color: action.color }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <p className="text-sm text-[#d93025]">{error}</p>}
      </div>
    </div></>
  );
}
