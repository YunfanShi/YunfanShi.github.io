'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { callAiApi } from '@/lib/ai-config';
import { readAiResponseContent } from '@/lib/ai-json';
import { buildWordPrompt, parseWordNote, type WordNote } from '@/lib/ielts-reading';
import {
  calculateNovelProgress,
  detectNovelLanguage,
  inferNovelTitle,
  splitNovelIntoChapters,
  type NovelBook,
  type NovelChapter,
  type NovelLanguage,
} from '@/lib/novel-reader';
import { deleteNovelBook, getNovelChapter, listNovelBooks, listNovelChapterHeadings, saveNovelBook, updateNovelBook } from '@/lib/novel-storage';

type View = 'library' | 'import' | 'reader';
type ShelfFilter = 'all' | NovelLanguage;
type Theme = 'paper' | 'sepia' | 'mint' | 'night';
type Width = 'narrow' | 'medium' | 'wide';
type Heading = Pick<NovelChapter, 'index' | 'title' | 'characterCount'>;

const themeClasses: Record<Theme, string> = {
  paper: 'bg-[#fffefa] text-[#26231e]',
  sepia: 'bg-[#f4ecd8] text-[#3c3128]',
  mint: 'bg-[#edf8f1] text-[#18362b]',
  night: 'bg-[#111827] text-[#e5e7eb]',
};
const widthClasses: Record<Width, string> = { narrow: 'max-w-2xl', medium: 'max-w-3xl', wide: 'max-w-5xl' };

