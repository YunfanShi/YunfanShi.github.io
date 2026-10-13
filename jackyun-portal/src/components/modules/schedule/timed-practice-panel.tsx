'use client';

import Link from 'next/link';
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { ScheduleControlState } from '@/lib/learning/schedule-control';
import { normalizeTimedPractice, planTimedPractice, PRACTICE_SUBJECTS, weeklyPracticeSubjects, weeklyPracticeSummary, type PracticeSubject, type TimedPracticeRecord } from '@/lib/learning/timed-practice';

const inputClass = 'mt-1 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm';
const buttonClass = 'rounded-full border border-[var(--card-border)] px-3 py-2 text-sm font-semibold disabled:opacity-50';
const emptyForm = (date: string): TimedPracticeRecord => ({ id: '', date, subject: 'Pure Math', source: 'B', reference: '', independent: false, minutes: 25, onTime: 0, overtime: 0, failed: 0, failedOvertime: 0, blocked: 0, bottleneck: '' });

export default function TimedPracticePanel({ state, date, onChange }: { state: ScheduleControlState; date: string; onChange: Dispatch<SetStateAction<ScheduleControlState>> }) {
  const records = state.timedPracticeRecords ?? [];
  const summary = weeklyPracticeSummary(records, date);
  const subjects = weeklyPracticeSubjects(date);
  const [form, setForm] = useState<TimedPracticeRecord>(() => emptyForm(date));
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const setField = <K extends keyof TimedPracticeRecord>(key: K, value: TimedPracticeRecord[K]) => setForm(current => ({ ...current, [key]: value }));
  const schedule = (subject: PracticeSubject) => {
    onChange(current => planTimedPractice(current, subject, date, crypto.randomUUID()));
    setNotice(`已检查 ${subject} 本周安排；已有任务或训练证据时不会重复添加。`);
  };
  return <section aria-labelledby="timed-practice-title" className="mt-5 min-w-0 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="timed-practice-title" className="font-semibold">本周限时新题</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">{summary.start} — {summary.end} · 2026-10-13 执行版</p></div><button type="button" className={buttonClass} onClick={() => { setForm(emptyForm(date)); setOpen(true); }}>记录训练或作业抵扣</button></div>
    <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Pure Math、Mechanics、Physics 各一次 20–30 分钟；Statistics 与 Computer Science 每周轮换一次约 20 分钟。首次接触且独立计时的作业可抵扣。先做新题，再修少量 Cue/PQ；繁忙周先保三门主科。</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">{subjects.map(subject => {
      const credited = summary.creditedSubjects.has(subject);
      const presetId = `timed-new-${subject.toLowerCase().replaceAll(' ', '-')}`;
      const planned = state.manualTasks.some(task => task.presetId === presetId && task.date >= summary.start && task.date <= summary.end && !state.cancellations[task.id]);
      return <div key={subject} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/[.035] p-3 text-sm dark:bg-white/[.06]"><span>{subject} · {credited ? '已有训练证据' : planned ? '已安排，待记录证据' : '本周待安排'}</span><button type="button" className={buttonClass} disabled={credited || planned} onClick={() => schedule(subject)}>加入所选日</button></div>;
    })}</div>
    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><dt className="text-xs text-[var(--muted-foreground)]">新题真正动笔</dt><dd className="mt-1 font-semibold">{summary.attempted} 题 · {summary.entries.length} 次</dd></div><div><dt className="text-xs text-[var(--muted-foreground)]">按时正确率</dt><dd className="mt-1 font-semibold">{summary.onTimeRate === null ? '暂无证据' : `${summary.onTimeRate}%`}</dd></div><div><dt className="text-xs text-[var(--muted-foreground)]">超时 / 无从下手</dt><dd className="mt-1 font-semibold">{summary.overtime} / {summary.blocked} 题</dd></div><div><dt className="text-xs text-[var(--muted-foreground)]">主要卡点</dt><dd className="mt-1 break-words font-semibold">{summary.bottlenecks.join('、') || '尚未记录'}</dd></div></dl>
    <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">每次记录一个主要卡点，按出现次数显示前两项。熟题 A、整卷 C、非独立尝试不计新题指标；单次独立用时至少 20 分钟才抵扣周训练。只勾任务完成不算训练证据。</p>
    <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">A / B / C 题库与计时规则</summary><p className="mt-2 leading-6">A 熟题/PQ 用于 Repair；B 未见分类或混合题用于限时训练；C 未打开解析的完整卷留给模拟。读题起计时，到时停笔。纯数、力学、统计按卷面时间/分值，Edexcel IAL 可先估约 1.2 分钟/分；Physics 选择题先估 1.5–2 分钟/题，结构题按该卷比例，起步可放宽约 20%。约 90 秒完全无法起步可标记跳过，第二轮不限时重试；重试不覆盖首次结果。</p></details>
    {open && <form aria-label="限时训练记录" className="mt-4 rounded-2xl border border-[var(--card-border)] p-4" onSubmit={event => {
      event.preventDefault();
      const next = { ...form, id: form.id || crypto.randomUUID() };
      if (!normalizeTimedPractice([next]).length) { setNotice('请填写真实日期、题目来源、正数用时与题数；无从下手和 ○ 超时题数分别不能大于 ○ 题数。'); return; }
      onChange(current => ({ ...current, timedPracticeRecords: normalizeTimedPractice([...(current.timedPracticeRecords ?? []).filter(item => item.id !== next.id), next]) }));
      setOpen(false); setNotice('训练证据已保存；修复后请换另一道新题复测，单独保留首次结果。');
    }}>
      <h3 className="font-semibold">{form.id ? '修改训练证据' : '记录一次真实训练'}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><label>日期<input required type="date" value={form.date} onChange={event => setField('date', event.target.value)} className={inputClass} /></label><label>科目<select value={form.subject} onChange={event => setField('subject', event.target.value as PracticeSubject)} className={inputClass}>{PRACTICE_SUBJECTS.map(subject => <option key={subject}>{subject}</option>)}</select></label><label>题库类型<select value={form.source} onChange={event => setField('source', event.target.value as TimedPracticeRecord['source'])} className={inputClass}><option value="B">B 未见新题</option><option value="homework">首次接触的学校作业</option><option value="A">A 熟题 / PQ 修复</option><option value="C">C 完整卷模拟</option></select></label><label>实际用时 分钟<input required type="number" min="0.1" max="1440" step="0.1" value={form.minutes} onChange={event => setField('minutes', Number(event.target.value))} className={inputClass} /></label></div>
      <label className="mt-3 block">题目来源或编号<input required maxLength={200} value={form.reference} onChange={event => setField('reference', event.target.value)} placeholder="例如：课本 Ch 5 Q 3–6；首次尝试" className={inputClass} /></label>
      <label className="mt-3 flex items-start gap-2 text-sm leading-6"><input type="checkbox" checked={form.independent} onChange={event => setField('independent', event.target.checked)} className="mt-1" />从读题起独立计时；开始前没做过这些题、没看过答案或解析</label>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{([['onTime', '✓ 正确且按时'], ['overtime', '△ 正确但超时'], ['failed', '○ 错误 无思路 求助'], ['blocked', '其中无从下手'], ['failedOvertime', '其中 ○ 超时']] as const).map(([key, label]) => <label key={key}>{label}<input required type="number" min="0" max="1000" step="1" value={form[key] ?? 0} onChange={event => setField(key, Number(event.target.value))} className={inputClass} /></label>)}</div>
      <label className="mt-3 block">最高影响的一个卡点<input maxLength={80} value={form.bottleneck} onChange={event => setField('bottleneck', event.target.value)} placeholder="审题 / 作图 / 受力分析 / 公式选择" className={inputClass} /></label><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">✓ / △ / ○ 互斥，按时正确率 = ✓ ÷ 三类总题数；○ 超时是 ○ 的子集，周超时总数包含 △ 与 ○ 超时。记录后只修最高影响的一项，再换新题验证。</p>
      <div className="mt-4 flex flex-wrap gap-2"><button className={buttonClass} type="submit">保存训练证据</button><button className={buttonClass} type="button" onClick={() => setOpen(false)}>取消</button></div>
    </form>}
    <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">训练记录与修正</summary><div className="mt-2 max-h-64 space-y-2 overflow-y-auto">{records.filter(item => item.date >= summary.start && item.date <= summary.end).map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--card-border)] p-3"><span className="min-w-0 flex-1 break-words">{item.date} · {item.subject} · {item.source} · {item.reference} · {item.minutes} 分钟 · ✓ {item.onTime} / △ {item.overtime} / ○ {item.failed}</span><button type="button" className={buttonClass} onClick={() => { setForm(item); setOpen(true); }}>修改</button></div>)}{!records.some(item => item.date >= summary.start && item.date <= summary.end) && <p>本周暂无训练记录。</p>}</div></details>
    <p role="status" className="mt-3 text-sm">{notice}</p><Link href="/study-guide?tab=practice&subTab=timed" className="mt-2 inline-block text-sm font-semibold text-[var(--brand)]">查看限时新题完整方法 →</Link>
  </section>;
}
