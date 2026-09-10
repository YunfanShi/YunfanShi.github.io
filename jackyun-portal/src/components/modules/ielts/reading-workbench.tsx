'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import NovelWorkbench from '@/components/modules/ielts/novel-workbench';
import { callAiApi } from '@/lib/ai-config';
import { readAiResponseContent, readAiStreamingResponseContent } from '@/lib/ai-json';
import {
  buildReadingPrompt, buildReadingQuizPrompt, buildWordPrompt, calculateReadingProgress, calculateReadingStats, parseReadingArticle, parseReadingQuiz, parseWordNote, restoreReadingScroll,
  type ReadingArticle, type ReadingLevel, type ReadingNewsSource, type ReadingSettings, type ReadingStyle, type WordNote,
} from '@/lib/ielts-reading';

const LIBRARY_KEY = 'jackyun_ielts_reading_library_v1';
type View = 'generate' | 'library' | 'reader' | 'stats';
type ReaderTheme = 'paper' | 'night' | 'mint';
type ArticleGenerationProgress = { phase: string; preview: string; receivedCharacters: number; reasoningCharacters: number };

const defaultSettings: ReadingSettings = {
  level: 'B2', wordCount: 900, vocabularyDensity: 3, sentenceComplexity: 3, style: 'science-fiction', tone: 'thoughtful', perspective: 'third person limited', pacing: 3, dialogueRatio: 25, ending: 'hopeful', learningFocus: 'inference and vocabulary in context', premise: '', characters: '', setting: '', mustInclude: '', avoid: '', sourceMode: 'creative', newsQuery: '',
};

const styles: Array<{ value: ReadingStyle; label: string }> = [
  { value: 'cinematic', label: '电影感' }, { value: 'literary', label: '文学' }, { value: 'mystery', label: '悬疑' }, { value: 'adventure', label: '冒险' }, { value: 'science-fiction', label: '科幻' }, { value: 'fantasy', label: '奇幻' }, { value: 'slice-of-life', label: '日常' }, { value: 'historical', label: '历史' }, { value: 'academic', label: '学术科普' }, { value: 'journalistic', label: '新闻特写' },
];
const tones = ['温暖治愈', '紧张刺激', '幽默轻快', '忧郁诗意', '黑暗克制', '宏大史诗', '理性客观', '哲思深沉'];
const perspectives = ['first person', 'third person limited', 'third person omniscient', 'second person'];
const endings = ['hopeful', 'happy', 'bittersweet', 'open-ended', 'twist', 'tragic', 'cliffhanger'];

function id(prefix: string) { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`; }
function isArticle(value: unknown): value is ReadingArticle {
  if (!value || typeof value !== 'object') return false;
  const article = value as Partial<ReadingArticle>;
  return typeof article.id === 'string' && typeof article.title === 'string' && typeof article.content === 'string' && typeof article.wordCount === 'number' && typeof article.totalSeconds === 'number' && typeof article.completedCount === 'number';
}
function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`;
}
function readerTokens(text: string): string[] { return text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*|[^\p{L}\p{N}]+/gu) ?? []; }

