'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { EXAMPLE_PROPERTY_DECK, normalizePropertyDeck, propertyPrompts, type PropertyDeck } from '@/lib/property-decks';

const STORAGE_KEY = 'jackyun_property_decks_v1';

function makeId(prefix: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`;
}

function readDecks(): PropertyDeck[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as unknown;
    if (!Array.isArray(stored)) return [EXAMPLE_PROPERTY_DECK];
    const decks = stored.flatMap((entry) => {
      const deck = normalizePropertyDeck(entry);
      return deck ? [deck] : [];
    });
    return decks.length ? decks : [EXAMPLE_PROPERTY_DECK];
  } catch {
    return [EXAMPLE_PROPERTY_DECK];
  }
}

export default function PropertyDecksApp() {
  const [decks, setDecks] = useState<PropertyDeck[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [ready, setReady] = useState(false);
  const [studying, setStudying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const saved = readDecks();
      setDecks(saved);
      setSelectedId(saved[0]?.id ?? '');
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(decks)); } catch (error) { console.error('[property-decks] save failed', error); }
  }, [decks, ready]);

  const deck = decks.find((entry) => entry.id === selectedId) ?? decks[0];
  const prompts = useMemo(() => deck ? propertyPrompts(deck) : [], [deck]);
  const prompt = prompts[cursor];

  useEffect(() => {
    if (!studying) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setRevealed((value) => !value); }
      if (event.key === 'ArrowLeft') { setCursor((value) => Math.max(0, value - 1)); setRevealed(false); }
      if (event.key === 'ArrowRight') { setCursor((value) => Math.min(prompts.length - 1, value + 1)); setRevealed(false); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [prompts.length, studying]);

  function updateDeck(change: (current: PropertyDeck) => PropertyDeck) {
    if (!deck) return;
    setDecks((current) => current.map((entry) => entry.id === deck.id ? change(entry) : entry));
  }

  function createDeck() {
    const id = makeId('deck');
    const next: PropertyDeck = {
      id,
      title: '新的性质对比',
      items: ['对象 A', '对象 B', '对象 C'],
      properties: [{ id: makeId('row'), label: '性质 1', values: ['', '', ''] }],
      createdAt: new Date().toISOString(),
    };
    setDecks((current) => [next, ...current]);
    setSelectedId(id);
  }

  function deleteDeck() {
    if (!deck || !confirm(`确定删除「${deck.title}」吗？`)) return;
    const next = decks.filter((entry) => entry.id !== deck.id);
    setDecks(next);
    setSelectedId(next[0]?.id ?? '');
    setStudying(false);
  }

  function addItem() {
    updateDeck((current) => ({ ...current, items: [...current.items, `对象 ${current.items.length + 1}`], properties: current.properties.map((row) => ({ ...row, values: [...row.values, ''] })) }));
  }

  function removeItem(index: number) {
    if (!deck || deck.items.length <= 1) return;
    updateDeck((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index), properties: current.properties.map((row) => ({ ...row, values: row.values.filter((_, itemIndex) => itemIndex !== index) })) }));
  }

  function addProperty() {
    updateDeck((current) => ({ ...current, properties: [...current.properties, { id: makeId('row'), label: `性质 ${current.properties.length + 1}`, values: current.items.map(() => '') }] }));
  }

  function startStudy() {
    setCursor(0);
    setRevealed(false);
    setStudying(true);
  }

  if (!ready) return <div className="min-h-72 animate-pulse rounded-3xl bg-[var(--card)]" />;

  return (
    <div className="page-enter mx-auto max-w-[1280px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--card-border)] pb-7">
        <div>
          <Link href="/memory" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"><span className="material-icons-round text-lg">arrow_back</span>记忆 Memory</Link>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#b06000]">Compare to remember</p>
          <h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">性质对比</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">横向放对象，纵向放性质；编辑好表格后逐格翻页背诵。</p>
        </div>
        <button type="button" onClick={createDeck} className="min-h-11 rounded-xl bg-[#175cd3] px-5 font-medium text-white">+ 新建表格</button>
      </div>

      {studying && deck && prompt ? (
        <StudyView deck={deck} prompt={prompt} cursor={cursor} total={prompts.length} revealed={revealed} onReveal={() => setRevealed((value) => !value)} onPrevious={() => { setCursor((value) => Math.max(0, value - 1)); setRevealed(false); }} onNext={() => { setCursor((value) => Math.min(prompts.length - 1, value + 1)); setRevealed(false); }} onRetry={() => setRevealed(false)} onClose={() => setStudying(false)} />
      ) : deck ? (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {decks.map((entry) => <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)} className={`min-h-10 rounded-xl border px-4 text-sm font-medium ${entry.id === deck.id ? 'border-[#175cd3] bg-[#eaf2ff] text-[#175cd3] dark:bg-[#102a43]' : 'border-[var(--card-border)] bg-[var(--card)]'}`}>{entry.title}</button>)}
          </div>
          <Editor deck={deck} onUpdate={updateDeck} onAddItem={addItem} onRemoveItem={removeItem} onAddProperty={addProperty} onDelete={deleteDeck} onStudy={startStudy} />
        </>
      ) : (
        <button type="button" onClick={createDeck} className="min-h-56 w-full rounded-3xl border-2 border-dashed border-[var(--card-border)] text-[var(--muted-foreground)]">建立第一张性质对比表</button>
      )}
    </div>
  );
}

function Editor({ deck, onUpdate, onAddItem, onRemoveItem, onAddProperty, onDelete, onStudy }: { deck: PropertyDeck; onUpdate: (change: (current: PropertyDeck) => PropertyDeck) => void; onAddItem: () => void; onRemoveItem: (index: number) => void; onAddProperty: () => void; onDelete: () => void; onStudy: () => void }) {
  const input = 'w-full min-w-32 rounded-lg border border-transparent bg-transparent px-2 py-2 text-sm outline-none hover:border-[var(--card-border)] focus:border-[#175cd3] focus:bg-[var(--background)]';
  return <section className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] p-4 sm:p-5">
      <input aria-label="表格名称" value={deck.title} onChange={(event) => onUpdate((current) => ({ ...current, title: event.target.value }))} className="min-w-0 flex-1 bg-transparent text-xl font-medium outline-none" />
      <div className="flex gap-2"><button type="button" onClick={onDelete} className="min-h-10 rounded-xl border border-[var(--card-border)] px-4 text-sm text-[#b42318]">删除</button><button type="button" onClick={onStudy} className="min-h-10 rounded-xl bg-[#188038] px-5 text-sm font-medium text-white">开始背诵</button></div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] border-collapse">
        <thead><tr className="bg-[var(--background)]"><th className="w-48 border-b border-r border-[var(--card-border)] p-3 text-left text-xs uppercase tracking-wider text-[var(--muted-foreground)]">性质 / 对象</th>{deck.items.map((item, index) => <th key={index} className="border-b border-r border-[var(--card-border)] p-2 last:border-r-0"><div className="flex items-center gap-1"><input aria-label={`对象 ${index + 1}`} value={item} onChange={(event) => onUpdate((current) => ({ ...current, items: current.items.map((value, itemIndex) => itemIndex === index ? event.target.value : value) }))} className={`${input} text-center font-bold uppercase`} /><button type="button" disabled={deck.items.length <= 1} onClick={() => onRemoveItem(index)} aria-label={`删除对象 ${item}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-[#fef3f2] hover:text-[#b42318] disabled:opacity-20"><span className="material-icons-round text-lg">close</span></button></div></th>)}</tr></thead>
        <tbody>{deck.properties.map((row, rowIndex) => <tr key={row.id}><th className="border-b border-r border-[var(--card-border)] p-2 text-left"><div className="flex items-center gap-1"><input aria-label={`性质 ${rowIndex + 1}`} value={row.label} onChange={(event) => onUpdate((current) => ({ ...current, properties: current.properties.map((value) => value.id === row.id ? { ...value, label: event.target.value } : value) }))} className={`${input} font-medium`} /><button type="button" disabled={deck.properties.length <= 1} onClick={() => onUpdate((current) => ({ ...current, properties: current.properties.filter((value) => value.id !== row.id) }))} aria-label={`删除性质 ${row.label}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)] hover:text-[#b42318] disabled:opacity-20"><span className="material-icons-round text-lg">delete_outline</span></button></div></th>{deck.items.map((_, itemIndex) => <td key={itemIndex} className="border-b border-r border-[var(--card-border)] p-2 last:border-r-0"><textarea aria-label={`${deck.items[itemIndex]} 的 ${row.label}`} rows={2} value={row.values[itemIndex] ?? ''} onChange={(event) => onUpdate((current) => ({ ...current, properties: current.properties.map((value) => value.id === row.id ? { ...value, values: value.values.map((cell, valueIndex) => valueIndex === itemIndex ? event.target.value : cell) } : value) }))} className={`${input} resize-none`} placeholder="填写性质…" /></td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="flex flex-wrap gap-2 p-4"><button type="button" onClick={onAddProperty} className="min-h-10 rounded-xl border border-[var(--card-border)] px-4 text-sm font-medium">+ 添加性质</button><button type="button" onClick={onAddItem} className="min-h-10 rounded-xl border border-[var(--card-border)] px-4 text-sm font-medium">+ 添加对象</button><span className="ml-auto self-center text-xs text-[var(--muted-foreground)]">内容自动保存在此浏览器</span></div>
  </section>;
}

function StudyView({ deck, prompt, cursor, total, revealed, onReveal, onPrevious, onNext, onRetry, onClose }: { deck: PropertyDeck; prompt: ReturnType<typeof propertyPrompts>[number]; cursor: number; total: number; revealed: boolean; onReveal: () => void; onPrevious: () => void; onNext: () => void; onRetry: () => void; onClose: () => void }) {
  const atEnd = cursor === total - 1;
  return <section className="mx-auto max-w-4xl">
    <div className="mb-4 flex items-center justify-between gap-3 text-sm text-[var(--muted-foreground)]"><span>{cursor + 1} / {total} · {deck.title}</span><button type="button" onClick={onClose} className="rounded-xl border border-[var(--card-border)] px-4 py-2">返回表格</button></div>
    <button type="button" onClick={onReveal} aria-pressed={revealed} className="flex min-h-[420px] w-full flex-col items-center justify-center rounded-[28px] border border-[var(--card-border)] bg-[var(--card)] p-7 text-center shadow-lg transition-transform active:scale-[.995]">
      <span className="rounded-full bg-[#fef3c7] px-4 py-2 text-xs font-bold uppercase tracking-[.14em] text-[#92400e]">{prompt.property}</span>
      <h2 className="mt-7 text-4xl font-bold uppercase tracking-tight sm:text-6xl">{prompt.item}</h2>
      {revealed ? <div className="mt-9 w-full max-w-2xl border-t border-dashed border-[var(--card-border)] pt-9"><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--muted-foreground)]">答案</p><p className="mt-3 text-2xl font-medium leading-relaxed sm:text-4xl">{prompt.answer || '（未填写）'}</p></div> : <p className="mt-10 text-sm text-[var(--muted-foreground)]">先在心里回答，然后点击卡片或按空格揭示</p>}
    </button>
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><button type="button" disabled={cursor === 0} onClick={onPrevious} className="min-h-12 rounded-xl border border-[var(--card-border)] font-medium disabled:opacity-30">← 上一项</button>{revealed ? <button type="button" onClick={onRetry} className="min-h-12 rounded-xl border border-[#f59e0b] font-medium text-[#b06000]">没记住，再背一次</button> : <button type="button" onClick={onReveal} className="min-h-12 rounded-xl border border-[#175cd3] font-medium text-[#175cd3]">显示答案</button>}<button type="button" disabled={atEnd} onClick={onNext} className="col-span-2 min-h-12 rounded-xl bg-[#175cd3] font-medium text-white disabled:opacity-30">{atEnd ? '已经是最后一项' : '下一项 →'}</button></div>
  </section>;
}
