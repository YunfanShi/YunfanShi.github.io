'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { workspaceStorage } from '@/lib/sync/repository';

const STORAGE_KEY = 'jackyun_stepwise_recitations_v1';

type StepSequence = {
  id: string;
  title: string;
  subject: string;
  steps: string[];
  updatedAt: string;
};

type View = 'library' | 'edit' | 'recite';

const inputClass = 'min-h-12 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 text-base';
const secondaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--card-border)] px-4 text-sm font-semibold transition-colors hover:bg-black/[.04] dark:hover:bg-white/[.06]';
const primaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1570ef] px-4 text-sm font-bold text-white transition-colors hover:bg-[#175cd3] disabled:cursor-not-allowed disabled:opacity-40';

function normalizeSequence(value: unknown): StepSequence | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StepSequence>;
  if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string' || !Array.isArray(candidate.steps)) return null;
  const steps = candidate.steps.map((step) => String(step).trim()).filter(Boolean);
  if (!candidate.title.trim() || !steps.length) return null;
  return {
    id: candidate.id,
    title: candidate.title.trim(),
    subject: typeof candidate.subject === 'string' ? candidate.subject.trim() : '',
    steps,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '',
  };
}

function readSequences(): StepSequence[] {
  try {
    const saved = JSON.parse(workspaceStorage.getItem(STORAGE_KEY) || '[]') as unknown;
    return Array.isArray(saved) ? saved.flatMap((value) => {
      const sequence = normalizeSequence(value);
      return sequence ? [sequence] : [];
    }) : [];
  } catch {
    return [];
  }
}

function splitSteps(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim().replace(/^\s*(?:(?:step|步骤)\s*)?(?:\d+|[一二三四五六七八九十]+)[.)、．:：-]?\s*/i, '')).filter(Boolean);
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `steps-${Date.now()}`;
}

