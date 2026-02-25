'use client';

import { useState, useTransition } from 'react';
import { toggleMastered, deleteWord } from '@/actions/vocab';

interface VocabWord {
  id: string;
  word: string;
  meaning: string;
  category: string | null;
  mastered: boolean;
  review_count: number;
  created_at: string;
}

interface WordListProps {
  words: VocabWord[];
}

const CATEGORY_LABELS: Record<string, string> = {
  general: '通用',
  junior: '初级',
  advanced: '高级',
};

const ALL_CATEGORIES = ['general', 'junior', 'advanced'];

export default function WordList({ words }: WordListProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isPending, startTransition] = useTransition();

  function handleToggle(id: string) {
    startTransition(() => toggleMastered(id));
  }

  function handleDelete(id: string, word: string) {
    if (!confirm(`确定删除词汇「${word}」吗？`)) return;
    startTransition(() => deleteWord(id));
  }

  const filtered = words.filter((w) => {
    const matchesSearch =
      !search ||
      w.word.toLowerCase().includes(search.toLowerCase()) ||
      w.meaning.toLowerCase().includes(search.toLowerCase());
    const matchesCat =
      categoryFilter === 'all' || w.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const tabs = ['all', ...ALL_CATEGORIES];

  if (words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-[var(--card-border)] py-20 text-center">
        <span className="material-icons-round text-5xl text-[var(--muted-foreground)] mb-4">
          menu_book
        </span>
        <h3 className="text-base font-semibold text-[var(--foreground)]">还没有词汇</h3>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          使用上方表单添加你的第一个词汇
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)]">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 p-4 border-b border-[var(--card-border)] sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-base text-[var(--muted-foreground)]">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索单词或释义…"
            className="w-full rounded-[8px] border border-[var(--card-border)] bg-[var(--background)] py-2 pl-9 pr-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
          />
        </div>
        {/* Category tabs */}
        <div className="flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setCategoryFilter(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                categoryFilter === t
                  ? 'bg-[#4285F4] text-white'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--card-border)]'
              }`}
            >
              {t === 'all' ? '全部' : CATEGORY_LABELS[t] ?? t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
          没有匹配的词汇
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] text-xs text-[var(--muted-foreground)]">
                <th className="px-4 py-3 text-left font-medium">单词</th>
                <th className="px-4 py-3 text-left font-medium">释义</th>
                <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">分类</th>
                <th className="px-4 py-3 text-center font-medium">掌握</th>
                <th className="px-4 py-3 text-center font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr
                  key={w.id}
                  className={`group border-b border-[var(--card-border)] last:border-0 transition-colors hover:bg-[var(--background)] ${
                    w.mastered ? 'opacity-60' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <span
                      className={`font-medium text-[var(--foreground)] ${
                        w.mastered ? 'line-through' : ''
                      }`}
                    >
                      {w.word}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{w.meaning}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {w.category ? (
                      <span className="rounded-full border border-[var(--card-border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
                        {CATEGORY_LABELS[w.category] ?? w.category}
                      </span>
                    ) : (
                      <span className="text-[var(--muted-foreground)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggle(w.id)}
                      disabled={isPending}
                      title={w.mastered ? '取消掌握' : '标记掌握'}
                      className={`transition-colors disabled:opacity-40 ${
                        w.mastered
                          ? 'text-[#34A853] hover:text-[var(--muted-foreground)]'
                          : 'text-[var(--muted-foreground)] hover:text-[#34A853]'
                      }`}
                    >
                      <span className="material-icons-round text-[20px]">
                        {w.mastered ? 'star' : 'star_border'}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleDelete(w.id, w.word)}
                      disabled={isPending}
                      title="删除"
                      className="text-[var(--muted-foreground)] hover:text-[#EA4335] transition-colors disabled:opacity-40"
                    >
                      <span className="material-icons-round text-[20px]">delete_outline</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer count */}
      <div className="border-t border-[var(--card-border)] px-4 py-2 text-xs text-[var(--muted-foreground)]">
        显示 {filtered.length} / {words.length} 个词汇
      </div>
    </div>
  );
}
