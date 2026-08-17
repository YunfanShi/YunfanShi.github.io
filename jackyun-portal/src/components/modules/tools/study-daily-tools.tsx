'use client';

import { useMemo, useState } from 'react';

function Field({ label, value, onChange, min = 0, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; step?: number }) {
  return (
    <label className="space-y-1 text-xs text-[var(--muted-foreground)]">
      <span>{label}</span>
      <input type="number" min={min} step={step} value={value} onChange={event => onChange(Number(event.target.value) || 0)} className="min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4]" />
    </label>
  );
}

export default function StudyDailyTools() {
  const [pages, setPages] = useState(60);
  const [minutesPerPage, setMinutesPerPage] = useState(2.5);
  const [days, setDays] = useState(7);
  const [studyMinutes, setStudyMinutes] = useState(120);
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [score, setScore] = useState(86);
  const [total, setTotal] = useState(100);
  const [unitValue, setUnitValue] = useState(1);
  const [conversion, setConversion] = useState<'km-mi' | 'kg-lb' | 'c-f'>('km-mi');

  const reading = useMemo(() => {
    const totalMinutes = pages * minutesPerPage;
    return { totalMinutes, perDay: days > 0 ? totalMinutes / days : 0, pagesPerDay: days > 0 ? pages / days : 0 };
  }, [days, minutesPerPage, pages]);
  const cycles = Math.max(0, Math.floor((studyMinutes + breakMinutes) / Math.max(1, focusMinutes + breakMinutes)));
  const converted = conversion === 'km-mi' ? unitValue * 0.621371 : conversion === 'kg-lb' ? unitValue * 2.20462 : unitValue * 9 / 5 + 32;
  const conversionLabel = conversion === 'km-mi' ? '英里' : conversion === 'kg-lb' ? '磅' : '°F';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-[var(--foreground)]"><span className="material-icons-round text-[#4285F4]">menu_book</span>阅读计划</h3>
        <div className="grid grid-cols-3 gap-2"><Field label="总页数" value={pages} onChange={setPages} /><Field label="每页分钟" value={minutesPerPage} onChange={setMinutesPerPage} step={0.5} /><Field label="完成天数" value={days} onChange={setDays} min={1} /></div>
        <div className="mt-4 rounded-xl bg-[#4285F4]/10 p-3 text-sm text-[var(--foreground)]">每天约 <strong>{reading.pagesPerDay.toFixed(1)} 页</strong> · <strong>{Math.ceil(reading.perDay)} 分钟</strong>，总计 {Math.ceil(reading.totalMinutes)} 分钟</div>
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-[var(--foreground)]"><span className="material-icons-round text-[#34A853]">timer</span>专注周期规划</h3>
        <div className="grid grid-cols-3 gap-2"><Field label="可用分钟" value={studyMinutes} onChange={setStudyMinutes} /><Field label="专注分钟" value={focusMinutes} onChange={setFocusMinutes} min={1} /><Field label="休息分钟" value={breakMinutes} onChange={setBreakMinutes} /></div>
        <div className="mt-4 rounded-xl bg-[#34A853]/10 p-3 text-sm text-[var(--foreground)]">可完成 <strong>{cycles} 个周期</strong> · 实际专注 {cycles * focusMinutes} 分钟 · 休息 {Math.max(0, cycles - 1) * breakMinutes} 分钟</div>
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-[var(--foreground)]"><span className="material-icons-round text-[#FBBC05]">calculate</span>成绩百分比</h3>
        <div className="grid grid-cols-2 gap-2"><Field label="所得分" value={score} onChange={setScore} step={0.5} /><Field label="总分" value={total} onChange={setTotal} min={1} step={0.5} /></div>
        <div className="mt-4 rounded-xl bg-[#FBBC05]/10 p-3 text-sm text-[var(--foreground)]">成绩：<strong>{total > 0 ? Math.min(999, score / total * 100).toFixed(1) : '0.0'}%</strong></div>
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-[var(--foreground)]"><span className="material-icons-round text-[#8E24AA]">straighten</span>常用单位换算</h3>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="数值" value={unitValue} onChange={setUnitValue} step={0.1} />
          <label className="space-y-1 text-xs text-[var(--muted-foreground)]"><span>类型</span><select value={conversion} onChange={event => setConversion(event.target.value as typeof conversion)} className="min-h-11 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]"><option value="km-mi">公里 → 英里</option><option value="kg-lb">千克 → 磅</option><option value="c-f">°C → °F</option></select></label>
        </div>
        <div className="mt-4 rounded-xl bg-[#8E24AA]/10 p-3 text-sm text-[var(--foreground)]">结果：<strong>{converted.toFixed(2)} {conversionLabel}</strong></div>
      </section>
    </div>
  );
}
