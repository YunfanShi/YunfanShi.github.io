'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { acknowledgeCatalogNovelImport, type CatalogNovel, type ReaderBootstrap } from '@/actions/reader';
import { callAiApi } from '@/lib/ai-config';
import { readAiResponseContent } from '@/lib/ai-json';
import { buildWordPrompt, parseWordNote, type WordNote } from '@/lib/ielts-reading';
import { isSupportedNovelFile, NOVEL_FILE_ACCEPT, parseNovelFile } from '@/lib/novel-import';
import {
  calculateNovelProgressByCharacters,
  detectNovelLanguage,
  inferNovelTitle,
  splitNovelIntoChapters,
  type NovelBook,
  type NovelBookmark,
  type NovelChapter,
  type NovelLanguage,
} from '@/lib/novel-reader';
import { deleteNovelBook, getNovelChapter, listNovelBooks, listNovelChapterHeadings, listNovelChapters, replaceNovelChapters, saveNovelBook, updateNovelBook } from '@/lib/novel-storage';
import { createClient } from '@/lib/supabase/client';

type View = 'library' | 'store' | 'import' | 'reader' | 'edit';
type ShelfFilter = 'all' | NovelLanguage;
type SourceFilter = 'all' | 'local' | 'store';
type Theme = 'paper' | 'sepia' | 'mint' | 'night';
type Width = 'narrow' | 'medium' | 'wide';
type Heading = Pick<NovelChapter, 'index' | 'title' | 'characterCount'>;
type ReadingPosition = { chapterIndex: number; chapterProgress: number; scrollTop: number; anchorParagraph: number; anchorOffsetRatio: number; updatedAt: string };
type CloudRow = { book_id: string; metadata: NovelBook; storage_path: string; content_hash: string; updated_at: string };

const POSITION_KEY_PREFIX = 'jackyun_novel_position_v2:';

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

function formatProgress(progress: number): string {
  return `${(Math.min(1, Math.max(0, progress)) * 100).toFixed(1)}%`;
}

function tokens(text: string): string[] {
  return text.match(/[A-Za-z]+(?:['’.-][A-Za-z]+)*|[^A-Za-z]+/g) ?? [];
}

function coverFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('请选择图片文件。'));
  if (file.size > 4 * 1024 * 1024) return Promise.reject(new Error('封面图片不能超过 4 MB。'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('无法读取封面图片。'));
    reader.readAsDataURL(file);
  });
}

function cloudPath(userId: string, bookId: string): string { return `users/${userId}/${bookId}.json`; }

async function uploadCloudBook(userId: string, book: NovelBook, chapters: NovelChapter[]) {
  const supabase = createClient();
  const path = cloudPath(userId, book.id);
  const blob = new Blob([JSON.stringify({ version: 1, book, chapters })], { type: 'application/json' });
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const contentHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const upload = await supabase.storage.from('novel-files').upload(path, blob, { contentType: 'application/json', upsert: true });
  if (upload.error) throw upload.error;
  const { error } = await supabase.from('reader_books').upsert({ user_id: userId, book_id: book.id, metadata: book, storage_path: path, content_hash: contentHash, updated_at: new Date().toISOString() }, { onConflict: 'user_id,book_id' });
  if (error) throw error;
}

