'use client';

import { useState, useTransition } from 'react';
import { addCountdown } from '@/actions/countdown';

const PRESET_COLORS = [
  { value: '#4285F4', label: '蓝' },
  { value: '#EA4335', label: '红' },
  { value: '#FBBC05', label: '黄' },
  { value: '#34A853', label: '绿' },
  { value: '#9C27B0', label: '紫' },
  { value: '#FF5722', label: '橙' },
];

export default function AddCountdownForm() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#4285F4');

  function resetForm() {
    setTitle('');
    setTargetDate('');
    setDescription('');
    setColor('#4285F4');
    setError(null);
    setSuccess(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    fd.set('title', title);
    fd.set('target_date', targetDate);
    fd.set('description', description);
    fd.set('color', color);
    startTransition(async () => {
      try {
        await addCountdown(fd);
        setSuccess('倒计时已添加！');
        resetForm();
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : '添加失败');
      }
    });
  }

  const inputCls =
    'w-full rounded-[8px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors';

  return (
    <div className="mb-6">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-[8px] bg-[#4285F4] px-4 py-2 text-sm font-medium text-white hover:bg-[#3574e0] transition-colors"
        >
          <span className="material-icons-round text-base">add</span>
          添加倒计时
        </button>
      ) : (
        <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)]">
          <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">添加新倒计时</h2>
            <button
              onClick={() => { setOpen(false); resetForm(); }}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              <span className="material-icons-round text-base">close</span>
            </button>
          </div>

          <div className="p-4">
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
                placeholder="事件名称（必填）"
                required
                className={inputCls}
              />
              <div>
                <label className="mb-1 block text-xs text-[var(--muted-foreground)]">目标日期和时间</label>
                <input
                  type="datetime-local"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  required
                  className={inputCls}
                />
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="备注（可选）"
                rows={2}
                className={`${inputCls} resize-none`}
              />
              <div>
                <label className="mb-2 block text-xs text-[var(--muted-foreground)]">颜色</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setColor(c.value)}
                      title={c.label}
                      className="h-7 w-7 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: c.value,
                        borderColor: color === c.value ? 'var(--foreground)' : 'transparent',
                        transform: color === c.value ? 'scale(1.2)' : 'scale(1)',
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    title="自定义颜色"
                    className="h-7 w-7 cursor-pointer rounded-full border border-[var(--card-border)] bg-transparent p-0.5"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isPending || !title.trim() || !targetDate}
                  className="flex flex-1 items-center justify-center gap-2 rounded-[8px] bg-[#4285F4] py-2 text-sm font-medium text-white hover:bg-[#3574e0] disabled:opacity-50 transition-colors"
                >
                  <span className="material-icons-round text-base">timer</span>
                  {isPending ? '添加中…' : '添加倒计时'}
                </button>
                <button
                  type="button"
                  onClick={() => { setOpen(false); resetForm(); }}
                  className="rounded-[8px] border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
