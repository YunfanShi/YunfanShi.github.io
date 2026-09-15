'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { callAiApi } from '@/lib/ai-config';
import { parseAiJson, readAiResponseContent } from '@/lib/ai-json';
import { EMPTY_PROPERTY_VALUE, EXAMPLE_PROPERTY_DECK, normalizePropertyDeck, parsePropertyDeckImport, propertyPrompts, propertyRowOptions, PROPERTY_IMPORT_REQUIREMENTS, shuffledPropertyPrompts, type PropertyDeck, type PropertyDeckDraft, type PropertyPrompt } from '@/lib/property-decks';

const STORAGE_KEY = 'jackyun_property_decks_v1';
type StudyStage = 'recall' | 'checkpoint' | 'choice' | 'complete';

function makeId(prefix: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
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
  const [studyStage, setStudyStage] = useState<StudyStage>('recall');
  const [studyQueue, setStudyQueue] = useState<PropertyPrompt[]>([]);
  const [studySource, setStudySource] = useState<PropertyPrompt[]>([]);
  const [studyDone, setStudyDone] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [choiceAnswer, setChoiceAnswer] = useState<string | null>(null);
  const [choiceScore, setChoiceScore] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'custom' | 'ai'>('custom');
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<PropertyDeckDraft | null>(null);
  const [importMessage, setImportMessage] = useState('');
  const [busy, setBusy] = useState(false);

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
  const prompt = studyStage === 'recall' ? studyQueue[0] : studySource[cursor];
  const choiceOptions = useMemo(() => deck && prompt ? shuffle(propertyRowOptions(deck, prompt.rowIndex)) : [], [deck, prompt]);

  useEffect(() => {
    if (!studying || studyStage !== 'recall' || !studyQueue.length) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement) return;
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setRevealed((value) => !value); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [studyQueue.length, studyStage, studying]);

  function updateDeck(change: (current: PropertyDeck) => PropertyDeck) {
    if (!deck) return;
    setDecks((current) => current.map((entry) => entry.id === deck.id ? change(entry) : entry));
  }

  function createDeck() {
    const id = makeId('deck');
    const next: PropertyDeck = {
      id,
      title: '新的对比记忆表',
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
    if (!prompts.length) return;
    const randomized = deck ? shuffledPropertyPrompts(deck) : [];
    setStudyQueue(randomized);
    setStudySource(randomized);
    setStudyDone(0);
    setStudyStage('recall');
    setCursor(0);
    setRevealed(false);
    setChoiceAnswer(null);
    setChoiceScore(0);
    setStudying(true);
  }

  function markRecall(known: boolean) {
    if (!studyQueue.length) return;
    setRevealed(false);
    if (!known) {
      setStudyQueue((current) => {
        if (current.length <= 1) return current;
        const [retry, ...rest] = current;
        const lastSameRow = rest.findLastIndex((entry) => entry.rowIndex === retry.rowIndex);
        const insertAt = lastSameRow >= 0 ? lastSameRow + 1 : rest.length;
        return [...rest.slice(0, insertAt), retry, ...rest.slice(insertAt)];
      });
      return;
    }
    const next = studyQueue.slice(1);
    setStudyQueue(next);
    setStudyDone((value) => value + 1);
    if (!next.length) setStudyStage('checkpoint');
  }

  function startChoice() {
    if (deck) setStudySource(shuffledPropertyPrompts(deck));
    setCursor(0);
    setChoiceAnswer(null);
    setChoiceScore(0);
    setStudyStage('choice');
  }

  function chooseContent(value: string) {
    if (!prompt || choiceAnswer !== null) return;
    setChoiceAnswer(value);
    if (value === (prompt.answer.trim() || EMPTY_PROPERTY_VALUE)) setChoiceScore((score) => score + 1);
  }

  function nextChoice() {
    if (cursor + 1 >= studySource.length) {
      setStudyStage('complete');
      return;
    }
    setCursor((value) => value + 1);
    setChoiceAnswer(null);
  }

  function openImport() {
    setImportOpen(true);
    setStudying(false);
    setImportMode('custom');
    setSource('');
    setPreview(null);
    setImportMessage('');
  }

  function parseImport(text = source) {
    const result = parsePropertyDeckImport(text);
    setPreview(result.draft);
    setImportMessage(result.draft ? `已识别 ${result.draft.items.length} 个对象和 ${result.draft.properties.length} 项性质，请确认预览。` : result.errors.join('\n'));
  }

  async function aiImport() {
    if (!source.trim()) return;
    setBusy(true);
    setPreview(null);
    setImportMessage('AI 正在整理对象、性质和对应值…');
    try {
      const response = await callAiApi([
        { role: 'system', content: 'Return only valid JSON using exactly this structure: {"title":"...","items":["..."],"properties":[{"label":"...","values":["..."]}]}. Each properties.values array must have exactly the same length and order as items. Preserve the source language, keep values concise, and never invent missing facts.' },
        { role: 'user', content: `把下面的学习材料整理成性质对比表。横向是被比较的对象，纵向是性质：\n\n${source}` },
      ], { temperature: 0.1, maxTokens: 3000, noThinking: true });
      const content = await readAiResponseContent(response);
      const result = parsePropertyDeckImport(JSON.stringify(parseAiJson(content)));
      if (!result.draft) throw new Error(result.errors.join(' ') || 'AI 没有返回有效表格。');
      setPreview(result.draft);
      setImportMessage(`AI 已生成 ${result.draft.items.length} 个对象和 ${result.draft.properties.length} 项性质，请确认预览。`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'AI 导入失败。');
    } finally {
      setBusy(false);
    }
  }

  function confirmImport() {
    if (!preview) return;
    const id = makeId('deck');
    const imported: PropertyDeck = {
      id,
      title: preview.title,
      items: preview.items,
      properties: preview.properties.map((row) => ({ ...row, id: makeId('row') })),
      createdAt: new Date().toISOString(),
    };
    setDecks((current) => [imported, ...current]);
    setSelectedId(id);
    setImportOpen(false);
  }

  function fileInput(file?: File) {
    if (!file) return;
    if (file.size > 1_000_000) { setImportMessage('文件不能超过 1 MB。'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setSource(text);
      parseImport(text);
    };
    reader.readAsText(file);
  }

  if (!ready) return <div className="min-h-72 animate-pulse rounded-3xl bg-[var(--card)]" />;

  return (
    <div className="page-enter mx-auto max-w-[1280px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--card-border)] pb-7">
        <div>
          <Link href="/memory" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"><span className="material-icons-round text-lg">arrow_back</span>记忆 Memory</Link>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#b06000]">Compare to remember</p>
          <h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">对比记忆</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">第一关逐格确认会了，第二关只从当前横行选择答案。</p>
        </div>
        <div className="flex gap-2"><button type="button" onClick={openImport} className="min-h-11 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-5 font-medium"><span className="material-icons-round mr-1 align-middle text-lg">upload_file</span>导入</button><button type="button" onClick={createDeck} className="min-h-11 rounded-xl bg-[#175cd3] px-5 font-medium text-white">+ 新建表格</button></div>
      </div>

      {studying && deck ? (
        <StudyView deck={deck} stage={studyStage} prompt={prompt} remaining={studyQueue.length} done={studyDone} total={studySource.length} cursor={cursor} revealed={revealed} choiceOptions={choiceOptions} choiceAnswer={choiceAnswer} score={choiceScore} onReveal={() => setRevealed((value) => !value)} onKnown={() => markRecall(true)} onUnknown={() => markRecall(false)} onStartChoice={startChoice} onChoose={chooseContent} onNextChoice={nextChoice} onClose={() => setStudying(false)} />
      ) : importOpen ? (
        <ImportPanel mode={importMode} source={source} preview={preview} message={importMessage} busy={busy} onMode={(mode) => { setImportMode(mode); setPreview(null); setImportMessage(''); }} onSource={setSource} onParse={() => parseImport()} onAi={() => void aiImport()} onFile={fileInput} onConfirm={confirmImport} onClose={() => setImportOpen(false)} />
      ) : deck ? (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {decks.map((entry) => <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)} className={`min-h-10 rounded-xl border px-4 text-sm font-medium ${entry.id === deck.id ? 'border-[#175cd3] bg-[#eaf2ff] text-[#175cd3] dark:bg-[#102a43]' : 'border-[var(--card-border)] bg-[var(--card)]'}`}>{entry.title}</button>)}
          </div>
          <Editor deck={deck} onUpdate={updateDeck} onAddItem={addItem} onRemoveItem={removeItem} onAddProperty={addProperty} onDelete={deleteDeck} onStudy={startStudy} />
        </>
      ) : (
        <button type="button" onClick={createDeck} className="min-h-56 w-full rounded-3xl border-2 border-dashed border-[var(--card-border)] text-[var(--muted-foreground)]">建立第一张对比记忆表</button>
      )}
    </div>
  );
}

