'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordReviewAttempt, setReviewStatus } from '@/actions/review';
import type { ReviewItem } from '@/types/review';

const QUALITY_ACTIONS = [
  { quality: 1, label: '忘记了', color: '#d93025' },
  { quality: 3, label: '有点模糊', color: '#f9ab00' },
  { quality: 5, label: '记得很牢', color: '#188038' },
] as const;

export default function ReviewSession({ initialItems }: { initialItems: ReviewItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const startedAtRef = useRef<number | null>(null);
  const current = items[0];

  function markStarted() {
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
  }

  function advance() {
    startedAtRef.current = null;
    setAnswer('');
    setRevealed(false);
    setItems((existing) => existing.slice(1));
  }

  function finishCurrent(quality: number) {
    if (!current) return;
    setError(null);
    startTransition(async () => {
      try {
        await recordReviewAttempt(
          current.id,
          quality,
          answer,
          startedAtRef.current === null ? 0 : Math.floor((Date.now() - startedAtRef.current) / 1000),
        );
        advance();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '保存复习结果失败');
      }
    });
  }

  function archiveCurrent() {
    if (!current) return;
    startTransition(async () => {
      try {
        await setReviewStatus(current.id, 'archived');
        advance();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '归档失败');
      }
    });
  }

  if (!current) {
    return (
      <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] px-6 py-16 text-center shadow-[var(--surface-shadow)]">
        <span className="material-icons-round text-5xl text-[#34a853]">verified</span>
        <h2 className="mt-4 text-xl font-semibold">今天的复习完成了</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">新的错题会自动加入队列，到期后出现在这里。</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--surface-shadow)]">
      <div className="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-4 sm:px-7">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#1a73e8]">{current.subject}</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">剩余 {items.length} 题 · 连续答对 {current.streak} 次</p>
        </div>
        <button type="button" onClick={archiveCurrent} disabled={isPending} className="text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)]">暂不复习</button>
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
                  disabled={isPending}
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
    </div>
  );
}
