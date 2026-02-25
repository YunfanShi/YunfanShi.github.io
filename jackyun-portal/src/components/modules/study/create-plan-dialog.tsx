'use client';

import { useRef, useState, useTransition } from 'react';
import { createPlan } from '@/actions/study';

export default function CreatePlanDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createPlan(formData);
        formRef.current?.reset();
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create plan');
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-[10px] bg-[#4285F4] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#3574e0] transition-colors"
      >
        <span className="material-icons-round text-base">add</span>
        新建计划
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md rounded-[16px] border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-xl">
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-[#4285F4]">school</span>
                <h2 className="text-lg font-semibold text-[var(--foreground)]">新建学习计划</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--card-border)] transition-colors"
              >
                <span className="material-icons-round text-base">close</span>
              </button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                  计划名称 <span className="text-[#EA4335]">*</span>
                </label>
                <input
                  name="title"
                  type="text"
                  required
                  placeholder="例如：高考英语备考计划"
                  className="w-full rounded-[8px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                  描述
                </label>
                <textarea
                  name="description"
                  rows={3}
                  placeholder="简单描述这个计划的目标…"
                  className="w-full resize-none rounded-[8px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                    开始日期
                  </label>
                  <input
                    name="start_date"
                    type="date"
                    className="w-full rounded-[8px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                    结束日期
                  </label>
                  <input
                    name="end_date"
                    type="date"
                    className="w-full rounded-[8px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
                  />
                </div>
              </div>

              {error && (
                <p className="flex items-center gap-1 text-sm text-[#EA4335]">
                  <span className="material-icons-round text-base">error_outline</span>
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-[8px] border border-[var(--card-border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex items-center gap-1.5 rounded-[8px] bg-[#4285F4] px-4 py-2 text-sm font-medium text-white hover:bg-[#3574e0] disabled:opacity-60 transition-colors"
                >
                  {isPending && (
                    <span className="material-icons-round animate-spin text-base">refresh</span>
                  )}
                  创建计划
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
