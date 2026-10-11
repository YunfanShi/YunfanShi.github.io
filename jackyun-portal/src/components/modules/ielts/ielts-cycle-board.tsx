'use client';

import Link from 'next/link';
import {parseLocalValue,persistLocalEditNow} from '@/lib/sync/local-edit';
import { useEffect, useMemo, useRef, useState } from 'react';

type ModuleId = 'listening' | 'reading' | 'writing' | 'speaking' | 'review';
type ModuleStatus = 'todo' | 'active' | 'done';

interface ModuleState {
  status: ModuleStatus;
  material: string;
  note: string;
  nextStep: string;
  carried: boolean;
}

interface CycleState {
  cycle: number;
  startedAt: string;
  modules: Record<ModuleId, ModuleState>;
}

const STORAGE_KEY = 'jackyun_ielts_flexible_cycle_v1';
const HISTORY_KEY = 'jackyun_ielts_flexible_cycle_history_v1';
const MODULES: Array<{ id: ModuleId; label: string; icon: string; purpose: string }> = [
  { id: 'listening', label: '听力', icon: 'headphones', purpose: '在雅思哥完成练习；网站只记录错因和下一步。' },
  { id: 'reading', label: '阅读', icon: 'article', purpose: '在雅思哥限时完成；同时记录正确但慢的题。' },
  { id: 'writing', label: '写作', icon: 'edit_note', purpose: '在写作工具保留首稿、自改并做迁移验证。' },
  { id: 'speaking', label: '口语', icon: 'record_voice_over', purpose: '在雅思哥选题并录音；每次只修一至两个问题。' },
  { id: 'review', label: '总结', icon: 'fact_check', purpose: '整理本轮证据，只确定下一轮最重要的改进点。' },
];

function emptyModule(): ModuleState {
  return { status: 'todo', material: '', note: '', nextStep: '', carried: false };
}

function initialCycle(): CycleState {
  return {
    cycle: 1,
    startedAt: new Date().toISOString(),
    modules: Object.fromEntries(MODULES.map(({ id }) => [id, emptyModule()])) as Record<ModuleId, ModuleState>,
  };
}

function parseCycle(value: unknown): CycleState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CycleState>;
  if (!Number.isInteger(candidate.cycle) || Number(candidate.cycle) < 1 || typeof candidate.startedAt !== 'string' || !candidate.modules) return null;
  const modules = {} as Record<ModuleId, ModuleState>;
  for (const { id } of MODULES) {
    const row = candidate.modules[id];
    if (!row || !['todo', 'active', 'done'].includes(row.status)) return null;
    modules[id] = {
      status: row.status,
      material: typeof row.material === 'string' ? row.material.slice(0, 200) : '',
      note: typeof row.note === 'string' ? row.note.slice(0, 500) : '',
      nextStep: typeof row.nextStep === 'string' ? row.nextStep.slice(0, 500) : '',
      carried: Boolean(row.carried),
    };
  }
  return { cycle: Number(candidate.cycle), startedAt: candidate.startedAt, modules };
}

