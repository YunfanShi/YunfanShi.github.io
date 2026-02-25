'use client';

import { useState, useTransition } from 'react';
import { addWord, addWordsBatch } from '@/actions/vocab';

type Tab = 'single' | 'batch';

const CATEGORIES = [
  { value: '', label: '不分类' },
  { value: 'general', label: '通用 (general)' },
  { value: 'junior', label: '初级 (junior)' },
  { value: 'advanced', label: '高级 (advanced)' },
];

function parseBatchText(text: string): { word: string; meaning: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // Support "word: meaning" or "word meaning" (first space separates)
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        return { word: line.slice(0, colonIdx).trim(), meaning: line.slice(colonIdx + 1).trim() };
      }
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx > 0) {
        return { word: line.slice(0, spaceIdx).trim(), meaning: line.slice(spaceIdx + 1).trim() };
      }
      return { word: line, meaning: '' };
    })
    .filter(({ word, meaning }) => word && meaning);
}

export default function AddWordForm() {
  const [tab, setTab] = useState<Tab>('single');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Single form state
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [category, setCategory] = useState('');

  // Batch form state
  const [batchText, setBatchText] = useState('');
  const [batchCategory, setBatchCategory] = useState('');

  function resetMessages() {
    setError(null);
    setSuccess(null);
  }

  function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    const fd = new FormData();
    fd.set('word', word);
    fd.set('meaning', meaning);
    fd.set('category', category);
    startTransition(async () => {
      try {
        await addWord(fd);
        setSuccess('添加成功！');
        setWord('');
        setMeaning('');
        setCategory('');
      } catch (err) {
        setError(err instanceof Error ? err.message : '添加失败');
      }
    });
  }

  function handleBatchSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    const parsed = parseBatchText(batchText);
    if (!parsed.length) {
      setError('未解析到有效词汇，请检查格式（每行 "单词: 释义"）');
      return;
    }
    const words = parsed.map((w) => ({ ...w, category: batchCategory || undefined }));
    startTransition(async () => {
      try {
        await addWordsBatch(words);
        setSuccess(`成功添加 ${words.length} 个词汇！`);
        setBatchText('');
        setBatchCategory('');
      } catch (err) {
        setError(err instanceof Error ? err.message : '批量添加失败');
      }
    });
  }

  const inputCls =
    'w-full rounded-[8px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors';

  return (
    <div className="mb-6 rounded-[12px] border border-[var(--card-border)] bg-[var(--card)]">
      {/* Tab header */}
      <div className="flex border-b border-[var(--card-border)]">
        {(['single', 'batch'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); resetMessages(); }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === t
                ? 'border-b-2 border-[#4285F4] text-[#4285F4]'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            {t === 'single' ? '单个添加' : '批量添加'}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* Feedback */}
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-[8px] bg-[#EA433515] px-3 py-2 text-sm text-[#EA4335]">
            <span className="material-icons-round text-base">error_outline</span>
            {error}
          </div>
        )}
        {success && (
          <div className="mb-3 flex items-center gap-2 rounded-[8px] bg-[#34A85315] px-3 py-2 text-sm text-[#34A853]">
            <span className="material-icons-round text-base">check_circle_outline</span>
            {success}
          </div>
        )}

        {tab === 'single' ? (
          <form onSubmit={handleSingleSubmit} className="space-y-3">
            <input
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder="单词"
              required
              className={inputCls}
            />
            <input
              type="text"
              value={meaning}
              onChange={(e) => setMeaning(e.target.value)}
              placeholder="释义"
              required
              className={inputCls}
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputCls}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={isPending || !word.trim() || !meaning.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#4285F4] py-2 text-sm font-medium text-white hover:bg-[#3574e0] disabled:opacity-50 transition-colors"
            >
              <span className="material-icons-round text-base">add</span>
              {isPending ? '添加中…' : '添加词汇'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleBatchSubmit} className="space-y-3">
            <textarea
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder={'每行一个词汇，格式：\nabandon: 放弃\nbenign: 良性的\n或用空格分隔'}
              rows={6}
              required
              className={`${inputCls} resize-y`}
            />
            <select
              value={batchCategory}
              onChange={(e) => setBatchCategory(e.target.value)}
              className={inputCls}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--muted-foreground)]">
              预览：{parseBatchText(batchText).length} 个词汇将被添加
            </p>
            <button
              type="submit"
              disabled={isPending || !batchText.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#4285F4] py-2 text-sm font-medium text-white hover:bg-[#3574e0] disabled:opacity-50 transition-colors"
            >
              <span className="material-icons-round text-base">upload</span>
              {isPending ? '添加中…' : '批量添加'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
