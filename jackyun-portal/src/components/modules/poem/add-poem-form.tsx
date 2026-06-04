'use client';

import { useState, useTransition } from 'react';
import { addPoem } from '@/actions/poem';

const inputCls =
  'w-full rounded-[8px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors';

export default function AddPoemForm() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const fd = new FormData();
    fd.set('title', title);
    fd.set('author', author);
    fd.set('content', content);

    startTransition(async () => {
      try {
        await addPoem(fd);
        setSuccess('诗词添加成功！');
        setTitle('');
        setAuthor('');
        setContent('');
      } catch (err) {
        setError(err instanceof Error ? err.message : '添加失败');
      }
    });
  }

  return (
    <div className="mb-6 rounded-[12px] border border-[var(--card-border)] bg-[var(--card)]">
      {/* Toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)] rounded-[12px] transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="material-icons-round text-base text-[#4285F4]">add_circle_outline</span>
          添加诗词
        </span>
        <span
          className={`material-icons-round text-base text-[var(--muted-foreground)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--card-border)] p-4">
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

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="诗词标题（必填）"
              required
              className={inputCls}
            />
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="作者（选填）"
              className={inputCls}
            />
            <div className="relative">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={'输入诗词正文，每行一句…\n例如：\n床前明月光，\n疑是地上霜。'}
                rows={6}
                required
                className={`${inputCls} resize-y pb-6`}
              />
              <span className="absolute bottom-2 right-3 text-xs text-[var(--muted-foreground)]">
                {content.length} 字
              </span>
            </div>
            <button
              type="submit"
              disabled={isPending || !title.trim() || !content.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#4285F4] py-2 text-sm font-medium text-white hover:bg-[#3574e0] disabled:opacity-50 transition-colors"
            >
              <span className="material-icons-round text-base">auto_stories</span>
              {isPending ? '添加中…' : '添加诗词'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
