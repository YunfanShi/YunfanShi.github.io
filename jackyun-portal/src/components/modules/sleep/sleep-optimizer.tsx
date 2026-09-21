'use client';

import { useMemo, useState } from 'react';
import { calculateSleepPlans, type SleepPlan } from '@/lib/sleep-calculator';

const PLAN_DETAILS: Record<number, { label: string; note: string; tone: string; badge: string }> = {
  6: {
    label: '恢复优先',
    note: '9 小时睡眠；最近缺觉或第二天任务很重时优先考虑。',
    tone: 'border-[#a8c7fa] bg-[#edf4ff] dark:border-[#31598a] dark:bg-[#10243e]',
    badge: '充足',
  },
  5: {
    label: '均衡首选',
    note: '7 小时 30 分睡眠；兼顾睡眠时长与多数人的日常安排。',
    tone: 'border-[#8ab4f8] bg-[#e8f0fe] shadow-[0_12px_30px_rgba(26,115,232,.12)] dark:border-[#8ab4f8] dark:bg-[#12233d]',
    badge: '推荐',
  },
  4: {
    label: '时间紧张',
    note: '6 小时睡眠；仅作为偶尔的备选，不建议长期使用。',
    tone: 'border-[#fdd663] bg-[#fef7e0] dark:border-[#8d6f1f] dark:bg-[#30270d]',
    badge: '备选',
  },
};

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