function RangeControl({ label, value, min, max, step = 1, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="block rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-3.5"><span className="flex items-center justify-between text-sm font-semibold"><span>{label}</span><span className="rounded-lg bg-[#e0f2fe] px-2 py-1 text-xs font-bold text-[#075985] dark:bg-[#16384c] dark:text-[#7dd3fc]">{value}{suffix}</span></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-3 w-full accent-[#0e7490]" /></label>;
}

export default function ReadingWorkbench() {
  const [experience, setExperience] = useState<'novels' | 'ai'>('novels');
  if (experience === 'novels') return <NovelWorkbench onOpenAiStudio={() => setExperience('ai')} />;
  return <div className="space-y-4"><button type="button" onClick={() => setExperience('novels')} className="min-h-11 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 text-sm font-bold text-[#0f766e]"><span className="material-icons-round mr-2 align-middle">arrow_back</span>返回小说书架</button><AiReadingStudio /></div>;
}

function AiReadingStudio() {
  const [view, setView] = useState<View>('generate');
  const [settings, setSettings] = useState<ReadingSettings>(defaultSettings);
  const [library, setLibrary] = useState<ReadingArticle[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState<'article' | 'word' | 'quiz' | null>(null);
  const [message, setMessage] = useState('');
  const [generationProgress, setGenerationProgress] = useState<ArticleGenerationProgress | null>(null);
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const [fontSize, setFontSize] = useState(19);
  const [lineHeight, setLineHeight] = useState(1.9);
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>('paper');
  const [focusMode, setFocusMode] = useState(false);
  const [selectedWord, setSelectedWord] = useState<WordNote | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizCount, setQuizCount] = useState(5);
  const [query, setQuery] = useState('');
  const libraryRef = useRef<ReadingArticle[]>([]);
  const restoredArticleIdRef = useRef<string | null>(null);
  const current = library.find((article) => article.id === currentId) ?? null;
  const stats = useMemo(() => calculateReadingStats(library), [library]);

  useEffect(() => { libraryRef.current = library; }, [library]);
  useEffect(() => {
    let stored: ReadingArticle[] = [];
    try { const parsed = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]') as unknown; if (Array.isArray(parsed)) stored = parsed.filter(isArticle).map((article) => ({ ...article, quiz: article.quiz ?? null, vocabulary: article.vocabulary ?? {}, quizAttempts: article.quizAttempts ?? 0, quizCorrect: article.quizCorrect ?? 0, quizAnswered: article.quizAnswered ?? 0, lastReadAt: article.lastReadAt ?? null, sourceMode: article.sourceMode ?? 'creative', sources: Array.isArray(article.sources) ? article.sources : [], progressRatio: Number.isFinite(article.progressRatio) ? Math.min(1, Math.max(0, Number(article.progressRatio))) : 0, progressScrollY: Number.isFinite(article.progressScrollY) ? Math.max(0, Number(article.progressScrollY)) : 0, progressUpdatedAt: article.progressUpdatedAt ?? null })); } catch { /* Start with an empty local shelf. */ }
    queueMicrotask(() => { setLibrary(stored); setHydrated(true); });
  }, []);
  useEffect(() => { if (!hydrated) return; try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(library)); } catch { /* Storage failures do not interrupt the active reading session. */ } }, [hydrated, library]);
  useEffect(() => {
    if (view !== 'reader' || !currentId) return;
    const interval = window.setInterval(() => setLibrary((items) => items.map((article) => article.id === currentId ? { ...article, totalSeconds: article.totalSeconds + 5, lastReadAt: new Date().toISOString() } : article)), 5000);
    return () => window.clearInterval(interval);
  }, [currentId, view]);
  useEffect(() => {
    if (loading !== 'article') return;
    const startedAt = Date.now();
    const interval = window.setInterval(() => setGenerationElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [loading]);
  useEffect(() => {
    if (view !== 'reader' || !currentId || restoredArticleIdRef.current === currentId) return;
    restoredArticleIdRef.current = currentId;
    const timeout = window.setTimeout(() => {
      const article = libraryRef.current.find((item) => item.id === currentId);
      if (!article?.progressRatio) return;
      window.scrollTo({ top: restoreReadingScroll(article.progressRatio, document.documentElement.scrollHeight, window.innerHeight), behavior: 'auto' });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [currentId, view]);
  useEffect(() => {
    if (view !== 'reader' || !currentId) return;
    let timeout: number | null = null;
    const persistPosition = () => {
      const scrollY = Math.max(0, window.scrollY);
      const progressRatio = calculateReadingProgress(scrollY, document.documentElement.scrollHeight, window.innerHeight);
      setLibrary((items) => items.map((article) => article.id === currentId ? { ...article, progressRatio, progressScrollY: scrollY, progressUpdatedAt: new Date().toISOString() } : article));
    };
    const scheduleSave = () => {
      if (timeout !== null) window.clearTimeout(timeout);
      timeout = window.setTimeout(persistPosition, 500);
    };
    window.addEventListener('scroll', scheduleSave, { passive: true });
    window.addEventListener('pagehide', persistPosition);
    return () => { window.removeEventListener('scroll', scheduleSave); window.removeEventListener('pagehide', persistPosition); if (timeout !== null) window.clearTimeout(timeout); };
  }, [currentId, view]);

  function updateSetting<K extends keyof ReadingSettings>(key: K, value: ReadingSettings[K]) { setSettings((currentSettings) => ({ ...currentSettings, [key]: value })); }
  function updateArticle(articleId: string, updater: (article: ReadingArticle) => ReadingArticle) { setLibrary((items) => items.map((article) => article.id === articleId ? updater(article) : article)); }
  function openArticle(articleId: string) { restoredArticleIdRef.current = null; setCurrentId(articleId); setView('reader'); setSelectedWord(null); setAnswers({}); setQuizSubmitted(false); updateArticle(articleId, (article) => ({ ...article, lastReadAt: new Date().toISOString() })); }
  function saveReadingPosition() {
    if (!current) return;
    const scrollY = Math.max(0, window.scrollY);
    const progressRatio = calculateReadingProgress(scrollY, document.documentElement.scrollHeight, window.innerHeight);
    updateArticle(current.id, (article) => ({ ...article, progressRatio, progressScrollY: scrollY, progressUpdatedAt: new Date().toISOString() }));
    setMessage(`阅读进度已保存：约 ${Math.round(progressRatio * 100)}%。下次打开会自动回到这里。`);
  }

  async function generateArticle() {
    if (settings.sourceMode === 'news' && !settings.newsQuery?.trim()) { setMessage('请先输入要检索的新闻主题。'); return; }
    setLoading('article'); setMessage(''); setGenerationElapsed(0);
    setGenerationProgress({ phase: settings.sourceMode === 'news' ? '正在联网检索新闻…' : '正在连接 AI…', preview: '', receivedCharacters: 0, reasoningCharacters: 0 });
    try {
      let newsSources: ReadingNewsSource[] = [];
      if (settings.sourceMode === 'news') {
        const searchResponse = await fetch(`/api/ielts-reading/news?q=${encodeURIComponent(settings.newsQuery?.trim() ?? '')}`, { cache: 'no-store' });
        const searchResult = await searchResponse.json().catch(() => ({})) as { sources?: ReadingNewsSource[]; error?: string };
        if (!searchResponse.ok || !Array.isArray(searchResult.sources) || !searchResult.sources.length) throw new Error(searchResult.error || '没有找到可用的新闻来源。');
        newsSources = searchResult.sources;
        setGenerationProgress({ phase: `已找到 ${newsSources.length} 条来源，正在生成阅读文章…`, preview: newsSources.map((item) => `• ${item.title}`).join('\n'), receivedCharacters: 0, reasoningCharacters: 0 });
      }
      const response = await callAiApi([{ role: 'system', content: settings.sourceMode === 'news' ? 'You create factual, source-grounded English news explainers for learners and return only valid JSON.' : 'You create clear, natural, level-controlled English reading material and return only valid JSON.' }, { role: 'user', content: buildReadingPrompt(settings, newsSources) }], { temperature: settings.sourceMode === 'news' ? 0.25 : 0.72, maxTokens: Math.max(3000, settings.wordCount * 3), noThinking: true, stream: true, feature: 'reasoning' });
      let lastUiUpdate = 0;
      const raw = await readAiStreamingResponseContent(response, ({ content, reasoningCharacters }) => {
        const now = Date.now();
        if (now - lastUiUpdate < 100) return;
        lastUiUpdate = now;
        setGenerationProgress({
          phase: content ? '正在流式生成文章…' : reasoningCharacters ? '正在规划文章结构…' : '已连接，等待模型输出…',
          preview: content.slice(-1200),
          receivedCharacters: content.length,
          reasoningCharacters,
        });
      });
      setGenerationProgress((progress) => progress ? { ...progress, phase: '正在校验文章并保存…', preview: raw.slice(-1200), receivedCharacters: raw.length } : progress);
      const article = parseReadingArticle(raw, settings, id('reading'), new Date().toISOString(), newsSources);
      setLibrary((items) => [article, ...items]); setCurrentId(article.id); setView('reader'); setMessage('文章已生成并保存到书架。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '文章生成失败，请重试。'); } finally { setLoading(null); setGenerationProgress(null); }
  }
  async function lookupWord(word: string, context: string) {
    if (!current) return;
    const key = word.toLocaleLowerCase();
    const cached = current.vocabulary[key];
    if (cached) { setSelectedWord(cached); return; }
    setLoading('word'); setMessage('');
    try {
      const response = await callAiApi([{ role: 'system', content: 'You are a concise bilingual learner dictionary. Return only valid JSON.' }, { role: 'user', content: buildWordPrompt(word, context, current.level) }], { temperature: 0.15, maxTokens: 1600, noThinking: true, feature: 'chat' });
      const note = parseWordNote(await readAiResponseContent(response));
      setSelectedWord(note); updateArticle(current.id, (article) => ({ ...article, vocabulary: { ...article.vocabulary, [key]: note } }));
    } catch (error) { setMessage(error instanceof Error ? error.message : '查词失败。'); } finally { setLoading(null); }
  }
  async function generateQuiz() {
    if (!current) return;
    setLoading('quiz'); setMessage('');
    try {
      const response = await callAiApi([{ role: 'system', content: 'You create fair reading-comprehension questions and return only valid JSON.' }, { role: 'user', content: buildReadingQuizPrompt(current, quizCount) }], { temperature: 0.25, maxTokens: 2600, noThinking: true, feature: 'reasoning' });
      const quiz = parseReadingQuiz(await readAiResponseContent(response), quizCount);
      updateArticle(current.id, (article) => ({ ...article, quiz })); setAnswers({}); setQuizSubmitted(false); setMessage('阅读理解题已生成；不想做可以直接跳过。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '题目生成失败。'); } finally { setLoading(null); }
  }
  function submitQuiz() {
    if (!current?.quiz) return;
    const answered = current.quiz.questions.filter((question) => answers[question.id] !== undefined);
    if (!answered.length) { setMessage('请至少回答一道题，或者选择跳过。'); return; }
    const correct = answered.filter((question) => answers[question.id] === question.answer).length;
    updateArticle(current.id, (article) => ({ ...article, quizAttempts: article.quizAttempts + 1, quizCorrect: article.quizCorrect + correct, quizAnswered: article.quizAnswered + answered.length }));
    setQuizSubmitted(true); setMessage(`本次答对 ${correct} / ${answered.length}。结果已保存。`);
  }
  function completeReading() {
    if (!current) return;
    updateArticle(current.id, (article) => ({ ...article, completedCount: article.completedCount + 1, lastReadAt: new Date().toISOString() })); setMessage('本次阅读已完成并记录。测验是可选的。');
  }
  function speak(text: string) {
    if (!('speechSynthesis' in window)) { setMessage('当前浏览器不支持朗读。'); return; }
    window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US'; utterance.rate = 0.9; window.speechSynthesis.speak(utterance);
  }
  function deleteArticle(article: ReadingArticle) {
    if (!window.confirm(`确定从本地书架删除《${article.title}》吗？此操作无法撤销。`)) return;
    setLibrary((items) => items.filter((item) => item.id !== article.id)); if (currentId === article.id) { setCurrentId(null); setView('library'); }
  }
  function exportLibrary() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), articles: library }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'reading-library.json'; anchor.click(); URL.revokeObjectURL(url);
  }

  const nav: Array<{ id: View; label: string; icon: string }> = [{ id: 'generate', label: '生成器', icon: 'auto_awesome' }, { id: 'library', label: `书架 ${library.length}`, icon: 'local_library' }, { id: 'reader', label: '阅读器', icon: 'menu_book' }, { id: 'stats', label: '数据', icon: 'insights' }];
  const inputClass = 'mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-3 text-sm outline-none focus:border-[#0e7490] focus:ring-4 focus:ring-[#0e7490]/10';
  const themeClass = readerTheme === 'night' ? 'bg-[#111827] text-[#e5e7eb]' : readerTheme === 'mint' ? 'bg-[#effaf5] text-[#16372d]' : 'bg-[#fffdf7] text-[#29251f]';

  return <div className="mx-auto max-w-[1500px] space-y-5 text-[var(--foreground)]">
    <header className="relative isolate overflow-hidden rounded-[28px] bg-[linear-gradient(118deg,#102c3c_0%,#155e75_55%,#0f766e_100%)] px-5 py-6 text-white shadow-[0_24px_70px_rgba(8,51,68,.25)] sm:px-8 sm:py-8"><div className="pointer-events-none absolute -right-20 -top-24 -z-10 h-72 w-72 rounded-full bg-[#5eead4]/20 blur-3xl" /><p className="text-xs font-bold uppercase tracking-[.2em] text-[#99f6e4]">READING STUDIO</p><div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">英文阅读 · 文章生成器与阅读器</h1><p className="mt-3 max-w-3xl leading-7 text-[#ccfbf1]">生成自然的原创文章，或联网检索新闻后制作分级阅读；点词查义、朗读、做可选测验，并把阅读轨迹留在自己的书架里。</p></div><Link href="/ielts-writing" className="inline-flex min-h-11 items-center rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-bold hover:bg-white/15"><span className="material-icons-round mr-2">edit_note</span>切换到写作工具</Link></div></header>
    <nav className="grid grid-cols-4 gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-2" aria-label="阅读工具视图">{nav.map((item) => <button key={item.id} type="button" onClick={() => { if (view === 'reader' && item.id !== 'reader' && current) saveReadingPosition(); if (item.id === 'reader' && !current) setView('library'); else setView(item.id); }} className={`min-h-12 rounded-xl px-2 text-sm font-bold transition ${view === item.id ? 'bg-[#0f766e] text-white shadow-md' : 'text-[var(--muted-foreground)] hover:bg-[var(--background)]'}`}><span className="material-icons-round mr-1.5 align-middle text-lg">{item.icon}</span>{item.label}</button>)}</nav>
    {message && <p role="status" className="rounded-2xl border border-[#99d9d1] bg-[#ecfdf5] px-4 py-3 text-sm text-[#115e59] dark:border-[#285e57] dark:bg-[#123b36] dark:text-[#99f6e4]">{message} {/配置|API|Key/i.test(message) && <Link href="/settings" className="ml-2 font-bold underline">打开设置</Link>}</p>}
    {view === 'reader' && current && <section className="flex flex-col gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-bold">阅读进度</span><span className="tabular-nums text-[var(--muted-foreground)]">约 {Math.round((current.progressRatio ?? 0) * 100)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--background)]"><div className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e,#06b6d4)] transition-[width]" style={{ width: `${Math.round((current.progressRatio ?? 0) * 100)}%` }} /></div><p className="mt-2 text-xs text-[var(--muted-foreground)]">滚动时自动保存；也可以手动保存。再次打开文章时会按页面比例恢复到大致位置。</p></div><button type="button" onClick={saveReadingPosition} className="min-h-11 shrink-0 rounded-xl border border-[#0f766e] px-4 text-sm font-bold text-[#0f766e] hover:bg-[#ecfdf5] dark:hover:bg-[#123b36]"><span className="material-icons-round mr-1.5 align-middle text-lg">bookmark</span>保存当前位置</button></section>}
    {view === 'reader' && current?.sourceMode === 'news' && Boolean(current.sources?.length) && <section className="rounded-3xl border border-[#a7e2ca] bg-[#effcf7] p-5 dark:border-[#24634d] dark:bg-[#123a2d]"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0f766e] text-white"><span className="material-icons-round">fact_check</span></span><div><h2 className="font-bold text-[#115e59] dark:text-[#99f6e4]">本篇新闻的检索来源</h2><p className="text-xs text-[var(--muted-foreground)]">文章依据下列实时检索结果生成；点击可核对原始报道。</p></div></div><div className="mt-4 grid gap-2 md:grid-cols-2">{current.sources?.map((source) => <a key={`${source.url}-${source.title}`} href={source.url} target="_blank" rel="noreferrer" className="rounded-xl border border-[#8bd0c4] bg-white/70 p-3 text-sm transition hover:border-[#0f766e] hover:bg-white dark:bg-black/10"><strong className="line-clamp-2 leading-5">{source.title}</strong><span className="mt-2 block text-xs text-[var(--muted-foreground)]">{source.source || 'News source'}{source.publishedAt ? ` · ${source.publishedAt}` : ''}</span></a>)}</div></section>}

    {view === 'generate' && <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5"><div className="grid gap-3 sm:grid-cols-2"><button type="button" aria-pressed={settings.sourceMode !== 'news'} onClick={() => updateSetting('sourceMode', 'creative')} className={`rounded-2xl border p-4 text-left transition ${settings.sourceMode !== 'news' ? 'border-[#0f766e] bg-[#ecfdf5] text-[#115e59] ring-2 ring-[#0f766e]/15 dark:bg-[#123b36] dark:text-[#99f6e4]' : 'border-[var(--card-border)]'}`}><span className="material-icons-round mr-2 align-middle">auto_stories</span><strong>原创阅读</strong><span className="mt-1 block text-xs opacity-75">故事、科普或自定义题材</span></button><button type="button" aria-pressed={settings.sourceMode === 'news'} onClick={() => { updateSetting('sourceMode', 'news'); updateSetting('style', 'journalistic'); updateSetting('tone', '理性客观'); }} className={`rounded-2xl border p-4 text-left transition ${settings.sourceMode === 'news' ? 'border-[#0f766e] bg-[#ecfdf5] text-[#115e59] ring-2 ring-[#0f766e]/15 dark:bg-[#123b36] dark:text-[#99f6e4]' : 'border-[var(--card-border)]'}`}><span className="material-icons-round mr-2 align-middle">newspaper</span><strong>实时新闻</strong><span className="mt-1 block text-xs opacity-75">联网检索英文来源，再生成分级新闻阅读</span></button></div>{settings.sourceMode === 'news' && <label className="mt-4 block text-sm font-semibold">新闻主题 / 搜索词<input value={settings.newsQuery ?? ''} onChange={(event) => updateSetting('newsQuery', event.target.value)} className={inputClass} placeholder="例如：AI regulation, climate science, space exploration" /><span className="mt-2 block text-xs font-normal leading-5 text-[var(--muted-foreground)]">生成前会检索最新英文新闻；文章只依据检索到的标题、摘要、时间和来源，并在阅读器中保留原始链接。</span></label>}</section>}

    {view === 'generate' && <section className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,.95fr)]"><article className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#0f766e] text-white"><span className="material-icons-round">tune</span></span><div><h2 className="text-xl font-bold">语言难度与阅读手感</h2><p className="text-sm text-[var(--muted-foreground)]">先决定“读起来有多难”。</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-3.5 text-sm font-semibold">CEFR 难度<select value={settings.level} onChange={(event) => updateSetting('level', event.target.value as ReadingLevel)} className={inputClass}>{(['A2', 'B1', 'B2', 'C1', 'C2'] as ReadingLevel[]).map((level) => <option key={level}>{level}</option>)}</select></label><RangeControl label="文章长度" value={settings.wordCount} min={350} max={2400} step={50} suffix=" 词" onChange={(value) => updateSetting('wordCount', value)} /><RangeControl label="生词密度" value={settings.vocabularyDensity} min={1} max={5} onChange={(value) => updateSetting('vocabularyDensity', value)} /><RangeControl label="句式复杂度" value={settings.sentenceComplexity} min={1} max={5} onChange={(value) => updateSetting('sentenceComplexity', value)} /><RangeControl label="节奏速度" value={settings.pacing} min={1} max={5} onChange={(value) => updateSetting('pacing', value)} /><RangeControl label="对话比例" value={settings.dialogueRatio} min={0} max={70} step={5} suffix="%" onChange={(value) => updateSetting('dialogueRatio', value)} /></div></article>
      <article className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6"><h2 className="text-xl font-bold">小说调音台</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">风格只控制写法，题材和人物由你自由填写。</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">风格 / 类型<select value={settings.style} onChange={(event) => updateSetting('style', event.target.value as ReadingStyle)} className={inputClass}>{styles.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}</select></label><label className="text-sm font-semibold">情绪<select value={settings.tone} onChange={(event) => updateSetting('tone', event.target.value)} className={inputClass}>{tones.map((tone) => <option key={tone}>{tone}</option>)}</select></label><label className="text-sm font-semibold">叙事视角<select value={settings.perspective} onChange={(event) => updateSetting('perspective', event.target.value)} className={inputClass}>{perspectives.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-semibold">结局<select value={settings.ending} onChange={(event) => updateSetting('ending', event.target.value)} className={inputClass}>{endings.map((item) => <option key={item}>{item}</option>)}</select></label></div><label className="mt-4 block text-sm font-semibold">语言学习重点<input value={settings.learningFocus} onChange={(event) => updateSetting('learningFocus', event.target.value)} className={inputClass} placeholder="例如：推断、环境描写、C1 学术词汇" /></label></article>
      <article className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6 xl:col-span-2"><h2 className="text-xl font-bold">你想读什么？</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">可以只写一句，也可以像给小说作者写设定集一样详细。</p><div className="mt-5 grid gap-4 lg:grid-cols-2"><label className="text-sm font-semibold lg:col-span-2">故事梗概 / 想看的内容<textarea value={settings.premise} onChange={(event) => updateSetting('premise', event.target.value)} rows={4} className={inputClass} placeholder="例如：在鸣潮风格的末世世界里，两位巡尉调查一段只在雨夜出现的声纹；希望重人物互动，不要太沉重。" /></label><label className="text-sm font-semibold">人物<textarea value={settings.characters} onChange={(event) => updateSetting('characters', event.target.value)} rows={3} className={inputClass} placeholder="姓名、性格、关系、动机……" /></label><label className="text-sm font-semibold">世界 / 场景<textarea value={settings.setting} onChange={(event) => updateSetting('setting', event.target.value)} rows={3} className={inputClass} placeholder="时代、地点、世界观、氛围……" /></label><label className="text-sm font-semibold">必须出现<input value={settings.mustInclude} onChange={(event) => updateSetting('mustInclude', event.target.value)} className={inputClass} placeholder="物件、对白、冲突、意象……" /></label><label className="text-sm font-semibold">不要出现<input value={settings.avoid} onChange={(event) => updateSetting('avoid', event.target.value)} className={inputClass} placeholder="暴力、悲剧、剧透、某种写法……" /></label></div><button type="button" disabled={loading === 'article'} onClick={generateArticle} className="mt-6 min-h-14 w-full rounded-2xl bg-[linear-gradient(100deg,#0f766e,#0891b2)] px-5 text-base font-bold text-white shadow-lg shadow-teal-950/15 disabled:opacity-50"><span className="material-icons-round mr-2 align-middle">auto_awesome</span>{loading === 'article' ? '正在写作并校准难度…' : `生成一篇 ${settings.level} · ${settings.wordCount} 词文章`}</button>{loading === 'article' && generationProgress && <div className="mt-4 overflow-hidden rounded-2xl border border-[#67e8f9]/50 bg-[#ecfeff] text-[#164e63] dark:bg-[#083344]/60 dark:text-[#cffafe]"><div className="h-1.5 overflow-hidden bg-[#a5f3fc]/60"><div className="h-full w-1/3 rounded-full bg-[#0891b2] motion-safe:animate-pulse" /></div><div className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p role="status" aria-live="polite" className="font-bold"><span className="material-icons-round mr-2 align-middle text-lg motion-safe:animate-spin">progress_activity</span>{generationProgress.phase}</p><span className="text-xs font-semibold tabular-nums">{generationElapsed} 秒 · 已接收 {generationProgress.receivedCharacters.toLocaleString()} 字符</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold"><span className="rounded-lg bg-white/70 px-2 py-2 dark:bg-white/10">✓ 请求已发送</span><span className={`rounded-lg px-2 py-2 ${generationProgress.reasoningCharacters > 0 || generationProgress.receivedCharacters > 0 ? 'bg-white/70 dark:bg-white/10' : 'opacity-50'}`}>{generationProgress.reasoningCharacters > 0 || generationProgress.receivedCharacters > 0 ? '✓' : '…'} 规划结构</span><span className={`rounded-lg px-2 py-2 ${generationProgress.receivedCharacters > 0 ? 'bg-white/70 dark:bg-white/10' : 'opacity-50'}`}>{generationProgress.receivedCharacters > 0 ? '●' : '…'} 输出文章</span></div>{generationProgress.preview && <div className="mt-3"><p className="mb-1 text-[11px] font-bold uppercase tracking-wide opacity-70">实时结果预览</p><pre className="max-h-36 overflow-hidden whitespace-pre-wrap break-words rounded-xl bg-[#083344] p-3 text-xs leading-5 text-[#cffafe]">{generationProgress.preview}</pre></div>}</div></div>}</article></section>}

    {view === 'library' && <section><div className="mb-4 flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><span className="material-icons-round absolute left-3 top-3 text-[var(--muted-foreground)]">search</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-12 w-full rounded-xl border border-[var(--card-border)] bg-[var(--card)] pl-11 pr-4 outline-none focus:border-[#0f766e]" placeholder="搜索标题、摘要或正文" /></label><button type="button" onClick={exportLibrary} disabled={!library.length} className="min-h-12 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 text-sm font-bold disabled:opacity-40"><span className="material-icons-round mr-2 align-middle">download</span>导出书架</button></div>{library.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{library.filter((article) => `${article.title} ${article.subtitle} ${article.summary} ${article.content}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((article) => <article key={article.id} className="group rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><div className="flex items-start justify-between"><span className="rounded-full bg-[#ccfbf1] px-2.5 py-1 text-xs font-bold text-[#115e59] dark:bg-[#134e4a] dark:text-[#99f6e4]">{article.level} · {article.style}</span><button type="button" onClick={() => deleteArticle(article)} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted-foreground)] opacity-60 hover:bg-[#fee2e2] hover:text-[#b91c1c] group-hover:opacity-100" aria-label={`删除 ${article.title}`}><span className="material-icons-round text-lg">delete</span></button></div><h2 className="mt-4 font-serif text-2xl font-bold leading-tight">{article.title}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{article.subtitle || article.summary}</p><div className="mt-5 flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]"><span>{article.wordCount} 词</span><span>·</span><span>约 {article.estimatedMinutes} 分钟</span><span>·</span><span>已读 {formatDuration(article.totalSeconds)}</span>{article.completedCount > 0 && <span className="font-bold text-[#0f766e]">· 完成 {article.completedCount} 次</span>}</div><button type="button" onClick={() => openArticle(article.id)} className="mt-5 min-h-11 w-full rounded-xl bg-[#0f766e] px-4 text-sm font-bold text-white">开始 / 继续阅读</button></article>)}</div> : <div className="rounded-3xl border border-dashed border-[var(--card-border)] bg-[var(--card)] p-12 text-center"><span className="material-icons-round text-5xl text-[#5ea9a0]">auto_stories</span><h2 className="mt-3 text-xl font-bold">书架还是空的</h2><button type="button" onClick={() => setView('generate')} className="mt-5 rounded-xl bg-[#0f766e] px-5 py-3 font-bold text-white">去生成第一篇文章</button></div>}</section>}

    {view === 'reader' && current && <section className={`grid gap-5 ${focusMode ? '' : 'xl:grid-cols-[minmax(0,1fr)_340px]'}`}><article className={`overflow-hidden rounded-3xl border border-[var(--card-border)] shadow-sm ${themeClass}`}><div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-4 py-3"><button type="button" onClick={() => setView('library')} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-black/5" aria-label="返回书架"><span className="material-icons-round">arrow_back</span></button><button type="button" onClick={() => setFontSize((size) => Math.max(15, size - 1))} className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 font-serif">A−</button><button type="button" onClick={() => setFontSize((size) => Math.min(28, size + 1))} className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 font-serif">A+</button><button type="button" onClick={() => setLineHeight((value) => value >= 2.2 ? 1.5 : Number((value + .2).toFixed(1)))} className="min-h-10 rounded-xl border border-black/10 px-3 text-xs font-bold">行距 {lineHeight}</button>{(['paper', 'mint', 'night'] as ReaderTheme[]).map((theme) => <button key={theme} type="button" onClick={() => setReaderTheme(theme)} aria-label={`${theme} 阅读主题`} className={`h-8 w-8 rounded-full border-2 ${theme === 'paper' ? 'bg-[#fffdf7]' : theme === 'mint' ? 'bg-[#dff7ed]' : 'bg-[#111827]'} ${readerTheme === theme ? 'border-[#06b6d4]' : 'border-black/15'}`} />)}<button type="button" onClick={() => speak(current.content)} className="ml-auto grid h-10 w-10 place-items-center rounded-xl hover:bg-black/5" aria-label="朗读全文"><span className="material-icons-round">volume_up</span></button><button type="button" onClick={() => setFocusMode((value) => !value)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-black/5" aria-label="专注模式"><span className="material-icons-round">{focusMode ? 'close_fullscreen' : 'open_in_full'}</span></button></div><div className="mx-auto max-w-3xl px-5 py-9 sm:px-10 sm:py-12"><div className="mb-8 text-center"><span className="text-xs font-bold uppercase tracking-[.18em] opacity-60">{current.level} · {current.style} · {current.wordCount} words</span><h1 className="mt-3 font-serif text-3xl font-bold leading-tight sm:text-5xl">{current.title}</h1>{current.subtitle && <p className="mt-3 font-serif text-lg italic opacity-65">{current.subtitle}</p>}</div><div className="font-serif" style={{ fontSize, lineHeight }}>{current.content.split(/\n\s*\n/).map((paragraph, paragraphIndex) => <p key={paragraphIndex} className="mb-[1.2em]">{readerTokens(paragraph).map((token, tokenIndex) => /^[\p{L}\p{N}]/u.test(token) ? <button type="button" key={tokenIndex} onClick={() => lookupWord(token.replace(/[.,”“!?;:]+$/g, ''), paragraph)} className="rounded px-[1px] text-inherit decoration-[#0f766e] decoration-2 underline-offset-4 hover:bg-[#facc15]/35 hover:underline focus:bg-[#facc15]/45 focus:outline-none" title="点击查词">{token}</button> : <span key={tokenIndex}>{token}</span>)}</p>)}</div><div className="mt-10 border-t border-black/10 pt-6"><button type="button" onClick={completeReading} className="min-h-12 w-full rounded-xl bg-[#0f766e] px-4 font-bold text-white"><span className="material-icons-round mr-2 align-middle">done_all</span>我读完了 · 保存本次阅读</button></div></div></article>
      {!focusMode && <aside className="space-y-4"><article className="sticky top-0 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold">点词助手</h2>{loading === 'word' && <span className="text-xs text-[var(--muted-foreground)]">查询中…</span>}</div>{selectedWord ? <div className="mt-4"><div className="flex items-baseline gap-2"><strong className="font-serif text-2xl">{selectedWord.word}</strong><span className="text-sm text-[var(--muted-foreground)]">{selectedWord.phonetic}</span></div><p className="mt-1 text-xs font-bold uppercase text-[#0f766e]">{selectedWord.partOfSpeech}</p><p className="mt-3 text-lg font-bold">{selectedWord.translation}</p><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{selectedWord.definition}</p><p className="mt-3 rounded-xl bg-[var(--background)] p-3 text-sm italic leading-6">{selectedWord.example}</p><button type="button" onClick={() => speak(selectedWord.word)} className="mt-3 text-sm font-bold text-[#0f766e]"><span className="material-icons-round mr-1 align-middle text-lg">volume_up</span>发音</button></div> : <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">点击正文中的任意英文词，查看语境翻译、英文释义、词性、音标和例句。查过的词会随文章保存。</p>}<div className="mt-5 border-t border-[var(--card-border)] pt-4"><div className="flex items-center justify-between"><span className="text-sm font-bold">已查词汇</span><span className="text-xs text-[var(--muted-foreground)]">{Object.keys(current.vocabulary).length}</span></div><div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto">{Object.entries(current.vocabulary).map(([key, note]) => <button type="button" key={key} onClick={() => setSelectedWord(note)} className="rounded-lg bg-[#e6f7f4] px-2 py-1 text-xs font-semibold text-[#115e59] dark:bg-[#134e4a] dark:text-[#99f6e4]">{note.word}</button>)}</div></div></article>
        <article className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5"><h2 className="font-bold">读完后的小测验 <span className="text-xs font-normal text-[var(--muted-foreground)]">（可跳过）</span></h2>{!current.quiz ? <><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">选择题只用于检查理解，不影响文章完成记录。</p><div className="mt-4 flex gap-2"><select value={quizCount} onChange={(event) => setQuizCount(Number(event.target.value))} className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 text-sm">{[3, 5, 8, 10].map((count) => <option key={count} value={count}>{count} 题</option>)}</select><button type="button" disabled={loading === 'quiz'} onClick={generateQuiz} className="min-h-11 flex-1 rounded-xl bg-[#7c3aed] px-3 text-sm font-bold text-white disabled:opacity-50">{loading === 'quiz' ? '生成中…' : '生成阅读理解'}</button></div></> : <div className="mt-4 space-y-5">{current.quiz.questions.map((question, questionIndex) => <fieldset key={question.id}><legend className="text-sm font-bold leading-6">{questionIndex + 1}. {question.question}</legend><div className="mt-2 space-y-2">{question.options.map((option, optionIndex) => { const selected = answers[question.id] === optionIndex; const correct = quizSubmitted && question.answer === optionIndex; const wrong = quizSubmitted && selected && !correct; return <label key={optionIndex} className={`flex cursor-pointer gap-2 rounded-xl border p-2.5 text-sm ${correct ? 'border-[#22c55e] bg-[#dcfce7] text-[#14532d]' : wrong ? 'border-[#ef4444] bg-[#fee2e2] text-[#7f1d1d]' : selected ? 'border-[#7c3aed] bg-[#f3e8ff] dark:bg-[#3b2356]' : 'border-[var(--card-border)]'}`}><input type="radio" name={question.id} checked={selected} disabled={quizSubmitted} onChange={() => setAnswers((items) => ({ ...items, [question.id]: optionIndex }))} />{option}</label>; })}</div>{quizSubmitted && <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{question.explanation}</p>}</fieldset>)}{quizSubmitted ? <button type="button" onClick={() => { setAnswers({}); setQuizSubmitted(false); }} className="min-h-11 w-full rounded-xl border border-[#7c3aed] text-sm font-bold text-[#7c3aed]">再做一次</button> : <button type="button" onClick={submitQuiz} className="min-h-11 w-full rounded-xl bg-[#7c3aed] text-sm font-bold text-white">提交答案</button>}<button type="button" onClick={() => { setView('library'); setMessage('已跳过测验，阅读数据仍然保留。'); }} className="w-full text-xs font-bold text-[var(--muted-foreground)]">跳过，返回书架</button></div>}</article></aside>}</section>}

    {view === 'stats' && <section className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{[{ label: '书架文章', value: stats.articles, suffix: '篇', icon: 'library_books' }, { label: '完成阅读', value: stats.completed, suffix: '次', icon: 'done_all' }, { label: '累计时长', value: formatDuration(stats.totalSeconds), suffix: '', icon: 'schedule' }, { label: '完成词量', value: stats.wordsRead.toLocaleString(), suffix: '词', icon: 'text_fields' }, { label: '测验正确率', value: stats.quizAccuracy === null ? '—' : stats.quizAccuracy, suffix: stats.quizAccuracy === null ? '' : '%', icon: 'quiz' }, { label: '点词收藏', value: stats.vocabularySaved, suffix: '词', icon: 'translate' }].map((item) => <article key={item.label} className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm"><span className="material-icons-round text-2xl text-[#0f766e]">{item.icon}</span><p className="mt-4 text-2xl font-bold">{item.value}<span className="ml-1 text-sm font-normal text-[var(--muted-foreground)]">{item.suffix}</span></p><p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{item.label}</p></article>)}</div><article className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">文章学习记录</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">文章、累计时长、完成次数与答题表现都保存在本机。</p></div><button type="button" onClick={exportLibrary} disabled={!library.length} className="rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm font-bold disabled:opacity-40">导出数据</button></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-xs uppercase text-[var(--muted-foreground)]"><tr className="border-b border-[var(--card-border)]"><th className="py-3 pr-4">文章</th><th className="p-3">等级</th><th className="p-3">词数</th><th className="p-3">阅读时长</th><th className="p-3">完成</th><th className="p-3">答题正确率</th><th className="p-3">查词</th></tr></thead><tbody>{library.map((article) => <tr key={article.id} className="border-b border-[var(--card-border)] last:border-0"><td className="py-4 pr-4 font-semibold"><button type="button" onClick={() => openArticle(article.id)} className="text-left hover:text-[#0f766e] hover:underline">{article.title}</button></td><td className="p-3">{article.level}</td><td className="p-3">{article.wordCount}</td><td className="p-3">{formatDuration(article.totalSeconds)}</td><td className="p-3">{article.completedCount}</td><td className="p-3">{article.quizAnswered ? `${Math.round(article.quizCorrect / article.quizAnswered * 100)}% (${article.quizAttempts} 次)` : '—'}</td><td className="p-3">{Object.keys(article.vocabulary).length}</td></tr>)}</tbody></table>{!library.length && <p className="py-10 text-center text-[var(--muted-foreground)]">生成并阅读文章后，这里会出现学习记录。</p>}</div></article></section>}
  </div>;
}
