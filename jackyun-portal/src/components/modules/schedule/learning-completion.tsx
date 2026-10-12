'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { cueEntryHref } from '@/lib/learning/cue-dashboard';

export interface LearningCompletionData { cues: number; questions: number; stable: number; partial: number; unclear: number; remaining: number; nextDate: string | null }
export default function LearningCompletion({ result, onClose }: { result: LearningCompletionData; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key === 'Tab') {
        const buttons = panel.current?.querySelectorAll<HTMLElement>('a,button');
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="fixed inset-0 z-[160] flex items-center justify-center bg-[var(--background)]/95 p-4"><section ref={panel} role="dialog" aria-modal="true" aria-label="本次学习完成" className="w-full max-w-lg space-y-4 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6">
    <h2 className="text-2xl font-semibold">本次学习已保存</h2><p>CUE {result.cues} 条 · 题目 {result.questions} 题</p>
    <p>√ 稳定 {result.stable} · △ 部分 {result.partial} · ○ 未掌握 {result.unclear}</p><p className="text-sm text-[var(--muted-foreground)]">以上为本次自评，不等同于客观正确率。</p>
    <p>今日剩余待学 CUE {result.remaining} 条</p><p>下次 CUE 复习：{result.nextDate || '当前无已安排内容'}</p>
    <div className="flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center rounded-xl border border-[var(--card-border)] px-4" href={cueEntryHref()} onClick={onClose}>继续下一组</Link><Link className="inline-flex min-h-11 items-center rounded-xl border border-[var(--card-border)] px-4" href="/dashboard" onClick={onClose}>返回首页</Link><button autoFocus className="min-h-11 px-4 underline" onClick={onClose}>留在学习页</button></div>
  </section></div>, document.body);
}