async function updateCloudMetadata(userId: string, book: NovelBook) {
  const { error } = await createClient().from('reader_books').update({ metadata: book, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('book_id', book.id);
  if (error) throw error;
}

async function downloadCloudBook(row: CloudRow): Promise<NovelBook | null> {
  const { data, error } = await createClient().storage.from('novel-files').download(row.storage_path);
  if (error || !data) return null;
  const payload = JSON.parse(await data.text()) as { book?: NovelBook; chapters?: NovelChapter[] };
  if (!payload.book || !Array.isArray(payload.chapters)) return null;
  const book = { ...payload.book, ...row.metadata };
  await saveNovelBook(book, payload.chapters);
  return book;
}

export default function NovelWorkbench({ onOpenAiStudio, bootstrap }: { onOpenAiStudio: () => void; bootstrap: ReaderBootstrap }) {
  const [view, setView] = useState<View>('library');
  const [books, setBooks] = useState<NovelBook[]>([]);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<ShelfFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'title' | 'progress' | 'custom'>('recent');
  const [message, setMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
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
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingAuthor, setEditingAuthor] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [editingCover, setEditingCover] = useState('');
  const [editorChapters, setEditorChapters] = useState<NovelChapter[]>([]);
  const [editingChapterIndex, setEditingChapterIndex] = useState<number | null>(null);
  const [chapterDraftTitle, setChapterDraftTitle] = useState('');
  const [chapterDraftContent, setChapterDraftContent] = useState('');
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterContent, setNewChapterContent] = useState('');
  const [editorBusy, setEditorBusy] = useState(false);
  const readerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const restorePositionRef = useRef<ReadingPosition | null>(null);
  const activeBook = books.find((book) => book.id === activeId) ?? null;
  const storeEnabled = bootstrap.features.novel_store?.allowed === true;
  const storeIds = useMemo(() => new Set(books.filter((book) => book.source === 'store' || book.id.startsWith('catalog-')).map((book) => book.catalogNovelId ?? book.id.replace(/^catalog-/u, ''))), [books]);

  const materializeCatalogNovel = useCallback(async (novel: CatalogNovel) => {
    if (!novel.downloadUrl) throw new Error('小说下载链接不可用。');
    const response = await fetch(novel.downloadUrl);
    if (!response.ok) throw new Error('下载链接已失效，请刷新页面后重试。');
    const file = new File([await response.blob()], novel.originalFileName);
    const parsed = await parseNovelFile(file, 'auto');
    const chapters = parsed.chapters ?? splitNovelIntoChapters(parsed.text);
    if (!chapters.length) throw new Error('没有识别到可阅读的正文。');
    const now = new Date().toISOString();
    const book: NovelBook = {
      id: `catalog-${novel.id}`, title: novel.title, author: novel.author, language: novel.language,
      chapterCount: chapters.length, characterCount: chapters.reduce((total, item) => total + item.characterCount, 0),
      importedAt: now, lastReadAt: null, currentChapter: 0, chapterProgress: 0, chapterScrollTop: 0,
      anchorParagraph: -1, anchorOffsetRatio: 0, positionUpdatedAt: null, overallProgress: 0, readingSeconds: 0,
      sourceFileName: novel.originalFileName, description: novel.description, shelfOrder: -Date.now(), bookmarks: [],
      source: 'store', catalogNovelId: novel.id,
    };
    await saveNovelBook(book, chapters);
    if (bootstrap.userId) await uploadCloudBook(bootstrap.userId, book, chapters).catch(() => undefined);
    return book;
  }, [bootstrap.userId]);

  const syncLibrary = useCallback(async (localBooks: NovelBook[]) => {
    if (!bootstrap.userId) return localBooks;
    const supabase = createClient();
    const { data, error } = await supabase.from('reader_books').select('book_id, metadata, storage_path, content_hash, updated_at').eq('user_id', bootstrap.userId);
    if (error) throw error;
    const rows = (data ?? []) as CloudRow[];
    const localMap = new Map(localBooks.map((book) => [book.id, book]));
    const merged = [...localBooks];
    for (const row of rows) {
      const local = localMap.get(row.book_id);
      if (!local) {
        const downloaded = await downloadCloudBook(row);
        if (downloaded) { merged.push(downloaded); localMap.set(downloaded.id, downloaded); }
        continue;
      }
      const localPosition = local.positionUpdatedAt ?? '';
      const cloudPosition = row.metadata.positionUpdatedAt ?? '';
      if (cloudPosition > localPosition) {
        const updated = { ...local, ...row.metadata };
        await updateNovelBook(updated);
        const index = merged.findIndex((book) => book.id === updated.id);
        merged[index] = updated;
      } else if (localPosition > cloudPosition) await updateCloudMetadata(bootstrap.userId, local);
    }
    const cloudIds = new Set(rows.map((row) => row.book_id));
    for (const book of localBooks) if (!cloudIds.has(book.id)) await uploadCloudBook(bootstrap.userId, book, await listNovelChapters(book.id));
    const presentCatalogIds = new Set(merged.filter((book) => book.source === 'store' || book.id.startsWith('catalog-')).map((book) => book.catalogNovelId ?? book.id.replace(/^catalog-/u, '')));
    for (const novel of bootstrap.catalog) {
      if (!novel.needsReaderImport) continue;
      if (presentCatalogIds.has(novel.id)) { await acknowledgeCatalogNovelImport(novel.id); continue; }
      if (!novel.downloadUrl) continue;
      try { const book = await materializeCatalogNovel(novel); merged.unshift(book); presentCatalogIds.add(novel.id); await acknowledgeCatalogNovelImport(novel.id); } catch { /* A later sync can retry an unavailable signed URL. */ }
    }
    return merged;
  }, [bootstrap.catalog, bootstrap.userId, materializeCatalogNovel]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const local = (await listNovelBooks()).sort((left, right) => (right.lastReadAt ?? right.importedAt).localeCompare(left.lastReadAt ?? left.importedAt));
        const merged = await syncLibrary(local);
        if (!cancelled) setBooks(merged);
        if (bootstrap.userId && !cancelled) setMessage('云书架与阅读进度已同步。');
      } catch {
        if (!cancelled) { setBooks(await listNovelBooks().catch(() => [])); setMessage('当前离线，已打开本地书架；联网后会自动同步。'); }
      } finally { if (!cancelled) setReady(true); }
    })();
    return () => { cancelled = true; };
  }, [bootstrap.userId, syncLibrary]);

  async function persistBook(book: NovelBook) {
    await updateNovelBook(book);
    if (bootstrap.userId) await updateCloudMetadata(bootstrap.userId, book).catch(() => undefined);
  }

  useEffect(() => {
    if (view !== 'reader' || !activeId) return;
    const interval = window.setInterval(() => {
      setBooks((items) => items.map((book) => {
        if (book.id !== activeId) return book;
        const next = { ...book, readingSeconds: book.readingSeconds + 10, lastReadAt: new Date().toISOString() };
        void persistBook(next);
        return next;
      }));
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [activeId, view]);

  const visibleBooks = useMemo(() => books.filter((book) => {
    const matchesFilter = filter === 'all' || book.language === filter;
    const source = book.source ?? (book.id.startsWith('catalog-') ? 'store' : 'local');
    const matchesSource = sourceFilter === 'all' || source === sourceFilter;
    const matchesQuery = `${book.title} ${book.author}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return matchesFilter && matchesSource && matchesQuery;
  }).sort((left, right) => sort === 'title' ? left.title.localeCompare(right.title) : sort === 'progress' ? right.overallProgress - left.overallProgress : sort === 'custom' ? (left.shelfOrder ?? -new Date(left.importedAt).getTime()) - (right.shelfOrder ?? -new Date(right.importedAt).getTime()) : (right.lastReadAt ?? right.importedAt).localeCompare(left.lastReadAt ?? left.importedAt)), [books, filter, query, sort, sourceFilter]);

  const shelves = filter === 'all'
    ? [{ language: 'zh' as const, title: '中文书架', books: visibleBooks.filter((book) => book.language === 'zh') }, { language: 'en' as const, title: '英文书架', books: visibleBooks.filter((book) => book.language === 'en') }]
    : [{ language: filter, title: filter === 'zh' ? '中文书架' : '英文书架', books: visibleBooks }];

  function readEmergencyPosition(book: NovelBook): ReadingPosition {
    try {
      const value = JSON.parse(localStorage.getItem(`${POSITION_KEY_PREFIX}${book.id}`) || 'null') as Partial<ReadingPosition> | null;
      if (value && Number.isInteger(value.chapterIndex) && Number(value.chapterIndex) >= 0 && Number(value.chapterIndex) < book.chapterCount) {
        return {
          chapterIndex: Number(value.chapterIndex),
          chapterProgress: Number.isFinite(value.chapterProgress) ? Math.min(1, Math.max(0, Number(value.chapterProgress))) : book.chapterProgress,
          scrollTop: Number.isFinite(value.scrollTop) ? Math.max(0, Number(value.scrollTop)) : (book.chapterScrollTop ?? 0),
          anchorParagraph: Number.isInteger(value.anchorParagraph) ? Number(value.anchorParagraph) : (book.anchorParagraph ?? -1),
          anchorOffsetRatio: Number.isFinite(value.anchorOffsetRatio) ? Math.min(1, Math.max(0, Number(value.anchorOffsetRatio))) : (book.anchorOffsetRatio ?? 0),
          updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : (book.positionUpdatedAt ?? book.lastReadAt ?? book.importedAt),
        };
      }
    } catch { /* Fall back to the IndexedDB metadata. */ }
    return { chapterIndex: book.currentChapter, chapterProgress: book.chapterProgress, scrollTop: book.chapterScrollTop ?? 0, anchorParagraph: book.anchorParagraph ?? -1, anchorOffsetRatio: book.anchorOffsetRatio ?? 0, updatedAt: book.positionUpdatedAt ?? book.lastReadAt ?? book.importedAt };
  }

  function restoreReaderPosition() {
    const reader = readerRef.current;
    const position = restorePositionRef.current;
    if (!reader || !position) return;
    const anchor = position.anchorParagraph >= 0 ? reader.querySelector<HTMLElement>(`[data-reader-paragraph="${position.anchorParagraph}"]`) : null;
    if (anchor) {
      const readerTop = reader.getBoundingClientRect().top;
      const anchorTop = anchor.getBoundingClientRect().top - readerTop + reader.scrollTop;
      reader.scrollTop = Math.max(0, anchorTop + anchor.offsetHeight * position.anchorOffsetRatio);
    } else if (position.scrollTop > 0) {
      reader.scrollTop = Math.min(position.scrollTop, Math.max(0, reader.scrollHeight - reader.clientHeight));
    } else {
      reader.scrollTop = position.chapterProgress * Math.max(0, reader.scrollHeight - reader.clientHeight);
    }
  }

  function overallProgress(chapterIndex: number, chapterProgress: number): number {
    return calculateNovelProgressByCharacters(chapterIndex, chapterProgress, headings.map((item) => item.characterCount));
  }

  async function openBook(book: NovelBook) {
    setMessage('');
    try {
      const chapterHeadings = await listNovelChapterHeadings(book.id);
      const position = readEmergencyPosition(book);
      const target = await getNovelChapter(book.id, position.chapterIndex);
      if (!target) throw new Error('没有找到保存的章节正文。');
      const resumedBook = { ...book, currentChapter: position.chapterIndex, chapterProgress: position.chapterProgress, chapterScrollTop: position.scrollTop, anchorParagraph: position.anchorParagraph, anchorOffsetRatio: position.anchorOffsetRatio, positionUpdatedAt: position.updatedAt, overallProgress: calculateNovelProgressByCharacters(position.chapterIndex, position.chapterProgress, chapterHeadings.map((item) => item.characterCount)) };
      restorePositionRef.current = position;
      setActiveId(book.id);
      setBooks((items) => items.map((item) => item.id === book.id ? resumedBook : item));
      setHeadings(chapterHeadings);
      setChapter(target);
      setSelectedWord(null);
      setView('reader');
      requestAnimationFrame(() => requestAnimationFrame(restoreReaderPosition));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '打开小说失败。');
    }
  }

  async function loadChapter(index: number, restoreRatio = 0, requestedPosition?: ReadingPosition) {
    if (!activeBook || index < 0 || index >= activeBook.chapterCount) return;
    saveCurrentPosition();
    const nextChapter = await getNovelChapter(activeBook.id, index);
    if (!nextChapter) return;
    const now = new Date().toISOString();
    const position = requestedPosition ?? { chapterIndex: index, chapterProgress: restoreRatio, scrollTop: 0, anchorParagraph: -1, anchorOffsetRatio: 0, updatedAt: now };
    restorePositionRef.current = position;
    setChapter(nextChapter);
    setSelectedWord(null);
    const nextBook = { ...activeBook, currentChapter: index, chapterProgress: position.chapterProgress, chapterScrollTop: position.scrollTop, anchorParagraph: position.anchorParagraph, anchorOffsetRatio: position.anchorOffsetRatio, positionUpdatedAt: now, overallProgress: overallProgress(index, position.chapterProgress), lastReadAt: now };
    setBooks((items) => items.map((book) => book.id === nextBook.id ? nextBook : book));
    await persistBook(nextBook);
    try { localStorage.setItem(`${POSITION_KEY_PREFIX}${nextBook.id}`, JSON.stringify(restorePositionRef.current)); } catch { /* IndexedDB remains the durable fallback. */ }
    requestAnimationFrame(() => requestAnimationFrame(restoreReaderPosition));
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

  function captureReadingPosition(): ReadingPosition | null {
    const reader = readerRef.current;
    if (!reader || !chapter) return null;
    const maximum = Math.max(0, reader.scrollHeight - reader.clientHeight);
    const chapterProgress = maximum ? Math.min(1, Math.max(0, reader.scrollTop / maximum)) : 1;
    const readerTop = reader.getBoundingClientRect().top;
    const paragraphs = Array.from(reader.querySelectorAll<HTMLElement>('[data-reader-paragraph]'));
    const firstParagraph = paragraphs[0];
    const firstParagraphTop = firstParagraph ? firstParagraph.getBoundingClientRect().top - readerTop + reader.scrollTop : Number.POSITIVE_INFINITY;
    const anchor = reader.scrollTop + 2 >= firstParagraphTop ? paragraphs.find((item) => item.getBoundingClientRect().bottom > readerTop + 1) : null;
    const anchorParagraph = anchor ? Number(anchor.dataset.readerParagraph) : -1;
    const anchorOffsetRatio = anchor?.offsetHeight ? Math.min(1, Math.max(0, (readerTop - anchor.getBoundingClientRect().top) / anchor.offsetHeight)) : 0;
    return { chapterIndex: chapter.index, chapterProgress, scrollTop: reader.scrollTop, anchorParagraph, anchorOffsetRatio, updatedAt: new Date().toISOString() };
  }

  function persistPosition() {
    if (!activeBook || !chapter) return;
    const position = captureReadingPosition();
    if (!position) return;
    const next = { ...activeBook, currentChapter: chapter.index, chapterProgress: position.chapterProgress, chapterScrollTop: position.scrollTop, anchorParagraph: position.anchorParagraph, anchorOffsetRatio: position.anchorOffsetRatio, positionUpdatedAt: position.updatedAt, overallProgress: overallProgress(chapter.index, position.chapterProgress), lastReadAt: position.updatedAt };
    setBooks((items) => items.map((book) => book.id === next.id ? next : book));
    void persistBook(next);
    try { localStorage.setItem(`${POSITION_KEY_PREFIX}${next.id}`, JSON.stringify(position)); } catch { /* IndexedDB remains the durable fallback. */ }
  }

  function saveCurrentPosition() {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    persistPosition();
  }

  function schedulePositionSave() {
    if (activeBook) {
      const position = captureReadingPosition();
      if (position) try { localStorage.setItem(`${POSITION_KEY_PREFIX}${activeBook.id}`, JSON.stringify(position)); } catch { /* Ignore emergency bookmark failures. */ }
    }
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => persistPosition(), 450);
  }

  function addBookmark() {
    if (!activeBook || !chapter) return;
    const position = captureReadingPosition();
    if (!position) return;
    const bookmark: NovelBookmark = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `bookmark-${Date.now()}`,
      chapterIndex: chapter.index,
      paragraphIndex: position.anchorParagraph,
      offsetRatio: position.anchorOffsetRatio,
      label: `${chapter.title}${position.anchorParagraph >= 0 ? ` · 第 ${position.anchorParagraph + 1} 段` : ''}`,
      createdAt: position.updatedAt,
    };
    const next = { ...activeBook, bookmarks: [...(activeBook.bookmarks ?? []), bookmark] };
    setBooks((items) => items.map((book) => book.id === next.id ? next : book));
    void persistBook(next);
    setMessage(`已添加书签：${bookmark.label}`);
  }

  async function openBookmark(bookmark: NovelBookmark) {
    const now = new Date().toISOString();
    await loadChapter(bookmark.chapterIndex, 0, { chapterIndex: bookmark.chapterIndex, chapterProgress: 0, scrollTop: 0, anchorParagraph: bookmark.paragraphIndex, anchorOffsetRatio: bookmark.offsetRatio, updatedAt: now });
  }

  function removeBookmark(bookmarkId: string) {
    if (!activeBook) return;
    const next = { ...activeBook, bookmarks: (activeBook.bookmarks ?? []).filter((bookmark) => bookmark.id !== bookmarkId) };
    setBooks((items) => items.map((book) => book.id === next.id ? next : book));
    void persistBook(next);
  }

  async function importBooks() {
    if (!files.length) { setMessage('请先选择一本或多本小说文件。'); return; }
    setImporting(true);
    const imported: NovelBook[] = [];
    const failures: string[] = [];
    for (const [index, selectedFile] of files.entries()) {
      setMessage(`正在导入 ${index + 1}/${files.length}：《${selectedFile.name}》…`);
      try {
        if (!isSupportedNovelFile(selectedFile.name)) throw new Error('文件格式不受支持');
        const parsed = await parseNovelFile(selectedFile, encoding);
        const chapters = parsed.chapters ?? splitNovelIntoChapters(parsed.text);
        if (!chapters.length) throw new Error('文件中没有可读取的正文');
        const now = new Date().toISOString();
        const book: NovelBook = {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `novel-${Date.now()}-${index}`,
          title: files.length === 1 && bookTitle.trim() ? bookTitle.trim() : parsed.title,
          author: author.trim() || parsed.author,
          language: language === 'auto' ? detectNovelLanguage(parsed.text) : language,
          chapterCount: chapters.length,
          characterCount: chapters.reduce((total, item) => total + item.characterCount, 0),
          importedAt: now,
          lastReadAt: null,
          currentChapter: 0,
          chapterProgress: 0,
          chapterScrollTop: 0,
          anchorParagraph: -1,
          anchorOffsetRatio: 0,
          positionUpdatedAt: null,
          overallProgress: 0,
          readingSeconds: 0,
          sourceFileName: selectedFile.name,
          description: '',
          shelfOrder: -Date.now() - index,
          bookmarks: [],
          source: 'local',
        };
        await saveNovelBook(book, chapters);
        if (bootstrap.userId) await uploadCloudBook(bootstrap.userId, book, chapters).catch(() => undefined);
        imported.push(book);
      } catch (error) {
        failures.push(`${selectedFile.name}（${error instanceof Error ? error.message : '导入失败'}）`);
      }
    }
    if (imported.length) setBooks((items) => [...imported.reverse(), ...items]);
    setImporting(false);
    const summary = `已成功导入 ${imported.length}/${files.length} 本。`;
    setMessage(failures.length ? `${summary} 失败：${failures.join('；')}` : summary);
    if (imported.length) {
      setFiles([]); setBookTitle(''); setAuthor(''); setLanguage('auto');
      setView('library');
    }
  }

  async function addFromStore(novel: CatalogNovel) {
    if (!novel.unlocked || !novel.downloadUrl || importing) return;
    setImporting(true);
    setMessage(`正在领取《${novel.title}》…`);
    try {
      const book = await materializeCatalogNovel(novel);
      setBooks((items) => [book, ...items.filter((item) => item.id !== book.id)]);
      setMessage(`《${book.title}》已加入你的书架。`);
      setView('library');
    } catch (error) { setMessage(error instanceof Error ? error.message : '领取小说失败。'); }
    finally { setImporting(false); }
  }

  async function beginEditingBook(book: NovelBook) {
    setEditorBusy(true);
    setMessage('正在载入图书信息与章节…');
    try {
      const chapters = await listNovelChapters(book.id);
      setEditingBookId(book.id);
      setEditingTitle(book.title);
      setEditingAuthor(book.author);
      setEditingDescription(book.description ?? '');
      setEditingCover(book.coverDataUrl ?? '');
      setEditorChapters(chapters);
      setEditingChapterIndex(null);
      setNewChapterTitle('');
      setNewChapterContent('');
      setMessage('');
      setView('edit');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '载入图书信息失败。');
    } finally {
      setEditorBusy(false);
    }
  }

  async function saveBookInformation() {
    const book = books.find((item) => item.id === editingBookId);
    if (!book || !editingTitle.trim()) { setMessage('书名不能为空。'); return; }
    const next = { ...book, title: editingTitle.trim(), author: editingAuthor.trim(), description: editingDescription.trim(), coverDataUrl: editingCover || undefined };
    await persistBook(next);
    setBooks((items) => items.map((item) => item.id === next.id ? next : item));
    setMessage('图书信息已保存。');
  }

  function selectChapterForEditing(chapterToEdit: NovelChapter) {
    setEditingChapterIndex(chapterToEdit.index);
    setChapterDraftTitle(chapterToEdit.title);
    setChapterDraftContent(chapterToEdit.content);
  }

  async function commitChapterCollection(nextChapters: NovelChapter[], status: string, resetPosition = false, bookmarks?: NovelBookmark[]) {
    const book = books.find((item) => item.id === editingBookId);
    if (!book || !nextChapters.length) return;
    const normalized = nextChapters.map((item, index) => ({ ...item, index, title: item.title.trim() || `第 ${index + 1} 章`, content: item.content.trim(), characterCount: item.content.trim().length }));
    await replaceNovelChapters(book.id, normalized);
    const currentChapter = Math.min(book.currentChapter, normalized.length - 1);
    const nextBook: NovelBook = {
      ...book,
      chapterCount: normalized.length,
      characterCount: normalized.reduce((total, item) => total + item.characterCount, 0),
      currentChapter,
      chapterProgress: resetPosition ? 0 : book.chapterProgress,
      overallProgress: resetPosition ? 0 : Math.min(book.overallProgress, 1),
      chapterScrollTop: resetPosition ? 0 : book.chapterScrollTop,
      anchorParagraph: resetPosition ? -1 : book.anchorParagraph,
      bookmarks: bookmarks ?? (book.bookmarks ?? []).filter((bookmark) => bookmark.chapterIndex < normalized.length),
    };
    await persistBook(nextBook);
    if (bootstrap.userId) await uploadCloudBook(bootstrap.userId, nextBook, normalized).catch(() => undefined);
    if (resetPosition) try { localStorage.removeItem(`${POSITION_KEY_PREFIX}${book.id}`); } catch { /* IndexedDB has already been reset. */ }
    setBooks((items) => items.map((item) => item.id === nextBook.id ? nextBook : item));
    setEditorChapters(normalized);
    setMessage(status);
  }

  async function saveEditedChapter() {
    if (editingChapterIndex === null || !chapterDraftTitle.trim()) { setMessage('章节标题不能为空。'); return; }
    const next = editorChapters.map((item) => item.index === editingChapterIndex ? { ...item, title: chapterDraftTitle, content: chapterDraftContent } : item);
    await commitChapterCollection(next, '章节修改已保存。');
    setEditingChapterIndex(null);
  }

  async function addChapter() {
    if (!newChapterTitle.trim()) { setMessage('请填写新章节标题。'); return; }
    await commitChapterCollection([...editorChapters, { index: editorChapters.length, title: newChapterTitle, content: newChapterContent, characterCount: newChapterContent.trim().length }], '新章节已添加。');
    setNewChapterTitle('');
    setNewChapterContent('');
  }

  async function removeChapterFromBook(chapterIndex: number) {
    if (editorChapters.length <= 1) { setMessage('一本书至少需要保留一个章节。'); return; }
    const target = editorChapters[chapterIndex];
    if (!window.confirm(`确定删除章节“${target.title}”吗？`)) return;
    const book = books.find((item) => item.id === editingBookId);
    const nextBookmarks = (book?.bookmarks ?? []).flatMap((bookmark) => bookmark.chapterIndex === chapterIndex ? [] : [{ ...bookmark, chapterIndex: bookmark.chapterIndex > chapterIndex ? bookmark.chapterIndex - 1 : bookmark.chapterIndex }]);
    await commitChapterCollection(editorChapters.filter((item) => item.index !== chapterIndex), `已删除章节“${target.title}”。`, true, nextBookmarks);
    setEditingChapterIndex(null);
  }

  async function rescanBookChapters() {
    const book = books.find((item) => item.id === editingBookId);
    if (!book) return;
    if (/\.epub$/iu.test(book.sourceFileName)) { setMessage('EPUB 已按书内目录导入，无需重新扫描文本标题。'); return; }
    if (!window.confirm('重新扫描会按照新规则重建章节目录，并重置本书阅读进度。继续吗？')) return;
    const source = editorChapters.map((item) => item.title === '卷首' ? item.content : `${item.title}\n${item.content}`).join('\n\n');
    const rescanned = splitNovelIntoChapters(source);
    if (!rescanned.length) { setMessage('重新扫描后没有找到可读取的正文。'); return; }
    await commitChapterCollection(rescanned, `重新扫描完成：${editorChapters.length} 章 → ${rescanned.length} 章。`, true, []);
  }

  async function moveShelfBook(book: NovelBook, offset: -1 | 1) {
    const ordered = books.filter((item) => item.language === book.language).sort((left, right) => (left.shelfOrder ?? -new Date(left.importedAt).getTime()) - (right.shelfOrder ?? -new Date(right.importedAt).getTime()));
    const currentIndex = ordered.findIndex((item) => item.id === book.id);
    const targetIndex = currentIndex + offset;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    [ordered[currentIndex], ordered[targetIndex]] = [ordered[targetIndex], ordered[currentIndex]];
    const updates = ordered.map((item, index) => ({ ...item, shelfOrder: index }));
    const byId = new Map(updates.map((item) => [item.id, item]));
    setBooks((items) => items.map((item) => byId.get(item.id) ?? item));
    await Promise.all(updates.map(persistBook));
  }

  async function removeBook(book: NovelBook) {
    if (!window.confirm(`确定删除《${book.title}》及全部章节吗？此操作无法撤销。`)) return;
    await deleteNovelBook(book.id);
    if (bootstrap.userId) {
      const supabase = createClient();
      await Promise.all([
        supabase.from('reader_books').delete().eq('user_id', bootstrap.userId).eq('book_id', book.id),
        supabase.storage.from('novel-files').remove([cloudPath(bootstrap.userId, book.id)]),
      ]);
    }
    try { localStorage.removeItem(`${POSITION_KEY_PREFIX}${book.id}`); } catch { /* The IndexedDB deletion already succeeded. */ }
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
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{activeBook.title}</p><p className="truncate text-xs opacity-60">{chapter.title} · {formatProgress(activeBook.overallProgress)}</p></div>
          <button type="button" onClick={addBookmark} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-black/5" aria-label="添加书签"><span className="material-icons-round">bookmark_add</span></button>
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
          {(activeBook.bookmarks ?? []).length > 0 && <section className="mb-4 border-b border-black/10 pb-3"><p className="mb-2 text-xs font-bold uppercase tracking-wider opacity-60">书签 · {activeBook.bookmarks?.length}</p><div className="space-y-1">{activeBook.bookmarks?.map((bookmark) => <div key={bookmark.id} className="flex items-center gap-1"><button type="button" onClick={() => void openBookmark(bookmark)} className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-xs hover:bg-black/5"><span className="line-clamp-2">{bookmark.label}</span></button><button type="button" onClick={() => removeBookmark(bookmark.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-black/5" aria-label={`删除书签 ${bookmark.label}`}><span className="material-icons-round text-base">close</span></button></div>)}</div></section>}
          <div className="space-y-1">{filteredHeadings.map((item) => <button type="button" key={item.index} onClick={() => void loadChapter(item.index)} className={`w-full rounded-xl px-3 py-2.5 text-left text-sm leading-5 ${item.index === chapter.index ? 'bg-[#0f766e] font-bold text-white' : 'hover:bg-black/5'}`}><span className="line-clamp-2">{item.title}</span></button>)}</div>
        </aside>}
        <main ref={readerRef} onScroll={schedulePositionSave} className="min-w-0 flex-1 overflow-y-auto scroll-smooth">
          <article className={`mx-auto px-6 py-12 sm:px-10 sm:py-16 ${widthClasses[contentWidth]}`}>
            <p className="text-center text-xs font-bold uppercase tracking-[.16em] opacity-50">第 {chapter.index + 1} / {activeBook.chapterCount} 章</p>
            <h1 className="mt-3 text-center font-serif text-3xl font-bold leading-tight sm:text-4xl">{chapter.title}</h1>
            <div className="mt-10 font-serif" style={{ fontSize, lineHeight }} lang={activeBook.language === 'zh' ? 'zh-CN' : 'en'}>{chapter.content.split(/\n\s*\n/u).map((paragraph, index) => <p key={index} data-reader-paragraph={index} className={`mb-[1.25em] ${activeBook.language === 'zh' ? 'text-justify indent-[2em]' : ''}`}>{activeBook.language === 'en' ? tokens(paragraph).map((token, tokenIndex) => /^[A-Za-z]/.test(token) ? <button type="button" key={tokenIndex} onClick={() => void lookupWord(token, paragraph)} className="rounded px-px text-inherit underline-offset-4 hover:bg-[#facc15]/35 hover:underline">{token}</button> : <span key={tokenIndex}>{token}</span>) : paragraph}</p>)}</div>
            <nav className="mt-16 grid grid-cols-2 gap-3 border-t border-black/10 pt-8"><button type="button" disabled={chapter.index === 0} onClick={() => void moveChapter(-1)} className="min-h-12 rounded-xl border border-black/15 font-bold disabled:opacity-30">← 上一章</button><button type="button" disabled={chapter.index >= activeBook.chapterCount - 1} onClick={() => void moveChapter(1)} className="min-h-12 rounded-xl bg-[#0f766e] font-bold text-white disabled:opacity-30">下一章 →</button></nav>
          </article>
        </main>
        {activeBook.language === 'en' && selectedWord && <aside className="w-72 shrink-0 overflow-y-auto border-l border-black/10 p-5 max-xl:absolute max-xl:right-4 max-xl:top-20 max-xl:z-20 max-xl:rounded-2xl max-xl:border max-xl:bg-inherit max-xl:shadow-2xl"><div className="flex items-start justify-between"><strong className="font-serif text-2xl">{selectedWord.word}</strong><button type="button" onClick={() => setSelectedWord(null)} aria-label="关闭释义"><span className="material-icons-round">close</span></button></div><p className="mt-1 text-xs font-bold uppercase text-[#0f766e]">{selectedWord.phonetic} · {selectedWord.partOfSpeech}</p><p className="mt-4 text-xl font-bold">{selectedWord.translation}</p><p className="mt-3 text-sm leading-6 opacity-75">{selectedWord.definition}</p><p className="mt-4 rounded-xl bg-black/5 p-3 text-sm italic leading-6">{selectedWord.example}</p>{wordLoading && <p className="mt-3 text-xs">查询中…</p>}</aside>}
      </div>
      {message && <p role="status" className="absolute bottom-4 left-1/2 z-30 max-w-[90%] -translate-x-1/2 rounded-full bg-[#0f766e] px-4 py-2 text-sm font-bold text-white shadow-lg">{message}</p>}
    </div>;
  }

  return <div className="mx-auto max-w-[1500px] space-y-5 text-[var(--foreground)]">
    <header className="relative isolate overflow-hidden rounded-[28px] bg-[linear-gradient(118deg,#211c18_0%,#5c3d2e_52%,#0f766e_100%)] px-5 py-7 text-white shadow-[0_24px_70px_rgba(28,23,18,.22)] sm:px-8"><div className="pointer-events-none absolute -right-16 -top-20 -z-10 h-72 w-72 rounded-full bg-[#f5d0a9]/20 blur-3xl"/><p className="text-xs font-bold uppercase tracking-[.2em] text-[#fde7cf]">JACKYUN READER</p><div className="mt-2 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">我的小说书架</h1><p className="mt-3 max-w-3xl leading-7 text-[#f6e8db]">中英文长篇小说分章阅读，登录后自动同步全部书籍、书签和阅读进度。</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setView('import')} className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-[#493225]"><span className="material-icons-round mr-2 align-middle">upload_file</span>导入小说</button><button type="button" onClick={onOpenAiStudio} className="min-h-11 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-bold hover:bg-white/15"><span className="material-icons-round mr-2 align-middle">auto_awesome</span>AI 阅读工坊</button></div></div></header>
    <nav className={`grid gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-2 ${storeEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
      <button type="button" onClick={() => setView('library')} className={`min-h-12 rounded-xl text-sm font-bold ${view === 'library' ? 'bg-[#0f766e] text-white' : ''}`}><span className="material-icons-round mr-2 align-middle">local_library</span>书架</button>
      {storeEnabled && <button type="button" onClick={() => setView('store')} className={`min-h-12 rounded-xl text-sm font-bold ${view === 'store' ? 'bg-[#0f766e] text-white' : ''}`}><span className="material-icons-round mr-2 align-middle">storefront</span>小说商店</button>}
      <button type="button" onClick={() => setView('import')} className={`min-h-12 rounded-xl text-sm font-bold ${view === 'import' ? 'bg-[#0f766e] text-white' : ''}`}><span className="material-icons-round mr-2 align-middle">add_circle</span>导入</button>
    </nav>
    {message && <p role="status" className="rounded-2xl border border-[#99d9d1] bg-[#ecfdf5] px-4 py-3 text-sm text-[#115e59] dark:border-[#285e57] dark:bg-[#123b36] dark:text-[#99f6e4]">{message}</p>}

    {view === 'store' && <section className="space-y-5">
      <div className="rounded-3xl bg-[linear-gradient(120deg,#0f766e,#155e75)] p-6 text-white shadow-lg"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#99f6e4]">NOVEL STORE</p><h2 className="mt-2 text-3xl font-bold">精选小说商店</h2><p className="mt-2 text-sm text-[#ccfbf1]">当前账号：{bootstrap.plan.toUpperCase()}，已解锁书籍可直接加入云书架。</p></div>
      {!bootstrap.catalog.length ? <div className="rounded-3xl border border-dashed border-[var(--card-border)] bg-[var(--card)] p-12 text-center text-[var(--muted-foreground)]">商店暂无小说，管理员上传后会显示在这里。</div> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{bootstrap.catalog.map((novel) => {
        const added = storeIds.has(novel.id);
        return <article key={novel.id} className="overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm"><div className="h-44 bg-[linear-gradient(135deg,#134e4a,#0e7490)] bg-cover bg-center" style={novel.coverUrl ? { backgroundImage: `url(${novel.coverUrl})` } : undefined} /><div className="p-5"><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-[#ecfdf5] px-2.5 py-1 text-xs font-bold text-[#047857]">{novel.minimumPlan.toUpperCase()}+</span><div className="flex gap-2">{novel.owned && <span className="rounded-full bg-[#eff4ff] px-2.5 py-1 text-xs font-bold text-[#155eef]">已拥有</span>}{novel.featured && <span className="rounded-full bg-[#fffaeb] px-2.5 py-1 text-xs font-bold text-[#b45309]">精选</span>}</div></div><h3 className="mt-4 font-serif text-xl font-bold">{novel.title}</h3><p className="mt-1 text-sm text-[var(--muted-foreground)]">{novel.author || '未知作者'}</p><p className="mt-3 line-clamp-3 min-h-15 text-sm leading-5 text-[var(--muted-foreground)]">{novel.description || '暂无简介'}</p><button type="button" disabled={!novel.unlocked || added || importing} onClick={() => void addFromStore(novel)} className="mt-5 min-h-11 w-full rounded-xl bg-[#0f766e] px-4 text-sm font-bold text-white disabled:bg-[#98a2b3]">{added ? '已在阅读器' : novel.owned ? '已拥有 · 加入阅读器' : novel.unlocked ? '加入阅读器' : `需要 ${novel.minimumPlan.toUpperCase()} 会员`}</button></div></article>;
      })}</div>}
    </section>}

    {view === 'edit' && <section className="space-y-5">
      <div className="flex flex-col gap-3 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0f766e]">BOOK EDITOR</p><h2 className="mt-1 text-2xl font-bold">编辑图书与章节</h2></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void rescanBookChapters()} disabled={editorBusy} className="min-h-11 rounded-xl border border-[#0f766e] px-4 text-sm font-bold text-[#0f766e] disabled:opacity-40"><span className="material-icons-round mr-2 align-middle text-base">restart_alt</span>重新扫描章节</button><button type="button" onClick={() => setView('library')} className="min-h-11 rounded-xl bg-[#0f766e] px-4 text-sm font-bold text-white">返回书架</button></div></div>
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm"><h3 className="text-lg font-bold">图书信息</h3><div className="mt-4 flex gap-4"><label className="grid h-40 w-28 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-r-2xl rounded-l-md border-2 border-dashed border-[var(--card-border)] bg-[var(--background)] text-center text-xs text-[var(--muted-foreground)]">{editingCover ? <span role="img" aria-label="图书封面预览" className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${editingCover})` }} /> : <span><span className="material-icons-round block text-3xl">add_photo_alternate</span>添加封面</span>}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void coverFileToDataUrl(selected).then(setEditingCover).catch((error: Error) => setMessage(error.message)); event.target.value = ''; }} /></label><div className="min-w-0 flex-1 space-y-3"><label className="block text-sm font-bold">书名<input value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3" /></label><label className="block text-sm font-bold">作者<input value={editingAuthor} onChange={(event) => setEditingAuthor(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3" /></label></div></div><label className="mt-4 block text-sm font-bold">图书简介<textarea value={editingDescription} onChange={(event) => setEditingDescription(event.target.value)} rows={5} className="mt-1 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 leading-6" placeholder="介绍故事、版本或阅读备注" /></label><div className="mt-4 flex gap-2"><button type="button" onClick={() => void saveBookInformation()} className="min-h-11 flex-1 rounded-xl bg-[#0f766e] px-4 text-sm font-bold text-white">保存图书信息</button>{editingCover && <button type="button" onClick={() => setEditingCover('')} className="min-h-11 rounded-xl border border-[var(--card-border)] px-3 text-sm">移除封面</button>}</div></section>
        <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="text-lg font-bold">章节管理</h3><p className="text-xs text-[var(--muted-foreground)]">{editorChapters.length} 章 · 可编辑、增加或删除</p></div></div><div className="mt-4 grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]"><div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">{editorChapters.map((item) => <div key={item.index} className={`flex items-center gap-2 rounded-xl border p-2 ${editingChapterIndex === item.index ? 'border-[#0f766e] bg-[#ecfdf5] dark:bg-[#123b36]' : 'border-[var(--card-border)]'}`}><button type="button" onClick={() => selectChapterForEditing(item)} className="min-w-0 flex-1 px-1 text-left"><span className="line-clamp-2 text-sm font-bold">{item.title}</span><span className="text-xs text-[var(--muted-foreground)]">{formatSize(item.characterCount)}</span></button><button type="button" onClick={() => void removeChapterFromBook(item.index)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#b91c1c] hover:bg-[#fee2e2]" aria-label={`删除章节 ${item.title}`}><span className="material-icons-round text-lg">delete</span></button></div>)}</div><div className="space-y-4">{editingChapterIndex !== null ? <div className="rounded-2xl bg-[var(--background)] p-4"><h4 className="font-bold">编辑第 {editingChapterIndex + 1} 章</h4><input value={chapterDraftTitle} onChange={(event) => setChapterDraftTitle(event.target.value)} className="mt-3 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 font-bold" placeholder="章节标题" /><textarea value={chapterDraftContent} onChange={(event) => setChapterDraftContent(event.target.value)} rows={10} className="mt-3 w-full rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 font-serif leading-7" placeholder="章节正文" /><div className="mt-3 flex gap-2"><button type="button" onClick={() => void saveEditedChapter()} className="min-h-11 flex-1 rounded-xl bg-[#0f766e] px-4 text-sm font-bold text-white">保存章节</button><button type="button" onClick={() => setEditingChapterIndex(null)} className="min-h-11 rounded-xl border border-[var(--card-border)] px-4 text-sm">取消</button></div></div> : <div className="rounded-2xl border border-dashed border-[var(--card-border)] p-6 text-center text-sm text-[var(--muted-foreground)]">从左侧选择一个章节进行编辑</div>}<div className="rounded-2xl border border-[var(--card-border)] p-4"><h4 className="font-bold">在末尾增加章节</h4><input value={newChapterTitle} onChange={(event) => setNewChapterTitle(event.target.value)} className="mt-3 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3" placeholder="新章节标题" /><textarea value={newChapterContent} onChange={(event) => setNewChapterContent(event.target.value)} rows={5} className="mt-3 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3" placeholder="章节正文（可稍后编辑）" /><button type="button" onClick={() => void addChapter()} className="mt-3 min-h-11 w-full rounded-xl border border-[#0f766e] px-4 text-sm font-bold text-[#0f766e]">添加章节</button></div></div></div></section>
      </div>
    </section>}

    {view === 'import' && <section className="mx-auto max-w-3xl rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e6f7f4] text-[#0f766e]"><span className="material-icons-round">library_add</span></span><div><h2 className="text-2xl font-bold">批量导入小说</h2><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">可一次选择多本 TXT、Markdown、HTML 或 EPUB。文本支持 UTF-8 和 GB18030；EPUB 会按书内阅读顺序建立章节。</p></div></div>
      <label className="mt-6 grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-[#70b9ae] bg-[#f0fdfa] px-5 py-8 text-center dark:bg-[#123b36]">
        <span className="material-icons-round text-4xl text-[#0f766e]">upload_file</span>
        <strong className="mt-2">{files.length ? `已选择 ${files.length} 本书` : '选择一本或多本小说'}</strong>
        <span className="mt-1 text-xs text-[var(--muted-foreground)]">.txt、.text、.md、.markdown、.html、.htm、.epub</span>
        <input type="file" multiple accept={NOVEL_FILE_ACCEPT} className="sr-only" onChange={(event) => {
          const selected = Array.from(event.target.files ?? []);
          setFiles(selected);
          setBookTitle(selected.length === 1 ? inferNovelTitle(selected[0].name) : '');
          event.target.value = '';
        }} />
      </label>
      {files.length > 0 && <div className="mt-4 max-h-48 space-y-2 overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-3">{files.map((selectedFile) => <div key={`${selectedFile.name}-${selectedFile.lastModified}`} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--card)] px-3 py-2 text-sm"><span className="min-w-0 truncate font-medium">{selectedFile.name}</span><span className="shrink-0 text-xs text-[var(--muted-foreground)]">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</span></div>)}</div>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">书名（仅单本时可修改）<input value={bookTitle} disabled={files.length !== 1} onChange={(event) => setBookTitle(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 outline-none disabled:opacity-50" placeholder="批量导入时自动使用书内标题或文件名" /></label>
        <label className="text-sm font-bold">统一作者（可选）<input value={author} onChange={(event) => setAuthor(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 outline-none" placeholder="留空则读取 EPUB 作者信息" /></label>
        <label className="text-sm font-bold">语言<select value={language} onChange={(event) => setLanguage(event.target.value as 'auto' | NovelLanguage)} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3"><option value="auto">每本自动识别</option><option value="zh">全部设为中文</option><option value="en">全部设为英文</option></select></label>
        <label className="text-sm font-bold">文本文件编码<select value={encoding} onChange={(event) => setEncoding(event.target.value as 'auto' | 'utf-8' | 'gb18030')} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3"><option value="auto">自动（推荐）</option><option value="utf-8">UTF-8</option><option value="gb18030">GB18030 / GBK</option></select></label>
      </div>
      <button type="button" onClick={() => void importBooks()} disabled={!files.length || importing} className="mt-6 min-h-13 w-full rounded-2xl bg-[#0f766e] px-5 font-bold text-white disabled:opacity-40">{importing ? `正在逐本导入，共 ${files.length} 本…` : `导入 ${files.length || ''} 本并建立目录`}</button>
    </section>}

    {view === 'library' && <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-2">{([{ id: 'all', label: `全部图书 ${books.length}`, icon: 'library_books' }, { id: 'local', label: `本地导入 ${books.filter((book) => book.source !== 'store' && !book.id.startsWith('catalog-')).length}`, icon: 'upload_file' }, { id: 'store', label: `商店图书 ${books.filter((book) => book.source === 'store' || book.id.startsWith('catalog-')).length}`, icon: 'storefront' }] as Array<{ id: SourceFilter; label: string; icon: string }>).map((item) => <button type="button" key={item.id} onClick={() => setSourceFilter(item.id)} className={`min-h-11 rounded-xl px-3 text-sm font-bold ${sourceFilter === item.id ? 'bg-[#155eef] text-white' : 'text-[var(--muted-foreground)]'}`}><span className="material-icons-round mr-1 align-middle text-base">{item.icon}</span>{item.label}</button>)}</div>}
    {view === 'library' && <section className="space-y-6"><div className="flex flex-col gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-3 lg:flex-row"><div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--background)] p-1">{([{ id: 'all', label: `全部 ${books.length}` }, { id: 'zh', label: `中文 ${books.filter((book) => book.language === 'zh').length}` }, { id: 'en', label: `英文 ${books.filter((book) => book.language === 'en').length}` }] as Array<{ id: ShelfFilter; label: string }>).map((item) => <button type="button" key={item.id} onClick={() => setFilter(item.id)} className={`min-h-10 rounded-lg px-4 text-sm font-bold ${filter === item.id ? 'bg-[#0f766e] text-white shadow-sm' : ''}`}>{item.label}</button>)}</div><label className="relative flex-1"><span className="material-icons-round absolute left-3 top-2.5 text-[var(--muted-foreground)]">search</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] pl-10 pr-3 outline-none" placeholder="搜索书名或作者" /></label><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="min-h-11 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 text-sm font-bold"><option value="recent">最近阅读</option><option value="custom">自定义顺序</option><option value="title">书名排序</option><option value="progress">阅读进度</option></select></div>{ready && !books.length ? <div className="rounded-3xl border border-dashed border-[var(--card-border)] bg-[var(--card)] px-6 py-16 text-center"><span className="material-icons-round text-6xl text-[#70a99e]">auto_stories</span><h2 className="mt-4 text-2xl font-bold">把第一部长篇放进书架</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--muted-foreground)]">小说正文存入 IndexedDB，不受普通 localStorage 容量限制。无论几十章还是上千章，阅读器每次只加载当前章节。</p><button type="button" onClick={() => setView('import')} className="mt-6 rounded-xl bg-[#0f766e] px-5 py-3 font-bold text-white">导入小说</button></div> : shelves.map((shelf) => shelf.books.length ? <div key={shelf.language}><div className="mb-3 flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${shelf.language === 'zh' ? 'bg-[#f5e6d3] text-[#8b5e3c]' : 'bg-[#dff4ef] text-[#0f766e]'}`}><span className="material-icons-round">{shelf.language === 'zh' ? 'history_edu' : 'translate'}</span></span><div><h2 className="text-xl font-bold">{shelf.title}</h2><p className="text-xs text-[var(--muted-foreground)]">{shelf.books.length} 本 · {sort === 'custom' ? '使用箭头自由排序' : shelf.language === 'en' ? '支持点词翻译' : '纯净中文阅读'}</p></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{shelf.books.map((book, index) => <article key={book.id} className="group overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><div className={`h-2 ${shelf.language === 'zh' ? 'bg-[linear-gradient(90deg,#8b5e3c,#d2a679)]' : 'bg-[linear-gradient(90deg,#0f766e,#06b6d4)]'}`} /><div className="p-5"><div className="flex items-start justify-between gap-3"><span className="rounded-full bg-[var(--background)] px-2.5 py-1 text-xs font-bold">{book.source === 'store' || book.id.startsWith('catalog-') ? '商店图书' : '本地导入'} · {book.language === 'zh' ? '中文' : 'English'} · {book.chapterCount} 章</span><div className="flex gap-1">{sort === 'custom' && <><button type="button" disabled={index === 0} onClick={() => void moveShelfBook(book, -1)} aria-label={`前移 ${book.title}`} className="grid h-9 w-9 place-items-center rounded-lg disabled:opacity-25"><span className="material-icons-round text-lg">arrow_back</span></button><button type="button" disabled={index === shelf.books.length - 1} onClick={() => void moveShelfBook(book, 1)} aria-label={`后移 ${book.title}`} className="grid h-9 w-9 place-items-center rounded-lg disabled:opacity-25"><span className="material-icons-round text-lg">arrow_forward</span></button></>}<button type="button" disabled={editorBusy} onClick={() => void beginEditingBook(book)} aria-label={`编辑 ${book.title}`} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-black/5"><span className="material-icons-round text-lg">edit</span></button><button type="button" onClick={() => void removeBook(book)} aria-label={`删除 ${book.title}`} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted-foreground)] opacity-60 hover:bg-[#fee2e2] hover:text-[#b91c1c] group-hover:opacity-100"><span className="material-icons-round text-lg">delete</span></button></div></div><div className="mt-5 flex gap-4">{book.coverDataUrl ? <span role="img" aria-label={`${book.title} 封面`} className="h-28 w-20 shrink-0 rounded-r-xl rounded-l-sm bg-cover bg-center shadow-md" style={{ backgroundImage: `url(${book.coverDataUrl})` }} /> : <div className={`grid h-28 w-20 shrink-0 place-items-center rounded-r-xl rounded-l-sm px-2 text-center text-white shadow-md ${index % 3 === 0 ? 'bg-[#365f57]' : index % 3 === 1 ? 'bg-[#6f4e37]' : 'bg-[#334155]'}`}><span className="line-clamp-4 font-serif text-sm font-bold leading-5">{book.title}</span></div>}<div className="min-w-0"><h3 className="line-clamp-2 font-serif text-xl font-bold leading-snug">{book.title}</h3><p className="mt-1 truncate text-sm text-[var(--muted-foreground)]">{book.author || '未知作者'}</p>{book.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted-foreground)]">{book.description}</p>}<p className="mt-3 text-xs text-[var(--muted-foreground)]">{formatSize(book.characterCount)} · 已读 {formatTime(book.readingSeconds)}</p></div></div><div className="mt-5 flex items-center justify-between text-xs"><span className="font-bold text-[#0f766e]">{book.overallProgress ? `继续阅读 · ${Math.round(book.overallProgress * 100)}%` : '尚未开始'}</span><span className="text-[var(--muted-foreground)]">第 {book.currentChapter + 1} 章 · {(book.bookmarks ?? []).length} 个书签</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--background)]"><div className="h-full rounded-full bg-[#0f766e]" style={{ width: `${Math.round(book.overallProgress * 100)}%` }} /></div><button type="button" onClick={() => void openBook(book)} className="mt-5 min-h-11 w-full rounded-xl bg-[#0f766e] px-4 text-sm font-bold text-white">{book.overallProgress ? '继续阅读' : '开始阅读'}</button></div></article>)}</div></div> : null)}</section>}
  </div>;
}
