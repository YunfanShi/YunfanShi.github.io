'use client';

import type { CuePracticePolicy } from '@/lib/learning/cue-practice';

export default function CuePracticeControls({ automatic, policy, onAutomatic, onPolicy, compact = false }: {
  automatic: boolean; policy: CuePracticePolicy;
  compact?: boolean;
  onAutomatic: (value: boolean) => void; onPolicy: (value: CuePracticePolicy) => void;
}) {
  return <details data-cue-practice-settings className="relative text-xs">
    <summary aria-label="间隔重练设置" title={`间隔重练 · ${automatic ? '自动' : '手动'}`} className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-full border border-[var(--card-border)] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]"><span aria-hidden="true" className="material-icons-round text-lg">{compact ? 'repeat' : 'replay'}</span><span className="sr-only">间隔重练 · {automatic ? '自动' : '手动'}</span></summary>
    <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-xl">
      <label className="flex items-center justify-between gap-3"><span>自动进入间隔重练</span><input aria-label="自动进入间隔重练" type="checkbox" checked={automatic} onChange={event => onAutomatic(event.target.checked)} className="h-5 w-5 accent-[var(--brand)]" /></label>
      <p className="my-3 leading-5 text-[var(--muted-foreground)]">仅本次有效。关闭后仍保留提示和重练目录，可手动进入。</p>
      <label className="block">重练触发方式<select aria-label="重练触发方式" value={policy.trigger} onChange={event => onPolicy({ ...policy, trigger: event.target.value as CuePracticePolicy['trigger'] })} className="mt-1 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2"><option value="questions">按题数</option><option value="time">按时间</option></select></label>
      <label className="mt-3 block">{policy.trigger === 'questions' ? '间隔题数' : '间隔分钟'}<input aria-label={policy.trigger === 'questions' ? '间隔题数' : '间隔分钟'} type="number" min="1" max={policy.trigger === 'questions' ? 50 : 60} value={policy.trigger === 'questions' ? policy.questions : policy.minutes} onChange={event => { const value = Math.max(1, Math.min(policy.trigger === 'questions' ? 50 : 60, Math.round(Number(event.target.value) || 1))); onPolicy({ ...policy, [policy.trigger === 'questions' ? 'questions' : 'minutes']: value }); }} className="mt-1 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2" /></label>
      <p className="mt-3 leading-5 text-[var(--muted-foreground)]">修改后从现在重新计算待重练间隔；到期后切换下一题时插入，不打断当前作答。本轮全部评价后可直接手动重练。</p>
    </div>
  </details>;
}