function formatSize(characters: number): string {
  if (characters >= 1_000_000) return `${(characters / 1_000_000).toFixed(1)} 百万字`;
  if (characters >= 10_000) return `${(characters / 10_000).toFixed(1)} 万字`;
  return `${characters.toLocaleString()} 字符`;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} 小时 ${minutes} 分` : `${Math.max(1, minutes)} 分钟`;
}

function tokens(text: string): string[] {
  return text.match(/[A-Za-z]+(?:['’.-][A-Za-z]+)*|[^A-Za-z]+/g) ?? [];
}

async function decodeNovelFile(file: File, encoding: 'auto' | 'utf-8' | 'gb18030'): Promise<string> {
  const bytes = await file.arrayBuffer();
  if (encoding !== 'auto') return new TextDecoder(encoding).decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('gb18030').decode(bytes); }
}

export default function NovelWorkbench({ onOpenAiStudio }: { onOpenAiStudio: () => void }) {
  const [view, setView] = useState<View>('library');
  const [books, setBooks] = useState<NovelBook[]>([]);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<ShelfFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'title' | 'progress'>('recent');
  const [message, setMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [bookTitle, setBookTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [language, setLanguage] = useState<'auto' | NovelLanguage>('auto');
  const [encoding, setEncoding] = useState<'auto' | 'utf-8' | 'gb18030'>('auto');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chapter, setChapter] = useState<NovelChapter | null>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [chapterQuery, setChapterQuery] = useState('');
  const [tocOpen, setTocOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>('paper');
  const [fontSize, setFontSize] = useState(20);
  const [lineHeight, setLineHeight] = useState(1.95);
  const [contentWidth, setContentWidth] = useState<Width>('medium');
  const [selectedWord, setSelectedWord] = useState<WordNote | null>(null);
  const [wordLoading, setWordLoading] = useState(false);
  const readerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const restoreRatioRef = useRef(0);
  const activeBook = books.find((book) => book.id === activeId) ?? null;

  useEffect(() => {
    listNovelBooks()
      .then((items) => setBooks(items.sort((left, right) => (right.lastReadAt ?? right.importedAt).localeCompare(left.lastReadAt ?? left.importedAt))))
      .catch(() => setMessage('无法读取本地书架；浏览器可能禁用了 IndexedDB。'))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (view !== 'reader' || !activeId) return;
    const interval = window.setInterval(() => {
      setBooks((items) => items.map((book) => {
        if (book.id !== activeId) return book;
        const next = { ...book, readingSeconds: book.readingSeconds + 10, lastReadAt: new Date().toISOString() };
        void updateNovelBook(next);
        return next;
      }));
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [activeId, view]);

  const visibleBooks = useMemo(() => books.filter((book) => {
    const matchesFilter = filter === 'all' || book.language === filter;
    const matchesQuery = `${book.title} ${book.author}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return matchesFilter && matchesQuery;
  }).sort((left, right) => sort === 'title' ? left.title.localeCompare(right.title) : sort === 'progress' ? right.overallProgress - left.overallProgress : (right.lastReadAt ?? right.importedAt).localeCompare(left.lastReadAt ?? left.importedAt)), [books, filter, query, sort]);

  const shelves = filter === 'all'
    ? [{ language: 'zh' as const, title: '中文书架', books: visibleBooks.filter((book) => book.language === 'zh') }, { language: 'en' as const, title: '英文书架', books: visibleBooks.filter((book) => book.language === 'en') }]
    : [{ language: filter, title: filter === 'zh' ? '中文书架' : '英文书架', books: visibleBooks }];

  async function openBook(book: NovelBook) {
    setMessage('');
    try {
      const chapterHeadings = await listNovelChapterHeadings(book.id);
      const target = await getNovelChapter(book.id, book.currentChapter);
      if (!target) throw new Error('没有找到保存的章节正文。');
      restoreRatioRef.current = book.chapterProgress;
      setActiveId(book.id);
      setHeadings(chapterHeadings);
      setChapter(target);
      setSelectedWord(null);
      setView('reader');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const reader = readerRef.current;
        if (reader) reader.scrollTop = restoreRatioRef.current * Math.max(0, reader.scrollHeight - reader.clientHeight);
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '打开小说失败。');
    }
  }

  async function loadChapter(index: number, restoreRatio = 0) {
    if (!activeBook || index < 0 || index >= activeBook.chapterCount) return;
    saveCurrentPosition();
    const nextChapter = await getNovelChapter(activeBook.id, index);
    if (!nextChapter) return;
    restoreRatioRef.current = restoreRatio;
    setChapter(nextChapter);
    setSelectedWord(null);
    const nextBook = { ...activeBook, currentChapter: index, chapterProgress: restoreRatio, overallProgress: calculateNovelProgress(index, restoreRatio, activeBook.chapterCount), lastReadAt: new Date().toISOString() };
    setBooks((items) => items.map((book) => book.id === nextBook.id ? nextBook : book));
    await updateNovelBook(nextBook);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const reader = readerRef.current;
      if (reader) reader.scrollTop = restoreRatio * Math.max(0, reader.scrollHeight - reader.clientHeight);
    }));
  }

  async function moveChapter(offset: number) {
    if (!chapter) return;
    await loadChapter(chapter.index + offset, offset < 0 ? 1 : 0);
  }

  // Alt + ← / → mirrors the chapter navigation used by mature desktop readers.
  useEffect(() => {
    if (view !== 'reader') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select')) return;
      if (event.key === 'ArrowLeft' && event.altKey) void moveChapter(-1);
      if (event.key === 'ArrowRight' && event.altKey) void moveChapter(1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function currentScrollRatio(): number {
    const reader = readerRef.current;
    if (!reader) return 0;
    const maximum = Math.max(0, reader.scrollHeight - reader.clientHeight);
    return maximum ? Math.min(1, Math.max(0, reader.scrollTop / maximum)) : 1;
  }

  function persistPosition(showMessage = false) {
    if (!activeBook || !chapter) return;
    const ratio = currentScrollRatio();
    const next = { ...activeBook, currentChapter: chapter.index, chapterProgress: ratio, overallProgress: calculateNovelProgress(chapter.index, ratio, activeBook.chapterCount), lastReadAt: new Date().toISOString() };
    setBooks((items) => items.map((book) => book.id === next.id ? next : book));
    void updateNovelBook(next);
    if (showMessage) setMessage(`书签已保存：第 ${chapter.index + 1} 章，整本约 ${Math.round(next.overallProgress * 100)}%。`);
  }

  function saveCurrentPosition() {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    persistPosition();
  }

  function schedulePositionSave() {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => persistPosition(), 450);
  }

  async function importBook() {
    if (!file) { setMessage('请先选择 TXT 或 Markdown 小说文件。'); return; }
    setImporting(true);
    setMessage('正在读取文件并识别章节…');
    try {
      const text = await decodeNovelFile(file, encoding);
      const chapters = splitNovelIntoChapters(text);
      if (!chapters.length) throw new Error('文件中没有可读取的正文。');
      const now = new Date().toISOString();
      const book: NovelBook = {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `novel-${Date.now()}`,
        title: bookTitle.trim() || inferNovelTitle(file.name),
        author: author.trim(),
        language: language === 'auto' ? detectNovelLanguage(text) : language,
        chapterCount: chapters.length,
        characterCount: chapters.reduce((total, item) => total + item.characterCount, 0),
        importedAt: now,
        lastReadAt: null,
        currentChapter: 0,
        chapterProgress: 0,
        overallProgress: 0,
        readingSeconds: 0,
        sourceFileName: file.name,
      };
      await saveNovelBook(book, chapters);
      setBooks((items) => [book, ...items]);
      setFile(null); setBookTitle(''); setAuthor(''); setLanguage('auto');
      setMessage(`《${book.title}》已导入：识别到 ${book.chapterCount} 章，共 ${formatSize(book.characterCount)}。`);
      setView('library');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导入失败。');
    } finally {
      setImporting(false);
    }
  }

  async function removeBook(book: NovelBook) {
    if (!window.confirm(`确定删除《${book.title}》及全部章节吗？此操作无法撤销。`)) return;
    await deleteNovelBook(book.id);
    setBooks((items) => items.filter((item) => item.id !== book.id));
    setMessage(`已删除《${book.title}》。`);
  }

  async function lookupWord(word: string, context: string) {
    if (!activeBook || activeBook.language !== 'en' || word.length < 2) return;
    setWordLoading(true);
    try {
      const response = await callAiApi([
        { role: 'system', content: 'You are a concise bilingual learner dictionary. Return only valid JSON.' },
        { role: 'user', content: buildWordPrompt(word, context, 'B2') },
      ], { temperature: 0.1, maxTokens: 1200, noThinking: true, feature: 'chat' });
      setSelectedWord(parseWordNote(await readAiResponseContent(response)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '查词失败。');
    } finally {
      setWordLoading(false);
    }
  }

  function speakCurrentChapter() {
    if (!chapter || !activeBook || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(chapter.content);
    utterance.lang = activeBook.language === 'zh' ? 'zh-CN' : 'en-US';
    utterance.rate = activeBook.language === 'zh' ? 1 : 0.9;
    window.speechSynthesis.speak(utterance);
  }

  if (view === 'reader' && activeBook && chapter) {
    const filteredHeadings = headings.filter((item) => item.title.toLocaleLowerCase().includes(chapterQuery.toLocaleLowerCase()));
    return <div className={`relative overflow-hidden rounded-[28px] border border-[var(--card-border)] shadow-xl ${themeClasses[theme]}`}>
      <header className="space-y-2 border-b border-black/10 bg-inherit px-3 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={() => { saveCurrentPosition(); setView('library'); }} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-black/5" aria-label="返回书架"><span className="material-icons-round">arrow_back</span></button>
          <button type="button" onClick={() => setTocOpen((value) => !value)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-black/5" aria-label="章节目录"><span className="material-icons-round">toc</span></button>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{activeBook.title}</p><p className="truncate text-xs opacity-60">{chapter.title} · {Math.round(activeBook.overallProgress * 100)}%</p></div>
          <button type="button" onClick={() => persistPosition(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-black/5" aria-label="保存书签"><span className="material-icons-round">bookmark</span></button>
          <button type="button" onClick={() => document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-black/5" aria-label="全屏"><span className="material-icons-round">fullscreen</span></button>
        </div>
        <div className="flex w-full items-center gap-2 overflow-x-auto pb-1">
        <button type="button" onClick={() => setFontSize((size) => Math.max(14, size - 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 font-serif">A−</button>
        <button type="button" onClick={() => setFontSize((size) => Math.min(34, size + 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 font-serif">A+</button>
        <button type="button" onClick={() => setLineHeight((value) => value >= 2.4 ? 1.5 : Number((value + 0.15).toFixed(2)))} className="min-h-9 rounded-lg border border-black/10 px-2 text-xs font-bold">行距 {lineHeight}</button>
        <select value={contentWidth} onChange={(event) => setContentWidth(event.target.value as Width)} aria-label="正文宽度" className="h-9 rounded-lg border border-black/10 bg-transparent px-2 text-xs font-bold"><option value="narrow">窄栏</option><option value="medium">标准</option><option value="wide">宽栏</option></select>
        <div className="flex gap-1">{(['paper', 'sepia', 'mint', 'night'] as Theme[]).map((item) => <button key={item} type="button" onClick={() => setTheme(item)} aria-label={`${item} 主题`} className={`h-7 w-7 rounded-full border-2 ${themeClasses[item].split(' ')[0]} ${theme === item ? 'border-[#06b6d4]' : 'border-black/20'}`} />)}</div>
        <button type="button" onClick={speakCurrentChapter} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-black/5" aria-label="朗读本章"><span className="material-icons-round">volume_up</span></button>
        </div>
      </header>
      <div className="flex h-[calc(100vh-222px)] min-h-[480px]">
        {tocOpen && <aside className={`w-72 shrink-0 overflow-y-auto border-r border-black/10 p-3 max-lg:absolute max-lg:inset-y-[116px] max-lg:left-0 max-lg:z-20 max-lg:shadow-2xl ${themeClasses[theme]}`}>
          <div className="sticky top-0 bg-inherit pb-3"><p className="font-bold">目录 · {headings.length} 章</p><input value={chapterQuery} onChange={(event) => setChapterQuery(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-black/10 bg-white/20 px-3 text-sm outline-none" placeholder="搜索章节" /></div>
          <div className="space-y-1">{filteredHeadings.map((item) => <button type="button" key={item.index} onClick={() => void loadChapter(item.index)} className={`w-full rounded-xl px-3 py-2.5 text-left text-sm leading-5 ${item.index === chapter.index ? 'bg-[#0f766e] font-bold text-white' : 'hover:bg-black/5'}`}><span className="line-clamp-2">{item.title}</span></button>)}</div>
        </aside>}
        <main ref={readerRef} onScroll={schedulePositionSave} className="min-w-0 flex-1 overflow-y-auto scroll-smooth">
          <article className={`mx-auto px-6 py-12 sm:px-10 sm:py-16 ${widthClasses[contentWidth]}`}>
            <p className="text-center text-xs font-bold uppercase tracking-[.16em] opacity-50">第 {chapter.index + 1} / {activeBook.chapterCount} 章</p>
            <h1 className="mt-3 text-center font-serif text-3xl font-bold leading-tight sm:text-4xl">{chapter.title}</h1>
            <div className="mt-10 font-serif" style={{ fontSize, lineHeight }} lang={activeBook.language === 'zh' ? 'zh-CN' : 'en'}>{chapter.content.split(/\n\s*\n/u).map((paragraph, index) => <p key={index} className={`mb-[1.25em] ${activeBook.language === 'zh' ? 'text-justify indent-[2em]' : ''}`}>{activeBook.language === 'en' ? tokens(paragraph).map((token, tokenIndex) => /^[A-Za-z]/.test(token) ? <button type="button" key={tokenIndex} onClick={() => void lookupWord(token, paragraph)} className="rounded px-px text-inherit underline-offset-4 hover:bg-[#facc15]/35 hover:underline">{token}</button> : <span key={tokenIndex}>{token}</span>) : paragraph}</p>)}</div>
            <nav className="mt-16 grid grid-cols-2 gap-3 border-t border-black/10 pt-8"><button type="button" disabled={chapter.index === 0} onClick={() => void moveChapter(-1)} className="min-h-12 rounded-xl border border-black/15 font-bold disabled:opacity-30">← 上一章</button><button type="button" disabled={chapter.index >= activeBook.chapterCount - 1} onClick={() => void moveChapter(1)} className="min-h-12 rounded-xl bg-[#0f766e] font-bold text-white disabled:opacity-30">下一章 →</button></nav>
          </article>
        </main>
        {activeBook.language === 'en' && selectedWord && <aside className="w-72 shrink-0 overflow-y-auto border-l border-black/10 p-5 max-xl:absolute max-xl:right-4 max-xl:top-20 max-xl:z-20 max-xl:rounded-2xl max-xl:border max-xl:bg-inherit max-xl:shadow-2xl"><div className="flex items-start justify-between"><strong className="font-serif text-2xl">{selectedWord.word}</strong><button type="button" onClick={() => setSelectedWord(null)} aria-label="关闭释义"><span className="material-icons-round">close</span></button></div><p className="mt-1 text-xs font-bold uppercase text-[#0f766e]">{selectedWord.phonetic} · {selectedWord.partOfSpeech}</p><p className="mt-4 text-xl font-bold">{selectedWord.translation}</p><p className="mt-3 text-sm leading-6 opacity-75">{selectedWord.definition}</p><p className="mt-4 rounded-xl bg-black/5 p-3 text-sm italic leading-6">{selectedWord.example}</p>{wordLoading && <p className="mt-3 text-xs">查询中…</p>}</aside>}
      </div>
      {message && <p role="status" className="absolute bottom-4 left-1/2 z-30 max-w-[90%] -translate-x-1/2 rounded-full bg-[#0f766e] px-4 py-2 text-sm font-bold text-white shadow-lg">{message}</p>}
    </div>;
  }

  return <div className="mx-auto max-w-[1500px] space-y-5 text-[var(--foreground)]">
    <header className="relative isolate overflow-hidden rounded-[28px] bg-[linear-gradient(118deg,#211c18_0%,#5c3d2e_52%,#0f766e_100%)] px-5 py-7 text-white shadow-[0_24px_70px_rgba(28,23,18,.22)] sm:px-8"><div className="pointer-events-none absolute -right-16 -top-20 -z-10 h-72 w-72 rounded-full bg-[#f5d0a9]/20 blur-3xl"/><p className="text-xs font-bold uppercase tracking-[.2em] text-[#fde7cf]">JACKYUN READER</p><div className="mt-2 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">我的小说书架</h1><p className="mt-3 max-w-3xl leading-7 text-[#f6e8db]">中文与英文长篇小说分章阅读。书籍保存在浏览器本地，只加载当前章节，并自动保存阅读位置。</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setView('import')} className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-[#493225]"><span className="material-icons-round mr-2 align-middle">upload_file</span>导入小说</button><button type="button" onClick={onOpenAiStudio} className="min-h-11 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-bold hover:bg-white/15"><span className="material-icons-round mr-2 align-middle">auto_awesome</span>AI 阅读工坊</button></div></div></header>
    <nav className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-2"><button type="button" onClick={() => setView('library')} className={`min-h-12 rounded-xl text-sm font-bold ${view === 'library' ? 'bg-[#0f766e] text-white' : ''}`}><span className="material-icons-round mr-2 align-middle">local_library</span>书架</button><button type="button" onClick={() => setView('import')} className={`min-h-12 rounded-xl text-sm font-bold ${view === 'import' ? 'bg-[#0f766e] text-white' : ''}`}><span className="material-icons-round mr-2 align-middle">add_circle</span>导入</button></nav>
    {message && <p role="status" className="rounded-2xl border border-[#99d9d1] bg-[#ecfdf5] px-4 py-3 text-sm text-[#115e59] dark:border-[#285e57] dark:bg-[#123b36] dark:text-[#99f6e4]">{message}</p>}

    {view === 'import' && <section className="mx-auto max-w-3xl rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-7"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e6f7f4] text-[#0f766e]"><span className="material-icons-round">menu_book</span></span><div><h2 className="text-2xl font-bold">导入 TXT / Markdown 小说</h2><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">支持 UTF-8 和常见中文 GB18030 编码。正文会自动识别“第一章、卷一、楔子、Chapter 1、Prologue”等目录特征；没有章节标题时会按约 3 万字符智能分段。</p></div></div><label className="mt-6 grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-[#70b9ae] bg-[#f0fdfa] px-5 py-10 text-center dark:bg-[#123b36]"><span className="material-icons-round text-4xl text-[#0f766e]">upload_file</span><strong className="mt-2">{file ? file.name : '选择小说文件'}</strong><span className="mt-1 text-xs text-[var(--muted-foreground)]">.txt、.text、.md、.markdown</span><input type="file" accept=".txt,.text,.md,.markdown,text/plain,text/markdown" className="sr-only" onChange={(event) => { const nextFile = event.target.files?.[0] ?? null; setFile(nextFile); if (nextFile && !bookTitle) setBookTitle(inferNovelTitle(nextFile.name)); }} /></label><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">书名<input value={bookTitle} onChange={(event) => setBookTitle(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 outline-none" placeholder="默认使用文件名" /></label><label className="text-sm font-bold">作者（可选）<input value={author} onChange={(event) => setAuthor(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 outline-none" /></label><label className="text-sm font-bold">语言<select value={language} onChange={(event) => setLanguage(event.target.value as 'auto' | NovelLanguage)} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3"><option value="auto">自动识别</option><option value="zh">中文</option><option value="en">英文</option></select></label><label className="text-sm font-bold">文件编码<select value={encoding} onChange={(event) => setEncoding(event.target.value as 'auto' | 'utf-8' | 'gb18030')} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3"><option value="auto">自动（推荐）</option><option value="utf-8">UTF-8</option><option value="gb18030">GB18030 / GBK</option></select></label></div><button type="button" onClick={() => void importBook()} disabled={!file || importing} className="mt-6 min-h-13 w-full rounded-2xl bg-[#0f766e] px-5 font-bold text-white disabled:opacity-40">{importing ? '正在分章并写入本地书库…' : '导入并建立目录'}</button></section>}

    {view === 'library' && <section className="space-y-6"><div className="flex flex-col gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-3 lg:flex-row"><div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--background)] p-1">{([{ id: 'all', label: `全部 ${books.length}` }, { id: 'zh', label: `中文 ${books.filter((book) => book.language === 'zh').length}` }, { id: 'en', label: `英文 ${books.filter((book) => book.language === 'en').length}` }] as Array<{ id: ShelfFilter; label: string }>).map((item) => <button type="button" key={item.id} onClick={() => setFilter(item.id)} className={`min-h-10 rounded-lg px-4 text-sm font-bold ${filter === item.id ? 'bg-[#0f766e] text-white shadow-sm' : ''}`}>{item.label}</button>)}</div><label className="relative flex-1"><span className="material-icons-round absolute left-3 top-2.5 text-[var(--muted-foreground)]">search</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] pl-10 pr-3 outline-none" placeholder="搜索书名或作者" /></label><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="min-h-11 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 text-sm font-bold"><option value="recent">最近阅读</option><option value="title">书名排序</option><option value="progress">阅读进度</option></select></div>{ready && !books.length ? <div className="rounded-3xl border border-dashed border-[var(--card-border)] bg-[var(--card)] px-6 py-16 text-center"><span className="material-icons-round text-6xl text-[#70a99e]">auto_stories</span><h2 className="mt-4 text-2xl font-bold">把第一部长篇放进书架</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--muted-foreground)]">小说正文存入 IndexedDB，不受普通 localStorage 容量限制。无论几十章还是上千章，阅读器每次只加载当前章节。</p><button type="button" onClick={() => setView('import')} className="mt-6 rounded-xl bg-[#0f766e] px-5 py-3 font-bold text-white">导入小说</button></div> : shelves.map((shelf) => shelf.books.length ? <div key={shelf.language}><div className="mb-3 flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${shelf.language === 'zh' ? 'bg-[#f5e6d3] text-[#8b5e3c]' : 'bg-[#dff4ef] text-[#0f766e]'}`}><span className="material-icons-round">{shelf.language === 'zh' ? 'history_edu' : 'translate'}</span></span><div><h2 className="text-xl font-bold">{shelf.title}</h2><p className="text-xs text-[var(--muted-foreground)]">{shelf.books.length} 本 · {shelf.language === 'en' ? '支持点词翻译' : '纯净中文阅读'}</p></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{shelf.books.map((book, index) => <article key={book.id} className="group overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><div className={`h-2 ${shelf.language === 'zh' ? 'bg-[linear-gradient(90deg,#8b5e3c,#d2a679)]' : 'bg-[linear-gradient(90deg,#0f766e,#06b6d4)]'}`} /><div className="p-5"><div className="flex items-start justify-between gap-3"><span className="rounded-full bg-[var(--background)] px-2.5 py-1 text-xs font-bold">{book.language === 'zh' ? '中文' : 'English'} · {book.chapterCount} 章</span><button type="button" onClick={() => void removeBook(book)} aria-label={`删除 ${book.title}`} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted-foreground)] opacity-60 hover:bg-[#fee2e2] hover:text-[#b91c1c] group-hover:opacity-100"><span className="material-icons-round text-lg">delete</span></button></div><div className="mt-5 flex gap-4"><div className={`grid h-28 w-20 shrink-0 place-items-center rounded-r-xl rounded-l-sm px-2 text-center text-white shadow-md ${index % 3 === 0 ? 'bg-[#365f57]' : index % 3 === 1 ? 'bg-[#6f4e37]' : 'bg-[#334155]'}`}><span className="line-clamp-4 font-serif text-sm font-bold leading-5">{book.title}</span></div><div className="min-w-0"><h3 className="line-clamp-2 font-serif text-xl font-bold leading-snug">{book.title}</h3><p className="mt-1 truncate text-sm text-[var(--muted-foreground)]">{book.author || '未知作者'}</p><p className="mt-3 text-xs text-[var(--muted-foreground)]">{formatSize(book.characterCount)} · 已读 {formatTime(book.readingSeconds)}</p></div></div><div className="mt-5 flex items-center justify-between text-xs"><span className="font-bold text-[#0f766e]">{book.overallProgress ? `继续阅读 · ${Math.round(book.overallProgress * 100)}%` : '尚未开始'}</span><span className="text-[var(--muted-foreground)]">第 {book.currentChapter + 1} 章</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--background)]"><div className="h-full rounded-full bg-[#0f766e]" style={{ width: `${Math.round(book.overallProgress * 100)}%` }} /></div><button type="button" onClick={() => void openBook(book)} className="mt-5 min-h-11 w-full rounded-xl bg-[#0f766e] px-4 text-sm font-bold text-white">{book.overallProgress ? '继续阅读' : '开始阅读'}</button></div></article>)}</div></div> : null)}</section>}
  </div>;
}
