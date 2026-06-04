'use client';

import { useState, useTransition } from 'react';
import { deletePoem } from '@/actions/poem';
import ReciteMode from './recite-mode';

interface Poem {
  id: string;
  title: string;
  author: string | null;
  content: string;
  mastery_level: number;
  created_at: string;
}

interface PoemListProps {
  poems: Poem[];
}

const MASTERY_COLORS = ['#555', '#EA4335', '#FBBC05', '#FBBC05', '#34A853', '#34A853'];
const MASTERY_LABELS = ['未学', '初识', '熟悉', '较熟', '熟练', '完全掌握'];

function MasteryDots({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="material-icons-round text-[14px]"
          style={{ color: i <= level ? MASTERY_COLORS[level] : 'var(--card-border)' }}
        >
          {i <= level ? 'star' : 'star_border'}
        </span>
      ))}
    </div>
  );
}

export default function PoemList({ poems }: PoemListProps) {
  const [search, setSearch] = useState('');
  const [reciting, setReciting] = useState<Poem | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(poem: Poem) {
    if (!confirm(`确定删除「${poem.title}」吗？`)) return;
    startTransition(() => deletePoem(poem.id));
  }

  const filtered = poems.filter(
    (p) =>
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.author ?? '').toLowerCase().includes(search.toLowerCase()) ||
      p.content.toLowerCase().includes(search.toLowerCase()),
  );

  if (poems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-[var(--card-border)] py-20 text-center">
        <span className="material-icons-round mb-4 text-5xl text-[var(--muted-foreground)]">
          auto_stories
        </span>
        <h3 className="text-base font-semibold text-[var(--foreground)]">还没有诗词</h3>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">使用上方表单添加你的第一首诗词</p>
      </div>
    );
  }

  return (
    <>
      {/* ReciteMode overlay */}
      {reciting && <ReciteMode poem={reciting} onClose={() => setReciting(null)} />}

      <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)]">
        {/* Search toolbar */}
        <div className="border-b border-[var(--card-border)] p-4">
          <div className="relative">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-base text-[var(--muted-foreground)]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索诗词标题、作者或内容…"
              className="w-full rounded-[8px] border border-[var(--card-border)] bg-[var(--background)] py-2 pl-9 pr-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
            没有匹配的诗词
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((poem, idx) => {
              const previewLines = poem.content
                .split('\n')
                .filter((l) => l.trim())
                .slice(0, 2);

              return (
                <div
                  key={poem.id}
                  className={`group flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--background)] ${
                    idx < filtered.length - 1 ? 'border-b border-[var(--card-border)]' : ''
                  } sm:border-b sm:border-r sm:last:border-r-0`}
                >
                  {/* Title + author */}
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)] leading-tight">
                      {poem.title}
                    </h3>
                    {poem.author && (
                      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{poem.author}</p>
                    )}
                  </div>

                  {/* Content preview */}
                  <div className="flex-1 space-y-0.5">
                    {previewLines.map((line, i) => (
                      <p key={i} className="truncate text-sm text-[var(--muted-foreground)]">
                        {line}
                      </p>
                    ))}
                    {poem.content.split('\n').filter((l) => l.trim()).length > 2 && (
                      <p className="text-xs text-[var(--muted-foreground)] opacity-60">…</p>
                    )}
                  </div>

                  {/* Mastery + actions */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <MasteryDots level={poem.mastery_level} />
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        {MASTERY_LABELS[poem.mastery_level]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setReciting(poem)}
                        className="flex items-center gap-1 rounded-[8px] bg-[#4285F4] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3574e0] transition-colors"
                      >
                        <span className="material-icons-round text-[14px]">menu_book</span>
                        背诵
                      </button>
                      <button
                        onClick={() => handleDelete(poem)}
                        disabled={isPending}
                        title="删除"
                        className="rounded-[8px] p-1.5 text-[var(--muted-foreground)] hover:text-[#EA4335] hover:bg-[#EA433515] transition-colors disabled:opacity-40"
                      >
                        <span className="material-icons-round text-[18px]">delete_outline</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-[var(--card-border)] px-4 py-2 text-xs text-[var(--muted-foreground)]">
          显示 {filtered.length} / {poems.length} 首诗词
        </div>
      </div>
    </>
  );
}
