'use client';

import { useEffect, useMemo, useState } from 'react';
import { callAiApi } from '@/lib/ai-config';
import { parseAiJson, readAiResponseContent } from '@/lib/ai-json';
import {
  createDefinitionCard,
  dueDefinitionCards,
  isDefinitionCard,
  parseDefinitionCards,
  scheduleDefinitionCard,
  type DefinitionCard,
  type DefinitionCardDraft,
  type ReviewRating,
} from '@/lib/definition-cards';

type View = 'home' | 'review' | 'library' | 'import';
type ImportMode = 'standard' | 'ai';

const STORAGE_KEY = 'jackyun_definition_cards_v1';
const EXAMPLE = `Drawing object: Contains shapes, text and images
Canvas - Contains drawing objects
Layer — Groups related drawing objects`;

const RATINGS: Array<{ id: ReviewRating; label: string; hint: string; tone: string }> = [
  { id: 'again', label: '忘了', hint: '10 分钟', tone: 'border-[#fca5a5] text-[#b42318] hover:bg-[#fef2f2]' },
  { id: 'hard', label: '困难', hint: '约 1 天', tone: 'border-[#fdba74] text-[#b54708] hover:bg-[#fff7ed]' },
  { id: 'good', label: '记得', hint: '正常间隔', tone: 'border-[#86efac] text-[#15803d] hover:bg-[#f0fdf4]' },
  { id: 'easy', label: '简单', hint: '更长间隔', tone: 'border-[#93c5fd] text-[#175cd3] hover:bg-[#eff8ff]' },
];

function readStoredCards(): DefinitionCard[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as unknown;
    return Array.isArray(value) ? value.filter(isDefinitionCard) : [];
  } catch { return []; }
}

function dateLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.getTime() <= today.getTime()) return '现在';
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export default function DefinitionCardsApp() {
  const [cards, setCards] = useState<DefinitionCard[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>('home');
  const [importMode, setImportMode] = useState<ImportMode>('standard');
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<DefinitionCardDraft[]>([]);
  const [message, setMessage] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [reviewQueue, setReviewQueue] = useState<DefinitionCard[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [sessionDone, setSessionDone] = useState(0);

  useEffect(() => {
    queueMicrotask(() => { setCards(readStoredCards()); setHydrated(true); });
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cards)); }
    catch (error) { console.error('[definition-cards] Unable to persist local deck', error); }
  }, [cards, hydrated]);

  const dueCards = useMemo(() => dueDefinitionCards(cards), [cards]);
  const mastered = cards.filter((card) => card.intervalDays >= 21).length;
  const filteredCards = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return cards;
    return cards.filter((card) => `${card.term}\n${card.definition}\n${card.note}`.toLocaleLowerCase().includes(needle));
  }, [cards, query]);
  const current = reviewQueue[0];

  function openImport(mode: ImportMode) {
    setImportMode(mode);
    setSource('');
    setPreview([]);
    setMessage('');
    setView('import');
  }

  function previewStandard(text = source) {
    const parsed = parseDefinitionCards(text);
    setPreview(parsed);
    setMessage(parsed.length ? `识别到 ${parsed.length} 张卡片，请确认后导入。` : '没有识别到完整卡片。请检查每行是否包含术语和定义。');
  }

  async function generateWithAi() {
    if (!source.trim()) { setMessage('请先粘贴讲义、笔记或概念列表。'); return; }
    setAiBusy(true);
    setMessage('AI 正在提取适合背诵的定义…');
    try {
      const response = await callAiApi([
        { role: 'system', content: 'You convert study notes into concise definition flashcards. Return only valid JSON in the form {"cards":[{"term":"...","definition":"...","note":"..."}]}. Keep important qualifiers. Split compound ideas into atomic cards. Do not invent facts.' },
        { role: 'user', content: `从以下材料提取定义卡片。术语放 term，必须背出的定义放 definition，可选例子放 note。\n\n${source}` },
      ], { temperature: 0.1, maxTokens: 2400, noThinking: true, feature: 'chat' });
      const content = await readAiResponseContent(response);
      const parsed = parseDefinitionCards(JSON.stringify(parseAiJson(content)));
      if (!parsed.length) throw new Error('AI 没有返回有效卡片。');
      setPreview(parsed);
      setMessage(`AI 生成了 ${parsed.length} 张卡片，请确认后导入。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI 导入失败，请稍后重试。');
    } finally { setAiBusy(false); }
  }

  function importPreview() {
    if (!preview.length) return;
    const existing = new Set(cards.map((card) => `${card.term.toLocaleLowerCase()}\u0000${card.definition.toLocaleLowerCase()}`));
    const unique = preview.filter((card) => !existing.has(`${card.term.toLocaleLowerCase()}\u0000${card.definition.toLocaleLowerCase()}`));
    const now = new Date();
    setCards((currentCards) => [...unique.map((draft, index) => createDefinitionCard(draft, new Date(now.getTime() + index))), ...currentCards]);
    setSource('');
    setPreview([]);
    setMessage(unique.length ? `已导入 ${unique.length} 张卡片，重复项已自动跳过。` : '这些卡片已经在卡组中。');
    setView('home');
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) { setMessage('文件不能超过 1 MB。'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setSource(text);
      previewStandard(text);
    };
    reader.onerror = () => setMessage('无法读取该文件。');
    reader.readAsText(file);
  }

  function startReview() {
    const queue = dueDefinitionCards(cards);
    setReviewQueue(queue);
    setSessionDone(0);
    setRevealed(false);
    setView('review');
  }

  function rate(rating: ReviewRating) {
    if (!current) return;
    const updated = scheduleDefinitionCard(current, rating);
    setCards((items) => items.map((card) => card.id === current.id ? updated : card));
    setReviewQueue((queue) => queue.slice(1));
    setSessionDone((count) => count + 1);
    setRevealed(false);
  }

  function removeCard(id: string) {
    setCards((items) => items.filter((card) => card.id !== id));
  }

  if (!hydrated) return <div className="grid min-h-[55vh] place-items-center text-sm text-[var(--muted-foreground)]"><span className="material-icons-round animate-spin">progress_activity</span></div>;

  return <div className="mx-auto w-full max-w-6xl pb-12">
    <header className="overflow-hidden rounded-[28px] border border-[#d7e3f0] bg-[linear-gradient(125deg,#f0f9ff_0%,#f8fafc_55%,#fff7ed_100%)] p-5 shadow-sm dark:border-[#344054] dark:bg-[linear-gradient(125deg,#102a43_0%,#172033_55%,#322417_100%)] sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[#026aa2] dark:text-[#7dd3fc]"><span className="material-icons-round text-lg">style</span>Definition Deck</div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">把定义背牢，而不是只看熟</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">像 Anki 一样主动回忆，支持你的自然格式、CSV / TSV / JSON 文件，也能让 AI 从笔记里自动拆卡。</p></div>
        <button type="button" onClick={() => openImport('standard')} className="min-h-12 shrink-0 rounded-2xl bg-[#1570ef] px-5 text-sm font-bold text-white shadow-lg shadow-blue-900/15 hover:bg-[#175cd3]"><span className="material-icons-round mr-2 align-middle text-xl">add</span>导入卡片</button>
      </div>
    </header>

    <nav className="my-5 flex gap-1 overflow-x-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-1.5" aria-label="定义卡片页面">
      {([['home', 'space_dashboard', '总览'], ['review', 'school', '开始背诵'], ['library', 'view_list', '卡片库'], ['import', 'upload_file', '导入']] as const).map(([id, icon, label]) => <button key={id} type="button" onClick={() => id === 'review' ? startReview() : id === 'import' ? openImport('standard') : setView(id)} className={`flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold ${view === id ? 'bg-[#eaf2ff] text-[#175cd3] dark:bg-[#17345b] dark:text-[#84adff]' : 'text-[var(--muted-foreground)] hover:bg-black/5 dark:hover:bg-white/5'}`}><span className="material-icons-round text-lg">{icon}</span>{label}</button>)}
    </nav>

    {message && view !== 'import' && <p role="status" className="mb-5 rounded-2xl border border-[#b2ddff] bg-[#eff8ff] px-4 py-3 text-sm text-[#175cd3] dark:border-[#184a7a] dark:bg-[#102a43] dark:text-[#84caff]">{message}</p>}

    {view === 'home' && <HomeView cards={cards.length} due={dueCards.length} mastered={mastered} onReview={startReview} onStandard={() => openImport('standard')} onAi={() => openImport('ai')} />}
    {view === 'review' && <ReviewView card={current} revealed={revealed} completed={sessionDone} total={sessionDone + reviewQueue.length} onReveal={() => setRevealed(true)} onRate={rate} onFinish={() => setView('home')} />}
    {view === 'library' && <LibraryView cards={filteredCards} query={query} onQuery={setQuery} onDelete={removeCard} />}
    {view === 'import' && <ImportView mode={importMode} source={source} preview={preview} message={message} busy={aiBusy} onMode={(mode) => { setImportMode(mode); setPreview([]); setMessage(''); }} onSource={setSource} onPreview={() => previewStandard()} onAi={() => void generateWithAi()} onFile={handleFile} onConfirm={importPreview} />}
  </div>;
}

function HomeView({ cards, due, mastered, onReview, onStandard, onAi }: { cards: number; due: number; mastered: number; onReview: () => void; onStandard: () => void; onAi: () => void }) {
  const stats = [{ label: '全部卡片', value: cards, icon: 'library_books', color: '#1570ef' }, { label: '今天待复习', value: due, icon: 'notifications_active', color: '#f79009' }, { label: '长期记忆', value: mastered, icon: 'verified', color: '#12b76a' }];
  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-3">{stats.map((stat) => <article key={stat.label} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5"><span className="material-icons-round" style={{ color: stat.color }}>{stat.icon}</span><p className="mt-4 text-3xl font-bold">{stat.value}</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">{stat.label}</p></article>)}</section>
    <section className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
      <article className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-7"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#f79009]">Today</p><h2 className="mt-2 text-2xl font-bold">{due ? `${due} 张卡片在等你` : cards ? '今天的复习完成了' : '先建立第一副卡组'}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">先看术语，在脑中说出完整定义，再翻面评分。系统会根据记忆强度安排下一次出现。</p><button type="button" disabled={!due} onClick={onReview} className="mt-6 min-h-12 rounded-2xl bg-[#f79009] px-6 text-sm font-bold text-white shadow-lg shadow-orange-900/15 disabled:cursor-not-allowed disabled:opacity-40"><span className="material-icons-round mr-2 align-middle">play_arrow</span>{due ? '开始本轮背诵' : '暂无待复习'}</button></article>
      <article className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-7"><h2 className="text-lg font-bold">两种快速导入</h2><button type="button" onClick={onStandard} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-[var(--card-border)] p-4 text-left hover:border-[#84adff]"><span className="material-icons-round text-[#1570ef]">data_object</span><span><b className="block text-sm">标准格式</b><small className="text-[var(--muted-foreground)]">冒号、横线、CSV、JSON</small></span></button><button type="button" onClick={onAi} className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-[var(--card-border)] p-4 text-left hover:border-[#c3b5fd]"><span className="material-icons-round text-[#7f56d9]">auto_awesome</span><span><b className="block text-sm">AI 从笔记生成</b><small className="text-[var(--muted-foreground)]">自动拆分为原子定义</small></span></button></article>
    </section>
  </div>;
}

function ReviewView({ card, revealed, completed, total, onReveal, onRate, onFinish }: { card?: DefinitionCard; revealed: boolean; completed: number; total: number; onReveal: () => void; onRate: (rating: ReviewRating) => void; onFinish: () => void }) {
  if (!card) return <section className="mx-auto max-w-2xl rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center sm:p-12"><span className="material-icons-round text-5xl text-[#12b76a]">task_alt</span><h2 className="mt-4 text-2xl font-bold">本轮完成</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">完成 {completed} 张。间隔会随着你每次的真实反馈调整。</p><button type="button" onClick={onFinish} className="mt-6 min-h-11 rounded-xl bg-[#1570ef] px-5 text-sm font-bold text-white">返回总览</button></section>;
  return <section className="mx-auto max-w-3xl"><div className="mb-3 flex items-center justify-between text-xs font-semibold text-[var(--muted-foreground)]"><span>本轮 {completed + 1} / {total}</span><span>先回忆，再翻面</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#e4e7ec]"><div className="h-full rounded-full bg-[#1570ef] transition-all" style={{ width: `${total ? (completed / total) * 100 : 0}%` }} /></div>
    <article className="mt-5 flex min-h-[360px] flex-col rounded-[32px] border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-[0_18px_50px_rgba(16,24,40,.08)] sm:min-h-[430px] sm:p-10"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#667085]">术语</p><h2 className="mt-5 text-center text-3xl font-bold leading-tight sm:text-5xl">{card.term}</h2><div className="my-8 flex-1 border-t border-dashed border-[var(--card-border)] pt-8">{revealed ? <div className="animate-[fadeIn_.2s_ease-out]"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#1570ef]">定义</p><p className="mt-4 text-xl leading-8 sm:text-2xl">{card.definition}</p>{card.note && <p className="mt-5 rounded-2xl bg-[var(--background)] p-4 text-sm leading-6 text-[var(--muted-foreground)]">{card.note}</p>}</div> : <button type="button" onClick={onReveal} className="grid min-h-36 w-full place-items-center rounded-2xl border-2 border-dashed border-[#b2ccff] text-sm font-bold text-[#175cd3] hover:bg-[#eff8ff] dark:border-[#28598a] dark:hover:bg-[#102a43]"><span><span className="material-icons-round mr-2 align-middle">visibility</span>显示定义</span></button>}</div>
      {revealed && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{RATINGS.map((rating) => <button key={rating.id} type="button" onClick={() => onRate(rating.id)} className={`min-h-14 rounded-xl border-2 text-sm font-bold ${rating.tone}`}><span className="block">{rating.label}</span><small className="font-normal opacity-75">{rating.hint}</small></button>)}</div>}
    </article></section>;
}

function LibraryView({ cards, query, onQuery, onDelete }: { cards: DefinitionCard[]; query: string; onQuery: (value: string) => void; onDelete: (id: string) => void }) {
  return <section><label className="relative block"><span className="material-icons-round absolute left-4 top-3.5 text-[var(--muted-foreground)]">search</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索术语或定义…" className="min-h-12 w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card)] pl-12 pr-4 outline-none focus:border-[#1570ef] focus:ring-4 focus:ring-[#1570ef]/10" /></label><div className="mt-4 space-y-3">{cards.map((card) => <article key={card.id} className="group flex items-start gap-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5"><div className="min-w-0 flex-1"><h3 className="font-bold">{card.term}</h3><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{card.definition}</p>{card.note && <p className="mt-2 text-xs text-[var(--muted-foreground)]">备注：{card.note}</p>}<p className="mt-3 text-[11px] font-semibold text-[#667085]">下次：{dateLabel(card.dueAt)} · 间隔 {card.intervalDays || 0} 天 · 复习 {card.repetitions} 次</p></div><button type="button" onClick={() => onDelete(card.id)} aria-label={`删除 ${card.term}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#98a2b3] hover:bg-[#fef3f2] hover:text-[#d92d20]"><span className="material-icons-round">delete_outline</span></button></article>)}{!cards.length && <div className="rounded-3xl border border-dashed border-[var(--card-border)] p-10 text-center text-sm text-[var(--muted-foreground)]">没有找到卡片。</div>}</div></section>;
}

function ImportView({ mode, source, preview, message, busy, onMode, onSource, onPreview, onAi, onFile, onConfirm }: { mode: ImportMode; source: string; preview: DefinitionCardDraft[]; message: string; busy: boolean; onMode: (mode: ImportMode) => void; onSource: (value: string) => void; onPreview: () => void; onAi: () => void; onFile: (file?: File) => void; onConfirm: () => void }) {
  return <section className="grid gap-5 lg:grid-cols-[1fr_.9fr]"><article className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-7"><div className="flex rounded-xl bg-[var(--background)] p-1"><button type="button" onClick={() => onMode('standard')} className={`min-h-10 flex-1 rounded-lg text-sm font-bold ${mode === 'standard' ? 'bg-[var(--card)] text-[#175cd3] shadow-sm' : 'text-[var(--muted-foreground)]'}`}>标准格式</button><button type="button" onClick={() => onMode('ai')} className={`min-h-10 flex-1 rounded-lg text-sm font-bold ${mode === 'ai' ? 'bg-[var(--card)] text-[#6941c6] shadow-sm' : 'text-[var(--muted-foreground)]'}`}>AI 导入</button></div><h2 className="mt-6 text-xl font-bold">{mode === 'standard' ? '粘贴或上传卡片' : '粘贴原始学习材料'}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{mode === 'standard' ? '每行一张卡。支持冒号、两侧带空格的横线、双冒号、CSV、TSV 和 JSON。' : 'AI 会保留限定条件，把长笔记拆成适合主动回忆的短卡片。生成后仍由你确认。'}</p><textarea value={source} onChange={(event) => onSource(event.target.value)} rows={12} placeholder={mode === 'standard' ? EXAMPLE : '粘贴课堂笔记、讲义或一段需要记忆的文本…'} className="mt-5 w-full resize-y rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 text-sm leading-6 outline-none focus:border-[#1570ef] focus:ring-4 focus:ring-[#1570ef]/10" />
    <div className="mt-3 flex flex-wrap gap-2">{mode === 'standard' && <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-[var(--card-border)] px-4 text-sm font-bold hover:bg-black/5"><span className="material-icons-round mr-2 text-lg">attach_file</span>选择文件<input type="file" accept=".txt,.md,.csv,.tsv,.json,text/plain,text/csv,application/json" className="sr-only" onChange={(event) => onFile(event.target.files?.[0])} /></label>}<button type="button" disabled={busy || !source.trim()} onClick={mode === 'standard' ? onPreview : onAi} className={`min-h-11 flex-1 rounded-xl px-5 text-sm font-bold text-white disabled:opacity-40 ${mode === 'standard' ? 'bg-[#1570ef]' : 'bg-[#7f56d9]'}`}>{busy ? <><span className="material-icons-round mr-2 animate-spin align-middle text-lg">progress_activity</span>正在生成</> : mode === 'standard' ? '解析并预览' : <><span className="material-icons-round mr-2 align-middle text-lg">auto_awesome</span>生成定义卡</>}</button></div>
    <details className="mt-5 rounded-2xl border border-[var(--card-border)] p-4"><summary className="cursor-pointer text-sm font-bold">查看标准格式示例</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-[var(--background)] p-3 text-xs leading-6">{EXAMPLE}{'\n'}Term,Definition,Note{'\n'}Object,A thing that can be seen or touched,Optional note</pre></details></article>
    <aside className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-7"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">导入预览</h2><span className="rounded-full bg-[#eff8ff] px-3 py-1 text-xs font-bold text-[#175cd3] dark:bg-[#102a43] dark:text-[#84caff]">{preview.length} 张</span></div>{message && <p role="status" className="mt-4 rounded-xl bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--muted-foreground)]">{message}</p>}<div className="mt-4 max-h-[440px] space-y-2 overflow-y-auto">{preview.map((card, index) => <div key={`${card.term}-${index}`} className="rounded-2xl border border-[var(--card-border)] p-4"><p className="text-sm font-bold">{card.term}</p><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{card.definition}</p>{card.note && <p className="mt-2 text-xs text-[#667085]">{card.note}</p>}</div>)}{!preview.length && <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-[var(--card-border)] text-center text-sm leading-6 text-[var(--muted-foreground)]"><span><span className="material-icons-round mb-2 block text-3xl">preview</span>解析后的卡片会显示在这里</span></div>}</div><button type="button" disabled={!preview.length} onClick={onConfirm} className="mt-5 min-h-12 w-full rounded-xl bg-[#12b76a] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><span className="material-icons-round mr-2 align-middle text-lg">library_add</span>确认导入 {preview.length || ''}</button></aside></section>;
}
