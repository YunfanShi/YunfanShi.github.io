'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import IeltsCycleBoard from '@/components/modules/ielts/ielts-cycle-board';
import { CLOUD_STATE_APPLIED_EVENT } from '@/lib/local-workspace';
import { buildIeltsInsights, IELTS_SKILLS, IELTS_SKILL_LABELS, parseIeltsGoal, parseIeltsPractices, validBand, validDate, type IeltsActivity, type IeltsGoal, type IeltsOutcome, type IeltsPractice, type IeltsSkill } from '@/lib/ielts-plan';

const GOAL_KEY = 'jackyun_ielts_goal_v1';
const PRACTICE_KEY = 'jackyun_ielts_practice_v1';
const SCHEDULE_KEY = 'jackyun_schedule_control_v1';
const WRITING_KEY = 'jackyun_ielts_writing_archive_v1';
const INPUT_CLASS = 'mt-2 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 text-[var(--foreground)] outline-none focus:border-[#0f766e]';

const PRACTICE_GUIDE: Record<IeltsSkill, { task: string; repair: string; transfer: string; href: string }> = {
  listening: { task: '在雅思哥用一段真题音频连续作答，不暂停、不回拨。', repair: '复听错题附近，区分漏听、定位与拼写问题。', transfer: '换一段音频，检查同一问题是否改善。', href: '/study-guide?tab=ielts&subTab=listening' },
  reading: { task: '在雅思哥限时做一篇 Passage，记录用时与题型。', repair: '逐题定位原文证据，找出同义替换或判断失误。', transfer: '换一篇 Passage，验证速度和正确率。', href: '/study-guide?tab=ielts&subTab=reading' },
  writing: { task: '独立限时写一篇首稿，保留原文。', repair: '只选一个主要问题修改论证或语言。', transfer: '换题写新段落，验证修改能否迁移。', href: '/ielts-writing' },
  speaking: { task: '在雅思哥选一道真题，限时录下首次回答。', repair: '回听并只修复一个具体问题。', transfer: '换题重新录音，比较流利度和表达。', href: '/study-guide?tab=ielts&subTab=speaking' },
};

type GoalDraft = { overall: string; examDate: string; weeklyHours: string; targets: Record<IeltsSkill, string> };
const EMPTY_GOAL: GoalDraft = { overall: '7', examDate: '', weeklyHours: '5', targets: { listening: '7', reading: '7', writing: '7', speaking: '7' } };

function readJson(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || 'null') as unknown; } catch { return null; }
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
}