export default function IeltsCycleBoard() {
  const [cycle, setCycle] = useState<CycleState | null>(null);
  const [history, setHistory] = useState<CycleState[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [openModule, setOpenModule] = useState<ModuleId | null>(null);
  const [notice, setNotice] = useState('');
  const cycleBase=useRef<unknown>(undefined),historyBase=useRef<unknown>(undefined);

  useEffect(() => {
    queueMicrotask(()=>{
    let saved: CycleState | null = null;
    try {cycleBase.current=parseLocalValue(localStorage.getItem(STORAGE_KEY));historyBase.current=parseLocalValue(localStorage.getItem(HISTORY_KEY));} catch { /* Preserve corrupt storage for manual recovery. */ }
    try { saved = parseCycle(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); } catch { saved = null; }
    try {
      const rawHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as unknown;
      setHistory(Array.isArray(rawHistory) ? rawHistory.map(parseCycle).filter((item): item is CycleState => Boolean(item)).slice(-12) : []);
    } catch { setHistory([]); }
    setHistoryReady(true);
    setCycle(saved ?? initialCycle());
    });
  }, []);

  useEffect(() => {
    if (!cycle) return;
    try {cycleBase.current=persistLocalEditNow(localStorage,STORAGE_KEY,cycleBase.current,cycle);} catch (error) {queueMicrotask(()=>setNotice(error instanceof Error?error.message:'保存失败，原计划已保留。'));}
  }, [cycle]);

  useEffect(() => {
    if (!historyReady) return;
    try {historyBase.current=persistLocalEditNow(localStorage,HISTORY_KEY,historyBase.current,history.slice(-12));} catch (error) {queueMicrotask(()=>setNotice(error instanceof Error?error.message:'历史保存失败，原历史已保留。'));}
  }, [history, historyReady]);

  const completed = useMemo(() => cycle ? MODULES.filter(({ id }) => cycle.modules[id].status === 'done').length : 0, [cycle]);

  function updateModule(id: ModuleId, update: Partial<ModuleState>) {
    setCycle((current) => current ? { ...current, modules: { ...current.modules, [id]: { ...current.modules[id], ...update } } } : current);
  }

  function beginNextCycle() {
    if (!cycle) return;
    setHistory((rows) => [...rows, cycle].slice(-12));
    setCycle({
      cycle: cycle.cycle + 1,
      startedAt: new Date().toISOString(),
      modules: Object.fromEntries(MODULES.map(({ id }) => {
        const previous = cycle.modules[id];
        if (previous.status === 'done') return [id, emptyModule()];
        return [id, { ...previous, status: previous.status === 'todo' ? 'todo' : 'active', carried: true }];
      })) as Record<ModuleId, ModuleState>,
    });
    setNotice('已开始下一轮；未完成模块和记录已自动顺延。');
  }

  if (!cycle) return <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-sm text-[var(--muted-foreground)]">正在读取本轮计划…</section>;

  return <section id="weekly-cycle" className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#0f766e]">Flexible five-module cycle</p>
        <h2 className="mt-2 text-xl font-bold">第 {cycle.cycle} 轮 · 五个弹性模块</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">不绑定星期，也不在网站做真题。每次只完成一个模块；没做完就保留到下一次或顺延到下一轮。</p>
      </div>
      <div className="min-w-44 rounded-2xl bg-teal-50 px-4 py-3 text-teal-950 dark:bg-teal-950/30 dark:text-teal-100">
        <p className="text-sm font-semibold">本轮进度</p>
        <p className="mt-1 text-2xl font-bold">{completed} / 5</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-teal-100 dark:bg-teal-950"><div className="h-full rounded-full bg-[#0f766e] transition-[width]" style={{ width: `${completed * 20}%` }} /></div>
      </div>
    </div>

    <div className="mt-6 grid gap-3 lg:grid-cols-5">
      {MODULES.map((module) => {
        const row = cycle.modules[module.id];
        const statusLabel = row.status === 'done' ? '已完成' : row.status === 'active' ? '进行中' : '未开始';
        return <article key={module.id} className={`rounded-2xl border p-4 ${row.status === 'done' ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20' : row.status === 'active' ? 'border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20' : 'border-[var(--card-border)]'}`}>
          <div className="flex items-start justify-between gap-2"><span className="material-icons-round text-xl text-[#0f766e]">{module.icon}</span>{row.carried ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100">顺延</span> : null}</div>
          <h3 className="mt-3 font-bold">{module.label}</h3>
          <p className="mt-1 min-h-16 text-xs leading-5 text-[var(--muted-foreground)]">{module.purpose}</p>
          <button type="button" onClick={() => setOpenModule(openModule === module.id ? null : module.id)} className="mt-3 w-full rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm font-semibold">{statusLabel} · 记录</button>
        </article>;
      })}
    </div>

    {openModule ? <div className="mt-5 rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 sm:p-5">
      {(() => {
        const meta = MODULES.find((item) => item.id === openModule)!;
        const row = cycle.modules[openModule];
        return <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">{meta.label}模块记录</h3><div className="flex gap-2">{(['todo', 'active', 'done'] as const).map((status) => <button key={status} type="button" aria-pressed={row.status === status} onClick={() => updateModule(openModule, { status, carried: status === 'done' ? false : row.carried })} className={`rounded-lg px-3 py-2 text-xs font-bold ${row.status === status ? 'bg-[#0f766e] text-white' : 'border border-[var(--card-border)]'}`}>{status === 'todo' ? '未开始' : status === 'active' ? '进行中' : '已完成'}</button>)}</div></div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-semibold">雅思哥材料 / 题目<textarea value={row.material} maxLength={200} onChange={(event) => updateModule(openModule, { material: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 font-normal outline-none focus:border-[#0f766e]" placeholder="例如：听力 Test 3；当季口语 Part 2；Task 2 教育题" /></label>
            <label className="text-sm font-semibold">本次证据 / 具体问题<textarea value={row.note} maxLength={500} onChange={(event) => updateModule(openModule, { note: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 font-normal outline-none focus:border-[#0f766e]" placeholder="记录分数、用时、错因，或写作/口语的主要问题" /></label>
            <label className="text-sm font-semibold">下一次只做什么<textarea value={row.nextStep} maxLength={500} onChange={(event) => updateModule(openModule, { nextStep: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 font-normal outline-none focus:border-[#0f766e]" placeholder="只写一个可执行动作；没有完成就继续本模块" /></label>
          </div>
          {openModule === 'writing' ? <Link prefetch={false} href="/ielts-writing" className="inline-flex rounded-xl bg-[#0f766e] px-4 py-2.5 text-sm font-bold text-white">打开写作持续修改工具</Link> : <p className="text-xs text-[var(--muted-foreground)]">真题和录音在雅思哥完成；这里不复制题库，只保留训练证据。</p>}
        </div>;
      })()}
    </div> : null}

    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--card-border)] pt-5">
      <p className="text-xs text-[var(--muted-foreground)]">本轮开始于 {cycle.startedAt.slice(0, 10)}。建议五项完成后再开下一轮；确实来不及时可顺延。</p>
      <button type="button" onClick={beginNextCycle} className="rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm font-bold">开始下一轮</button>
    </div>
    {history.length ? <details className="mt-4 rounded-2xl border border-[var(--card-border)] p-4">
      <summary className="cursor-pointer text-sm font-bold">查看以前各轮记录（{history.length}）</summary>
      <div className="mt-4 space-y-3">{[...history].reverse().slice(0, 6).map((saved) => <article key={`${saved.cycle}-${saved.startedAt}`} className="rounded-xl bg-[var(--background)] p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>第 {saved.cycle} 轮</strong><span className="text-xs text-[var(--muted-foreground)]">{saved.startedAt.slice(0, 10)} · {MODULES.filter(({ id }) => saved.modules[id].status === 'done').length}/5 完成</span></div><ul className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">{MODULES.map(({ id, label }) => { const item = saved.modules[id]; return <li key={id}>· {label}：{item.material || item.note || item.nextStep || '无记录'}</li>; })}</ul></article>)}</div>
    </details> : null}
    {notice ? <p role="status" className="mt-3 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-100">{notice}</p> : null}
  </section>;
}