export default function StepwiseRecallApp() {
  const [sequences, setSequences] = useState<StepSequence[]>([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('library');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [message, setMessage] = useState('');
  const [active, setActive] = useState<StepSequence | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());

  useEffect(() => {
    queueMicrotask(() => {
      setSequences(readSequences());
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      workspaceStorage.setItem(STORAGE_KEY, JSON.stringify(sequences));
    } catch (error) {
      console.error('[stepwise-recall] save failed', error);
      queueMicrotask(() => setMessage('保存失败，请检查设备存储空间后重试。'));
    }
  }, [ready, sequences]);

  function openNew() {
    setEditingId(null);
    setTitle('');
    setSubject('');
    setStepsText('');
    setMessage('');
    setView('edit');
  }

  function openEdit(sequence: StepSequence) {
    setEditingId(sequence.id);
    setTitle(sequence.title);
    setSubject(sequence.subject);
    setStepsText(sequence.steps.join('\n'));
    setMessage('');
    setView('edit');
  }

  function saveSequence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const steps = splitSteps(stepsText);
    if (!title.trim() || !steps.length) {
      setMessage('请填写标题，并至少输入一条内容。');
      return;
    }
    const next: StepSequence = {
      id: editingId || newId(),
      title: title.trim(),
      subject: subject.trim(),
      steps,
      updatedAt: new Date().toISOString(),
    };
    setSequences((current) => [next, ...current.filter((sequence) => sequence.id !== next.id)]);
    setView('library');
    setMessage('已保存。');
  }

  function startReciting(sequence: StepSequence) {
    setActive(sequence);
    setHidden(new Set(sequence.steps.map((_, index) => index)));
    setView('recite');
  }

  function revealNext() {
    if (!active) return;
    const nextIndex = active.steps.findIndex((_, index) => hidden.has(index));
    if (nextIndex < 0) return;
    setHidden((current) => {
      const next = new Set(current);
      next.delete(nextIndex);
      return next;
    });
  }

  function toggleStep(index: number) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function removeSequence(sequence: StepSequence) {
    if (!window.confirm(`删除「${sequence.title}」？此操作无法撤销。`)) return;
    setSequences((current) => current.filter((item) => item.id !== sequence.id));
    setMessage('已删除。');
  }

  if (!ready) return <div className="mx-auto max-w-5xl p-8 text-sm text-[var(--muted-foreground)]">正在读取背诵内容…</div>;

  if (view === 'recite' && active) {
    const revealedCount = active.steps.length - hidden.size;
    const nextIndex = active.steps.findIndex((_, index) => hidden.has(index));
    return <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--card-border)] pb-5">
        <div><button type="button" onClick={() => setView('library')} className="mb-3 text-sm font-semibold text-[#175cd3]">← 返回步骤背诵</button><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{active.title}</h1>{active.subject && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{active.subject}</p>}</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setHidden(new Set(active.steps.map((_, index) => index)))} className={secondaryButton}><span className="material-icons-round text-lg">visibility_off</span>全部隐藏</button>
          <button type="button" onClick={() => setHidden(new Set())} className={secondaryButton}><span className="material-icons-round text-lg">visibility</span>全部显示</button>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-4 text-sm"><span className="font-semibold">已回忆 {revealedCount} / {active.steps.length} 条</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"><div className="h-full rounded-full bg-[#12b76a] transition-all" style={{ width: `${(revealedCount / active.steps.length) * 100}%` }} /></div></div>
      <ol className="mt-6 space-y-3">
        {active.steps.map((step, index) => <li key={`${index}-${step}`}>
          <button type="button" onClick={() => toggleStep(index)} aria-pressed={!hidden.has(index)} aria-label={`${hidden.has(index) ? '显示' : '隐藏'}第 ${index + 1} 条`} className="flex min-h-20 w-full items-start gap-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-colors hover:border-[#84adff] sm:items-center sm:p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf2ff] text-base font-bold text-[#175cd3] dark:bg-[#1b3152]">{index + 1}</span>
            {hidden.has(index) ? <span className="flex min-h-10 flex-1 items-center gap-2 text-sm text-[var(--muted-foreground)]"><span className="material-icons-round text-lg">visibility_off</span>点击显示第 {index + 1} 条</span> : <span className="flex-1 whitespace-pre-wrap text-base leading-7 text-[var(--foreground)] sm:text-lg">{step}</span>}
          </button>
        </li>)}
      </ol>
      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">先按顺序回想内容，再逐条核对。</p>
        <button type="button" onClick={revealNext} disabled={nextIndex < 0} className={`${primaryButton} min-w-48`}><span className="material-icons-round text-lg">arrow_downward</span>{nextIndex < 0 ? '全部已显示' : `显示第 ${nextIndex + 1} 条`}</button>
      </div>
    </div>;
  }

  return <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--card-border)] pb-5">
      <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Ordered recall</p><h1 className="mt-1 text-3xl font-bold tracking-tight">步骤背诵</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">把定义要点、操作流程或课文内容拆成有顺序的条目。背诵时逐条回想，再揭示核对。</p></div>
      {view === 'library' && <button type="button" onClick={openNew} className={primaryButton}><span className="material-icons-round text-lg">add</span>新建背诵内容</button>}
    </header>

    {message && view === 'library' && <p role="status" className="mt-4 rounded-xl bg-[#ecfdf3] px-4 py-3 text-sm text-[#067647]">{message}</p>}

    {view === 'edit' ? <form onSubmit={saveSequence} className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]">
      <section className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-6">
        <div><label htmlFor="stepwise-title" className="mb-1.5 block text-sm font-semibold">标题</label><input id="stepwise-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder="例如：激光打印机的打印流程" className={inputClass} /></div>
        <div><label htmlFor="stepwise-subject" className="mb-1.5 block text-sm font-semibold">科目或分类 <span className="font-normal text-[var(--muted-foreground)]">（可选）</span></label><input id="stepwise-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={80} placeholder="例如：Computer Science · Printers" className={inputClass} /></div>
        <div><label htmlFor="stepwise-content" className="mb-1.5 block text-sm font-semibold">按顺序输入内容</label><textarea id="stepwise-content" value={stepsText} onChange={(event) => setStepsText(event.target.value)} required rows={12} placeholder={'每行一条，按背诵顺序排列。\n可粘贴编号清单，例如：\n1. 接收打印作业\n2. 解释器将数据转换为打印机语言'} className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4 text-base leading-7" /><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">每个非空行会成为一条。行首的 1.、2、Step 1、步骤一编号会自动去掉，显示序号由工具添加。</p></div>
        {message && <p role="alert" className="text-sm text-[#b42318]">{message}</p>}
        <div className="flex flex-wrap gap-2"><button type="submit" className={primaryButton}><span className="material-icons-round text-lg">save</span>保存内容</button><button type="button" onClick={() => { setView('library'); setMessage(''); }} className={secondaryButton}>取消</button></div>
      </section>
      <aside className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-5 sm:p-6"><h2 className="text-lg font-bold">适合哪些内容</h2><ul className="mt-3 space-y-3 text-sm leading-6 text-[var(--muted-foreground)]"><li><b className="text-[var(--foreground)]">多条定义：</b>每一行写一个定义要点，统一放在同一标题下。</li><li><b className="text-[var(--foreground)]">操作流程：</b>依实际先后顺序写步骤，背诵时逐条揭示。</li><li><b className="text-[var(--foreground)]">语文课文：</b>按段落、句子或记忆提示拆分，使用熟悉的遮挡方式。</li></ul><div className="mt-5 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[var(--muted-foreground)]">示例格式</p><pre className="mt-2 whitespace-pre-wrap text-sm leading-6">{'打印机接收数据\n解释器将数据转换为打印机语言\n打印机在纸张上形成图像'}</pre></div></aside>
    </form> : <section className="mt-6">
      {sequences.length ? <div className="grid gap-3 sm:grid-cols-2">{sequences.map((sequence) => <article key={sequence.id} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{sequence.title}</h2>{sequence.subject && <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">{sequence.subject}</p>}</div><span className="shrink-0 rounded-lg bg-[#eaf2ff] px-2.5 py-1 text-xs font-bold text-[#175cd3] dark:bg-[#1b3152]">{sequence.steps.length} 条</span></div>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--muted-foreground)]">{sequence.steps.slice(0, 2).join(' · ')}{sequence.steps.length > 2 ? ' …' : ''}</p>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => startReciting(sequence)} className={primaryButton}><span className="material-icons-round text-lg">play_arrow</span>开始背诵</button><button type="button" onClick={() => openEdit(sequence)} className={secondaryButton}>编辑</button><button type="button" onClick={() => removeSequence(sequence)} aria-label={`删除 ${sequence.title}`} className={`${secondaryButton} text-[#b42318]`}>删除</button></div>
      </article>)}</div> : <div className="rounded-2xl border border-dashed border-[var(--card-border)] bg-[var(--card)] px-6 py-12 text-center"><span className="material-icons-round text-4xl text-[#98a2b3]">format_list_numbered</span><h2 className="mt-3 text-lg font-bold">还没有背诵内容</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--muted-foreground)]">新建一组内容，把多个定义要点或操作流程按行贴入，然后用逐条遮挡的方式练习。</p><button type="button" onClick={openNew} className={`${primaryButton} mt-5`}><span className="material-icons-round text-lg">add</span>新建第一组</button></div>}
    </section>}
  </div>;
}