function PlanCard({ plan }: { plan: SleepPlan }) {
  const detail = PLAN_DETAILS[plan.cycles];
  return (
    <article className={`relative rounded-2xl border p-5 transition-transform duration-200 hover:-translate-y-0.5 ${detail.tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--muted-foreground)]">{detail.label}</p>
          <p className="mt-2 font-mono text-4xl font-semibold tracking-[-0.06em] text-[var(--foreground)]">{plan.bedtime}</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">上床 · 预计 {plan.asleepAt} 入睡</p>
        </div>
        <span className="rounded-full bg-white/75 px-2.5 py-1 text-xs font-semibold text-[#174ea6] dark:bg-white/10 dark:text-[#aecbfa]">{detail.badge}</span>
      </div>
      <div className="mt-5 border-t border-black/10 pt-4 dark:border-white/10">
        <p className="text-sm font-medium text-[var(--foreground)]">{plan.cycles} 个周期 · {durationLabel(plan.sleepMinutes)}</p>
        <p className="mt-1.5 text-sm leading-6 text-[var(--muted-foreground)]">{detail.note}</p>
      </div>
    </article>
  );
}

export default function SleepOptimizer() {
  const [wakeTime, setWakeTime] = useState('07:00');
  const [latency, setLatency] = useState(15);
  const plans = useMemo(() => calculateSleepPlans(wakeTime, latency), [wakeTime, latency]);
  const balancedPlan = plans.find((plan) => plan.cycles === 5) ?? plans[0];

  return (
    <div className="page-enter mx-auto max-w-[1180px]">
      <header className="mb-6 flex flex-col gap-3 sm:mb-8">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#1a73e8] dark:text-[#8ab4f8]">
          <span className="material-icons-round text-base" aria-hidden="true">bedtime</span>
          Sleep Optimizer
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.045em] text-[var(--foreground)] sm:text-4xl">反推今晚几点上床</h1>
        <p className="max-w-2xl text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">从明天的起床时间往回算，把你的入睡耗时也算进去。先保证睡够，再用睡眠周期做时间参考。</p>
      </header>

      <section className="overflow-hidden rounded-3xl border border-[#31598a] bg-[#071527] text-white shadow-[0_24px_60px_rgba(7,21,39,.18)]">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,.72fr)]">
          <div className="p-5 sm:p-8 lg:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8ab4f8]">明天要几点起床？</p>
            <label className="mt-3 block" htmlFor="wake-time">
              <span className="sr-only">起床时间</span>
              <input
                id="wake-time"
                type="time"
                value={wakeTime}
                onChange={(event) => setWakeTime(event.target.value || '07:00')}
                className="w-full max-w-sm rounded-2xl border border-white/20 bg-white/10 px-4 py-3 font-mono text-4xl font-semibold tracking-[-0.04em] text-white outline-none transition focus:border-[#8ab4f8] focus:ring-4 focus:ring-[#8ab4f8]/15 sm:text-5xl"
              />
            </label>

            <div className="mt-8 max-w-lg">
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="sleep-latency" className="text-sm font-medium text-[#d2e3fc]">通常躺下后多久睡着</label>
                <output htmlFor="sleep-latency" className="min-w-20 text-right font-mono text-lg font-semibold">{latency} 分钟</output>
              </div>
              <input
                id="sleep-latency"
                type="range"
                min="0"
                max="60"
                step="5"
                value={latency}
                onChange={(event) => setLatency(Number(event.target.value))}
                className="mt-3 h-2 w-full cursor-pointer accent-[#8ab4f8]"
              />
              <div className="mt-2 flex justify-between text-xs text-[#9aaec6]" aria-hidden="true"><span>很快</span><span>30 分钟</span><span>60 分钟</span></div>
            </div>
          </div>

          <div className="flex flex-col justify-between border-t border-white/10 bg-white/[0.055] p-5 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8ab4f8]">今晚优先方案</p>
              <p className="mt-4 font-mono text-6xl font-semibold tracking-[-0.07em] sm:text-7xl">{balancedPlan.bedtime}</p>
              <p className="mt-2 text-sm text-[#c6daf7]">上床，给自己 {latency} 分钟自然入睡</p>
            </div>
            <div className="mt-8 rounded-2xl border border-white/10 bg-black/15 p-4 text-sm leading-6 text-[#d2e3fc]">
              <span className="material-icons-round mr-2 align-[-4px] text-lg text-[#8ab4f8]" aria-hidden="true">wb_twilight</span>
              如果最近明显缺觉，选择下方更早的“恢复优先”时间；不要为了凑周期而主动少睡。
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Bedtime options</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-[var(--foreground)]">三个可执行时间</h2>
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">按每周期约 90 分钟估算</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => <PlanCard key={plan.cycles} plan={plan} />)}
        </div>
      </section>

      <section className="mt-8 grid gap-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:grid-cols-3 sm:p-6">
        <div>
          <span className="material-icons-round text-2xl text-[#1a73e8] dark:text-[#8ab4f8]" aria-hidden="true">schedule</span>
          <h2 className="mt-2 font-semibold text-[var(--foreground)]">固定起床时间</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">每天尽量在相近时间起床，比偶尔精准踩中某个周期更实用。</p>
        </div>
        <div>
          <span className="material-icons-round text-2xl text-[#1a73e8] dark:text-[#8ab4f8]" aria-hidden="true">light_mode</span>
          <h2 className="mt-2 font-semibold text-[var(--foreground)]">起床后接触自然光</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">早晨的光线和规律作息一起帮助身体建立稳定节奏。</p>
        </div>
        <div>
          <span className="material-icons-round text-2xl text-[#1a73e8] dark:text-[#8ab4f8]" aria-hidden="true">tune</span>
          <h2 className="mt-2 font-semibold text-[var(--foreground)]">用实际感受校准</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">周期长度因人、因夜而异。连续记录一周，再把上床时间前后微调 15 分钟。</p>
        </div>
      </section>

      <p className="mt-5 text-xs leading-5 text-[var(--muted-foreground)]">
        这是作息规划工具，不是医学诊断。成年人通常需要每晚至少 7 小时睡眠；若长期难以入睡、白天过度困倦或睡眠问题影响生活，请咨询专业人士。
        {' '}<a className="underline decoration-dotted underline-offset-2 hover:text-[var(--foreground)]" href="https://www.cdc.gov/sleep/about/index.html" target="_blank" rel="noreferrer">CDC 睡眠建议</a>
        {' · '}<a className="underline decoration-dotted underline-offset-2 hover:text-[var(--foreground)]" href="https://www.cpft.nhs.uk/download/docm93jijm4n5165.pdf?ver=6960" target="_blank" rel="noreferrer">NHS 睡眠周期说明</a>
      </p>
    </div>
  );
}