function ImportPanel({ mode, source, preview, message, busy, onMode, onSource, onParse, onAi, onFile, onConfirm, onClose }: {
  mode: 'custom' | 'ai';
  source: string;
  preview: PropertyDeckDraft | null;
  message: string;
  busy: boolean;
  onMode: (mode: 'custom' | 'ai') => void;
  onSource: (value: string) => void;
  onParse: () => void;
  onAi: () => void;
  onFile: (file?: File) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copyRequirements() {
    try {
      await navigator.clipboard.writeText(PROPERTY_IMPORT_REQUIREMENTS);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* The requirements remain visible for manual copy. */ }
  }
  const example = PROPERTY_IMPORT_REQUIREMENTS.split('示例：\n')[1] ?? PROPERTY_IMPORT_REQUIREMENTS;
  return <section className="grid gap-5 lg:grid-cols-2">
    <article className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-6">
      <div className="flex rounded-xl bg-[var(--background)] p-1">
        <button type="button" onClick={() => onMode('custom')} className={`min-h-10 flex-1 rounded-lg font-bold ${mode === 'custom' ? 'bg-[var(--card)] text-[#175cd3]' : ''}`}>自定义格式</button>
        <button type="button" onClick={() => onMode('ai')} className={`min-h-10 flex-1 rounded-lg font-bold ${mode === 'ai' ? 'bg-[var(--card)] text-[#6941c6]' : ''}`}>AI 导入</button>
      </div>
      <div className="mt-5 flex items-start justify-between gap-3">
        <p className="text-sm leading-6 text-[var(--muted-foreground)]">{mode === 'custom' ? '按规定格式粘贴或上传文本，系统会严格检查每行的值是否与对象数量一致。' : '粘贴讲义、笔记或自然语言表格，AI 会整理出横向对象和纵向性质。'}</p>
        {mode === 'custom' && <button type="button" onClick={() => void copyRequirements()} className="shrink-0 rounded-xl border border-[var(--card-border)] px-3 py-2 text-xs font-bold text-[#175cd3]"><span className="material-icons-round mr-1 align-middle text-base">content_copy</span>{copied ? '已复制' : '复制格式要求'}</button>}
      </div>
      <textarea value={source} onChange={(event) => onSource(event.target.value)} rows={15} placeholder={mode === 'custom' ? example : '粘贴需要整理的学习材料，例如无线通信方式及其 frequency、range、bandwidth…'} className="mt-3 w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 text-sm leading-6 outline-none focus:border-[#175cd3]" />
      <div className="mt-3 flex gap-2">
        {mode === 'custom' && <label className="cursor-pointer rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm font-bold">选择文件<input type="file" accept=".txt,.md,.json,text/plain,application/json" className="sr-only" onChange={(event) => onFile(event.target.files?.[0])} /></label>}
        <button type="button" disabled={busy || !source.trim()} onClick={mode === 'custom' ? onParse : onAi} className="flex-1 rounded-xl bg-[#1570ef] font-bold text-white disabled:opacity-40">{busy ? '正在生成…' : mode === 'custom' ? '解析表格' : 'AI 生成表格'}</button>
      </div>
      {mode === 'custom' && <details className="mt-4 rounded-xl border border-[var(--card-border)] p-3"><summary className="cursor-pointer font-bold">查看完整格式要求</summary><pre className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[var(--muted-foreground)]">{PROPERTY_IMPORT_REQUIREMENTS}</pre></details>}
      <button type="button" onClick={onClose} className="mt-4 text-sm font-medium text-[var(--muted-foreground)]">取消导入</button>
    </article>

    <aside className="min-w-0 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-6">
      <h2 className="text-xl font-bold">表格预览</h2>
      {message && <p role="status" className="mt-4 whitespace-pre-line rounded-xl bg-[var(--background)] p-3 text-sm leading-6">{message}</p>}
      {preview ? <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--card-border)]">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <caption className="border-b border-[var(--card-border)] p-3 text-left text-base font-bold">{preview.title}</caption>
          <thead><tr className="bg-[var(--background)]"><th className="border-b border-r border-[var(--card-border)] p-3 text-left">性质 / 对象</th>{preview.items.map((item) => <th key={item} className="border-b border-r border-[var(--card-border)] p-3 text-left last:border-r-0">{item}</th>)}</tr></thead>
          <tbody>{preview.properties.map((row) => <tr key={row.label}><th className="border-b border-r border-[var(--card-border)] p-3 text-left">{row.label}</th>{row.values.map((value, index) => <td key={`${row.label}-${index}`} className="border-b border-r border-[var(--card-border)] p-3 last:border-r-0">{value || '—'}</td>)}</tr>)}</tbody>
        </table>
      </div> : <div className="mt-4 grid min-h-72 place-items-center rounded-2xl border-2 border-dashed border-[var(--card-border)] p-8 text-center text-sm text-[var(--muted-foreground)]">解析或生成后会在这里显示完整对比表。</div>}
      <button type="button" disabled={!preview} onClick={onConfirm} className="mt-5 min-h-12 w-full rounded-xl bg-[#12b76a] font-bold text-white disabled:opacity-40">确认并导入{preview ? `「${preview.title}」` : ''}</button>
    </aside>
  </section>;
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

function StudyView({ deck, stage, prompt, remaining, done, total, cursor, revealed, choiceOptions, choiceAnswer, score, onReveal, onKnown, onUnknown, onStartChoice, onChoose, onNextChoice, onClose }: {
  deck: PropertyDeck;
  stage: StudyStage;
  prompt?: PropertyPrompt;
  remaining: number;
  done: number;
  total: number;
  cursor: number;
  revealed: boolean;
  choiceOptions: string[];
  choiceAnswer: string | null;
  score: number;
  onReveal: () => void;
  onKnown: () => void;
  onUnknown: () => void;
  onStartChoice: () => void;
  onChoose: (value: string) => void;
  onNextChoice: () => void;
  onClose: () => void;
}) {
  if (stage === 'checkpoint') return <StageResult title="第一关完成" detail={`全部 ${done} 项都已标记为会了。第二关将只显示当前横行的内容供选择。`} action="进入第二关" onAction={onStartChoice} onClose={onClose} />;
  if (stage === 'complete') return <StageResult title="第二关完成" detail={`答对 ${score} / ${total}，正确率 ${total ? Math.round(score / total * 100) : 0}%。`} action="返回表格" onAction={onClose} />;
  if (!prompt) return <StageResult title="没有可学习的内容" detail="请先返回表格填写内容。" action="返回表格" onAction={onClose} />;

  const correctAnswer = prompt.answer.trim() || EMPTY_PROPERTY_VALUE;
  const answered = choiceAnswer !== null;
  return <section className="mx-auto max-w-4xl">
    <div className="mb-4 flex items-center justify-between gap-3 text-sm text-[var(--muted-foreground)]"><span>{stage === 'recall' ? `第一关 · 剩余 ${remaining} / ${total} · 已会 ${done}` : `第二关 · ${cursor + 1} / ${total} · 已答对 ${score}`} · {deck.title}</span><button type="button" onClick={onClose} className="rounded-xl border border-[var(--card-border)] px-4 py-2">返回表格</button></div>
    <article className="flex min-h-[420px] w-full flex-col items-center justify-center rounded-[28px] border border-[var(--card-border)] bg-[var(--card)] p-7 text-center shadow-lg">
      <span className="rounded-full bg-[#fef3c7] px-4 py-2 text-xs font-bold uppercase tracking-[.14em] text-[#92400e]">{prompt.property}</span>
      <h2 className="mt-7 text-4xl font-bold uppercase tracking-tight sm:text-6xl">{prompt.item}</h2>
      {stage === 'recall' ? (revealed ? <div className="mt-9 w-full max-w-2xl border-t border-dashed border-[var(--card-border)] pt-9"><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--muted-foreground)]">答案</p><p className="mt-3 text-2xl font-medium leading-relaxed sm:text-4xl">{prompt.answer || '（未填写）'}</p></div> : <button type="button" onClick={onReveal} className="mt-10 min-h-28 w-full max-w-2xl rounded-2xl border-2 border-dashed border-[#b2ccff] font-bold text-[#175cd3]">先在心里回答，再显示答案</button>) : <div className="mt-9 grid w-full max-w-2xl gap-3 sm:grid-cols-2">{choiceOptions.map((option) => { const correct = option === correctAnswer; const selected = option === choiceAnswer; return <button key={option} type="button" disabled={answered} onClick={() => onChoose(option)} className={`min-h-14 rounded-xl border-2 p-3 text-left font-medium ${answered && correct ? 'border-[#12b76a] bg-[#ecfdf3] text-[#067647]' : answered && selected ? 'border-[#f04438] bg-[#fef3f2] text-[#b42318]' : 'border-[var(--card-border)]'}`}>{option}</button>; })}</div>}
    </article>
    {stage === 'recall' ? (revealed ? <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={onUnknown} className="min-h-12 rounded-xl border-2 border-[#f59e0b] font-medium text-[#b06000]">不会 · 稍后再出现</button><button type="button" onClick={onKnown} className="min-h-12 rounded-xl bg-[#188038] font-medium text-white">会了 · 剩余减 1</button></div> : <button type="button" onClick={onReveal} className="mt-5 min-h-12 w-full rounded-xl bg-[#175cd3] font-medium text-white">显示答案</button>) : answered && <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p role="status" className={`font-bold ${choiceAnswer === correctAnswer ? 'text-[#15803d]' : 'text-[#b42318]'}`}>{choiceAnswer === correctAnswer ? '回答正确' : '回答错误，正确答案已标绿。'}</p><button type="button" onClick={onNextChoice} className="min-h-12 rounded-xl bg-[#175cd3] px-6 font-medium text-white">{cursor + 1 === total ? '查看结果' : '下一题 →'}</button></div>}
  </section>;
}

function StageResult({ title, detail, action, onAction, onClose }: { title: string; detail: string; action: string; onAction: () => void; onClose?: () => void }) {
  return <section className="mx-auto max-w-2xl rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-10 text-center"><span className="material-icons-round text-5xl text-[#12b76a]">task_alt</span><h2 className="mt-4 text-2xl font-bold">{title}</h2><p className="mt-2 text-[var(--muted-foreground)]">{detail}</p><div className="mt-6 flex justify-center gap-3">{onClose && <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-[var(--card-border)] px-5 font-medium">返回表格</button>}<button type="button" onClick={onAction} className="min-h-11 rounded-xl bg-[#175cd3] px-5 font-medium text-white">{action}</button></div></section>;
}