function readActivity(): { activity: IeltsActivity[]; writingCount: number; pendingTasks: { id: string; title: string; date: string }[] } {
  const schedule = readJson(SCHEDULE_KEY) as { learningRecords?: unknown; manualTasks?: unknown; completions?: Record<string, unknown>; cancellations?: Record<string, unknown> } | null;
  const activity: IeltsActivity[] = [];
  const pendingTasks = asRows(schedule?.manualTasks).filter((row) =>
    typeof row.id === 'string' && row.id.startsWith('ielts:') && typeof row.title === 'string' && typeof row.date === 'string'
      && !schedule?.completions?.[row.id] && !schedule?.cancellations?.[row.id],
  ).map((row) => ({ id: row.id as string, title: row.title as string, date: row.date as string })).sort((a, b) => a.date.localeCompare(b.date));
  for (const row of asRows(schedule?.learningRecords)) {
    const guide = row.guide as { tab?: unknown; subTab?: unknown } | undefined;
    const title = typeof row.taskTitle === 'string' ? row.taskTitle.toLowerCase() : '';
    const skill = IELTS_SKILLS.find((item) => guide?.tab === 'ielts' && guide.subTab === item || title.includes(`ielts ${item}`));
    if (!skill || typeof row.completedAt !== 'string' || Number.isNaN(Date.parse(row.completedAt))) continue;
    activity.push({ skill, practicedAt: row.completedAt, source: '日程学习记录', issue: typeof row.issue === 'string' ? row.issue : undefined });
  }
  const writing = asRows(readJson(WRITING_KEY));
  for (const row of writing) {
    const timestamp = row.savedAt ?? row.updatedAt ?? row.createdAt;
    if (typeof timestamp === 'string' && !Number.isNaN(Date.parse(timestamp))) activity.push({ skill: 'writing', practicedAt: timestamp, source: '雅思写作工具' });
  }
  return { activity, writingCount: writing.length, pendingTasks };
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function IeltsDashboard() {
  const [ready, setReady] = useState(false);
  const [goal, setGoal] = useState<IeltsGoal | null>(null);
  const [draft, setDraft] = useState<GoalDraft>(EMPTY_GOAL);
  const [editingGoal, setEditingGoal] = useState(false);
  const [practices, setPractices] = useState<IeltsPractice[]>([]);
  const [activityData, setActivityData] = useState({ activity: [] as IeltsActivity[], writingCount: 0, pendingTasks: [] as { id: string; title: string; date: string }[] });
  const [form, setForm] = useState({ skill: 'listening' as IeltsSkill, minutes: '45', band: '', outcome: 'partial' as IeltsOutcome, material: '', issue: '', nextStep: '' });
  const [notice, setNotice] = useState('');
  const today = localDate();

  useEffect(() => {
    const refresh = () => {
      const savedGoal = parseIeltsGoal(readJson(GOAL_KEY));
      setGoal(savedGoal);
      if (savedGoal) setDraft({ overall: String(savedGoal.overall), examDate: savedGoal.examDate, weeklyHours: String(savedGoal.weeklyHours), targets: Object.fromEntries(IELTS_SKILLS.map((skill) => [skill, String(savedGoal.targets[skill])])) as GoalDraft['targets'] });
      setPractices(parseIeltsPractices(readJson(PRACTICE_KEY)));
      setActivityData(readActivity());
      setReady(true);
    };
    refresh();
    window.addEventListener(CLOUD_STATE_APPLIED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(CLOUD_STATE_APPLIED_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);

  const insights = useMemo(() => goal ? buildIeltsInsights(goal, practices, activityData.activity, today) : [], [goal, practices, activityData, today]);
  const focus = insights[0];
  const daysLeft = goal ? Math.ceil((Date.parse(`${goal.examDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null;
  const recordedMinutes = practices.reduce((sum, entry) => sum + entry.minutes, 0);

  function saveGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = parseIeltsGoal({ overall: Number(draft.overall), examDate: draft.examDate, weeklyHours: Number(draft.weeklyHours), targets: Object.fromEntries(IELTS_SKILLS.map((skill) => [skill, Number(draft.targets[skill])])) });
    if (!candidate || !validDate(candidate.examDate) || candidate.examDate < today) { setNotice('请填写有效的目标分数、未来考试日期和每周 1–40 小时。'); return; }
    try { localStorage.setItem(GOAL_KEY, JSON.stringify(candidate)); setGoal(candidate); setEditingGoal(false); setNotice('目标已保存。'); }
    catch { setNotice('保存失败，请检查浏览器存储空间。'); }
  }

  function savePractice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minutes = Number(form.minutes);
    const band = form.band.trim() === '' ? null : Number(form.band);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240 || (band !== null && !validBand(band)) || !form.material.trim() || !form.nextStep.trim()) {
      setNotice('请填写材料、1–240 分钟的用时和下一步；分数可留空，填写时须为 0–9 的半分档。'); return;
    }
    const entry: IeltsPractice = { id: crypto.randomUUID(), skill: form.skill, practicedAt: new Date().toISOString(), minutes, band, outcome: form.outcome, material: form.material.trim().slice(0, 200), issue: form.issue.trim().slice(0, 500), nextStep: form.nextStep.trim().slice(0, 500) };
    const updated = [...practices, entry].slice(-500);
    try { localStorage.setItem(PRACTICE_KEY, JSON.stringify(updated)); setPractices(updated); setForm({ ...form, band: '', material: '', issue: '', nextStep: '' }); setNotice('练习和复盘已记录。'); }
    catch { setNotice('保存失败，请检查浏览器存储空间。'); }
  }

  if (!ready) return <main className="mx-auto max-w-6xl p-6 text-[var(--muted-foreground)]">正在读取雅思学习记录…</main>;
  return <main className="mx-auto max-w-6xl space-y-6 pb-12 text-[var(--foreground)]">
    <header className="rounded-[28px] bg-[linear-gradient(120deg,#102c3c,#155e75_60%,#0f766e)] p-6 text-white shadow-lg sm:p-9">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-teal-200">IELTS · PRACTICE STUDIO</p>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">雅思备考工作台</h1>
      <p className="mt-3 max-w-2xl leading-7 text-teal-50">明确目标，做真实练习，记录错因，再用新材料验证。这里根据你的记录排列优先项，不把一次练习当作正式成绩预测。</p>
      <div className="mt-6 flex flex-wrap gap-2 text-sm"><a href="#weekly-cycle" className="rounded-xl bg-white px-4 py-2.5 font-bold text-teal-900">管理五个弹性模块</a><Link href="/study-guide?tab=ielts" className="rounded-xl border border-white/40 px-4 py-2.5 font-bold text-white">查看四科训练方法</Link></div>
    </header>

    {(!goal || editingGoal) && <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-7"><h2 className="text-xl font-bold">{goal ? '调整备考目标' : '先设定备考目标'}</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">目标用于比较练习记录；单项目标可以与总分目标不同。</p><form onSubmit={saveGoal} className="mt-5 space-y-4"><div className="grid gap-4 sm:grid-cols-3"><label className="text-sm font-semibold">目标总分<input className={INPUT_CLASS} type="number" min="0" max="9" step="0.5" value={draft.overall} onChange={(event) => setDraft({ ...draft, overall: event.target.value })} required /></label><label className="text-sm font-semibold">考试日期<input className={INPUT_CLASS} type="date" min={today} value={draft.examDate} onChange={(event) => setDraft({ ...draft, examDate: event.target.value })} required /></label><label className="text-sm font-semibold">每周可用时间 · 小时<input className={INPUT_CLASS} type="number" min="1" max="40" step="1" value={draft.weeklyHours} onChange={(event) => setDraft({ ...draft, weeklyHours: event.target.value })} required /></label></div><div className="grid gap-4 sm:grid-cols-4">{IELTS_SKILLS.map((skill) => <label key={skill} className="text-sm font-semibold">{IELTS_SKILL_LABELS[skill]}目标<input className={INPUT_CLASS} type="number" min="0" max="9" step="0.5" value={draft.targets[skill]} onChange={(event) => setDraft({ ...draft, targets: { ...draft.targets, [skill]: event.target.value } })} required /></label>)}</div><div className="flex gap-3"><button className="rounded-xl bg-[#0f766e] px-5 py-2.5 font-bold text-white" type="submit">保存目标</button>{goal && <button className="rounded-xl border border-[var(--card-border)] px-4 py-2.5 font-semibold" type="button" onClick={() => setEditingGoal(false)}>取消</button>}</div></form></section>}

    {goal && <><section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[{ label: '目标总分', value: goal.overall.toFixed(1), detail: '以正式评分为准' }, { label: '距考试', value: daysLeft !== null && daysLeft >= 0 ? `${daysLeft} 天` : '已过期', detail: goal.examDate }, { label: '每周时间', value: `${goal.weeklyHours} 小时`, detail: '五个弹性模块，未完成可顺延' }, { label: '已记录练习', value: `${practices.length} 次`, detail: `${recordedMinutes} 分钟 · 四科练习` }].map((item) => <article key={item.label} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5"><p className="text-sm text-[var(--muted-foreground)]">{item.label}</p><p className="mt-2 text-2xl font-bold">{item.value}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.detail}</p></article>)}</section><div className="flex justify-end"><button type="button" onClick={() => setEditingGoal(true)} className="text-sm font-semibold text-[#0f766e] hover:underline">修改目标</button></div>

    <IeltsCycleBoard />

    {focus && <section className="rounded-3xl border border-teal-200 bg-teal-50 p-6 text-teal-950 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100"><p className="text-xs font-bold uppercase tracking-widest">下一步建议 · {IELTS_SKILL_LABELS[focus.skill]}</p><h2 className="mt-2 text-xl font-bold">{focus.reason}</h2>{focus.issue && <p className="mt-2 text-sm">最近问题：{focus.issue}</p>}<ol className="mt-4 grid gap-3 text-sm md:grid-cols-3">{[PRACTICE_GUIDE[focus.skill].task, PRACTICE_GUIDE[focus.skill].repair, PRACTICE_GUIDE[focus.skill].transfer].map((step, index) => <li key={step} className="rounded-xl bg-white/80 p-4 dark:bg-white/10"><strong>{['① 真实练习', '② 定点修复', '③ 换题验证'][index]}</strong><p className="mt-2 leading-6">{step}</p></li>)}</ol><Link className="mt-4 inline-block rounded-xl bg-[#0f766e] px-4 py-2.5 text-sm font-bold text-white" href={PRACTICE_GUIDE[focus.skill].href}>开始{IELTS_SKILL_LABELS[focus.skill]}训练</Link></section>}

    {activityData.pendingTasks.length > 0 && <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">日程中的待做模块</h2><Link href="/schedule" className="text-sm font-semibold text-[#0f766e] hover:underline">管理与记录证据 →</Link></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{activityData.pendingTasks.slice(0, 6).map((task) => <div key={task.id} className="rounded-xl border border-[var(--card-border)] p-3 text-sm"><strong>{task.title}</strong><span className="ml-2 text-[var(--muted-foreground)]">{task.date < today ? '待顺延' : task.date}</span></div>)}</div></section>}

    <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-7"><h2 className="text-xl font-bold">四科状态与优先顺序</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">按目标差距、最近练习时间和复盘状态排序；阅读器和写作工具活动只证明练习发生，不换算雅思分数。</p><div className="mt-5 grid gap-3 md:grid-cols-2">{insights.map((item, index) => <article key={item.skill} className="rounded-2xl border border-[var(--card-border)] p-4"><div className="flex items-center justify-between"><h3 className="font-bold">{index + 1}. {IELTS_SKILL_LABELS[item.skill]}</h3><span className="text-sm font-semibold">{item.latestBand === null ? '待测基线' : `${item.latestBand.toFixed(1)} / ${item.target.toFixed(1)}`}</span></div><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{item.reason}</p><p className="mt-2 text-xs text-[var(--muted-foreground)]">独立练习 {item.practiceCount} 次{item.latestAt ? ` · 最近活动 ${item.latestAt.slice(0, 10)}` : ' · 尚无活动'}</p><Link href={PRACTICE_GUIDE[item.skill].href} className="mt-3 inline-block text-sm font-semibold text-[#0f766e] hover:underline">训练方法 →</Link></article>)}</div></section>

    <section className="grid gap-4 lg:grid-cols-2"><article className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-7"><h2 className="text-xl font-bold">工具分工</h2><p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">雅思哥负责听力、阅读、口语和写作题目；本站只负责计划、练习证据、复盘和持续修改。日程学习证据 {activityData.activity.filter((item) => item.source === '日程学习记录').length} 条 · 写作归档 {activityData.writingCount} 篇。</p><div className="mt-5 flex flex-wrap gap-2"><Link className="rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-semibold" href="/ielts-writing">雅思写作工具</Link><Link className="rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-semibold" href="/schedule">日程与任务</Link></div></article><article className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-7"><h2 className="text-xl font-bold">每轮容量</h2><p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">按你的真实上限，每轮只有五次、每次最多 60 分钟：听力、阅读、写作、口语、总结各一次。不绑定星期；没有完成的分析保留到下一次，不因为跨周而开启新题。</p><ul className="mt-3 grid grid-cols-2 gap-2 text-sm"><li>· 听力 ≤ 60 分钟</li><li>· 阅读 ≤ 60 分钟</li><li>· 写作 ≤ 60 分钟</li><li>· 口语 ≤ 60 分钟</li><li>· 总结 ≤ 60 分钟</li></ul><Link className="mt-4 inline-block text-sm font-semibold text-[#0f766e] hover:underline" href="/schedule">前往日程 →</Link></article></section>

    <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-7"><h2 className="text-xl font-bold">记录一次真实练习</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">先完成练习，再记录证据和下一步。分数可空；请只填你确实获得的评分。</p><form onSubmit={savePractice} className="mt-5 space-y-4"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-semibold">科目<select className={INPUT_CLASS} value={form.skill} onChange={(event) => setForm({ ...form, skill: event.target.value as IeltsSkill })}>{IELTS_SKILLS.map((skill) => <option key={skill} value={skill}>{IELTS_SKILL_LABELS[skill]}</option>)}</select></label><label className="text-sm font-semibold">用时 · 分钟<input className={INPUT_CLASS} type="number" min="1" max="240" value={form.minutes} onChange={(event) => setForm({ ...form, minutes: event.target.value })} required /></label><label className="text-sm font-semibold">评分 · 可选<input className={INPUT_CLASS} type="number" min="0" max="9" step="0.5" placeholder="尚未评分" value={form.band} onChange={(event) => setForm({ ...form, band: event.target.value })} /></label><label className="text-sm font-semibold">复盘状态<select className={INPUT_CLASS} value={form.outcome} onChange={(event) => setForm({ ...form, outcome: event.target.value as IeltsOutcome })}><option value="stable">√ 能独立完成</option><option value="partial">△ 还不稳定</option><option value="unclear">○ 需要重练</option></select></label></div><label className="block text-sm font-semibold">材料或题目<input className={INPUT_CLASS} maxLength={200} value={form.material} onChange={(event) => setForm({ ...form, material: event.target.value })} placeholder="例如：雅思哥 听力 Test 3；当季口语 Part 2" required /></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">具体错因<textarea className={`${INPUT_CLASS} min-h-24 py-3`} maxLength={500} value={form.issue} onChange={(event) => setForm({ ...form, issue: event.target.value })} placeholder="例如 Section 3 同义替换没识别" /></label><label className="text-sm font-semibold">下一次如何验证<textarea className={`${INPUT_CLASS} min-h-24 py-3`} maxLength={500} value={form.nextStep} onChange={(event) => setForm({ ...form, nextStep: event.target.value })} placeholder="例如换一段 Section 3，连续听后核对定位" required /></label></div><button type="submit" className="rounded-xl bg-[#0f766e] px-5 py-2.5 font-bold text-white">保存练习与复盘</button></form></section>

    <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-7"><h2 className="text-xl font-bold">最近练习</h2>{practices.length ? <div className="mt-4 space-y-3">{[...practices].reverse().slice(0, 8).map((entry) => <article key={entry.id} className="rounded-2xl border border-[var(--card-border)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{IELTS_SKILL_LABELS[entry.skill]} · {entry.material}</strong><span className="text-xs text-[var(--muted-foreground)]">{entry.practicedAt.slice(0, 10)} · {entry.minutes} 分钟 · {entry.band === null ? '未评分' : `${entry.band.toFixed(1)} 分`}</span></div><p className="mt-2 text-sm text-[var(--muted-foreground)]">{entry.issue ? `问题：${entry.issue} · ` : ''}下一步：{entry.nextStep}</p></article>)}</div> : <p className="mt-4 text-sm text-[var(--muted-foreground)]">暂无独立练习记录。先做一科的限时基线练习，再回来记录结果。</p>}</section></>}
    {notice && <p role="status" className="rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-100">{notice}</p>}
  </main>;
}
