'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { addCountdown, addCountdownBatch, deleteCountdown, reorderCountdowns, updateCountdown } from '@/actions/countdown';
import { CountdownEvent, TimeLeft } from '@/types/countdown';

// ── helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_COUNTDOWNS: Omit<CountdownEvent, 'id' | 'user_id' | 'created_at'>[] = [
  { title: '春节 (CNY)', target_date: '2026-02-17T00:00:00', color: '#ea4335', description: 'Chinese New Year 2026', sort_order: 0 },
  { title: 'Chemistry (理论)', target_date: '2026-04-28T13:00:00', color: '#fbbc04', description: 'IGCSE Chemistry Paper 4', sort_order: 1 },
  { title: 'Physics (理论)', target_date: '2026-05-05T13:00:00', color: '#34a853', description: 'IGCSE Physics Paper 4', sort_order: 2 },
  { title: 'Maths P4', target_date: '2026-05-07T08:00:00', color: '#4285f4', description: 'IGCSE Mathematics Paper 4', sort_order: 3 },
  { title: 'Biology (理论)', target_date: '2026-05-12T08:00:00', color: '#34a853', description: 'IGCSE Biology Paper 4', sort_order: 4 },
];

const PRESET_COLORS = ['#4285f4', '#ea4335', '#fbbc04', '#34a853', '#9c27b0', '#ff5722'];

function getTimeLeft(targetDate: string): TimeLeft {
  const now = Date.now();
  const target = new Date(targetDate).getTime();
  const diff = target - now;

  if (diff <= 0) return { months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };

  const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30.44));
  const weeks = Math.floor((diff % (1000 * 60 * 60 * 24 * 30.44)) / (1000 * 60 * 60 * 24 * 7));
  const days = Math.floor((diff % (1000 * 60 * 60 * 24 * 7)) / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { months, weeks, days, hours, minutes, seconds, isPast: false };
}

function getWeekNumber(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86400000) + 1;
  const dayOfWeek = start.getDay();
  return Math.ceil((dayOfYear + dayOfWeek) / 7);
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

// ── types ────────────────────────────────────────────────────────────────────

type ModalMode = 'add' | 'edit';

interface FormState {
  title: string;
  target_date: string;
  color: string;
  description: string;
}

const EMPTY_FORM: FormState = { title: '', target_date: '', color: '#4285f4', description: '' };

// ── main component ────────────────────────────────────────────────────────────

export default function CountdownApp({ initialCountdowns }: { initialCountdowns: CountdownEvent[] }) {
  const [countdowns, setCountdowns] = useState<CountdownEvent[]>(initialCountdowns);
  const [activeId, setActiveId] = useState<string | null>(initialCountdowns[0]?.id ?? null);
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
  const [now, setNow] = useState(new Date());

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('add');
  const [editTarget, setEditTarget] = useState<CountdownEvent | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // sort mode
  const [sortMode, setSortMode] = useState(false);
  const dragIdx = useRef<number | null>(null);

  const active = countdowns.find((c) => c.id === activeId) ?? countdowns[0] ?? null;

  // tick every second
  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
      if (active) setTimeLeft(getTimeLeft(active.target_date));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  // recalc when active changes
  useEffect(() => {
    if (active) setTimeLeft(getTimeLeft(active.target_date));
    else setTimeLeft(null);
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // set CSS theme color
  useEffect(() => {
    const color = active?.color ?? '#4285f4';
    document.documentElement.style.setProperty('--countdown-theme-color', color);
    return () => { document.documentElement.style.removeProperty('--countdown-theme-color'); };
  }, [active?.color]);

  // ── drag & drop ───────────────────────────────────────────────────────────

  function handleDragStart(idx: number) {
    dragIdx.current = idx;
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === idx) return;
    const next = [...countdowns];
    const [item] = next.splice(from, 1);
    next.splice(idx, 0, item);
    dragIdx.current = idx;
    setCountdowns(next);
  }

  function handleDrop() {
    dragIdx.current = null;
    const items = countdowns.map((c, i) => ({ id: c.id, sort_order: i }));
    startTransition(async () => {
      await reorderCountdowns(items);
    });
  }

  // ── modal helpers ─────────────────────────────────────────────────────────

  function openAdd() {
    setModalMode('add');
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(c: CountdownEvent) {
    setModalMode('edit');
    setEditTarget(c);
    setForm({ title: c.title, target_date: c.target_date.slice(0, 16), color: c.color, description: c.description ?? '' });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setFormError(null);
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.title.trim()) { setFormError('请输入事件名称'); return; }
    if (!form.target_date) { setFormError('请选择目标时间'); return; }

    startTransition(async () => {
      try {
        if (modalMode === 'add') {
          const fd = new FormData();
          fd.set('title', form.title.trim());
          fd.set('target_date', form.target_date);
          fd.set('color', form.color);
          fd.set('description', form.description);
          await addCountdown(fd);
        } else if (editTarget) {
          await updateCountdown(editTarget.id, {
            title: form.title.trim(),
            target_date: form.target_date,
            color: form.color,
            description: form.description,
          });
        }
        closeModal();
        // Optimistically update UI via full reload trigger is handled by revalidatePath
        // For instant feedback we patch local state
        if (modalMode === 'edit' && editTarget) {
          setCountdowns((prev) =>
            prev.map((c) =>
              c.id === editTarget.id
                ? { ...c, title: form.title.trim(), target_date: form.target_date, color: form.color, description: form.description || null }
                : c
            )
          );
        }
      } catch (err) {
        setFormError(err instanceof Error ? err.message : '操作失败');
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCountdown(id);
      setCountdowns((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId(countdowns.find((c) => c.id !== id)?.id ?? null);
    });
  }

  function handleSeedDefaults() {
    startTransition(async () => {
      await addCountdownBatch(DEFAULT_COUNTDOWNS);
      // page will revalidate; we patch optimistically
      const fakes = DEFAULT_COUNTDOWNS.map((d, i) => ({
        ...d,
        id: `temp-${i}`,
        user_id: '',
        created_at: new Date().toISOString(),
      }));
      setCountdowns(fakes);
      setActiveId(fakes[0].id);
    });
  }

  // ── info bar ──────────────────────────────────────────────────────────────

  const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  const weekNum = getWeekNumber(now);

  // ── render ────────────────────────────────────────────────────────────────

  const themeColor = active?.color ?? '#4285f4';

  const numUnits: { key: keyof TimeLeft; label: string }[] = [
    { key: 'months', label: '个月' },
    { key: 'weeks', label: '周' },
    { key: 'days', label: '天' },
    { key: 'hours', label: '时' },
    { key: 'minutes', label: '分' },
    { key: 'seconds', label: '秒' },
  ];

  return (
    <div className="flex flex-col min-h-0 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
      {/* Google-style color bar */}
      <div style={{ height: 4, background: 'linear-gradient(90deg, #4285f4 25%, #ea4335 50%, #fbbc04 75%, #34a853 100%)' }} />

      {/* Info bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs text-[var(--muted-foreground)] bg-[var(--card)] border-b border-[var(--card-border)]">
        <span>今天是 {dateStr}</span>
        <span>·</span>
        <span>第 {weekNum} 周</span>
        {active?.description && (
          <>
            <span>·</span>
            <span style={{ color: themeColor }}>{active.description}</span>
          </>
        )}
      </div>

      {/* Tab pills row */}
      <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto border-b border-[var(--card-border)] bg-[var(--background)]">
        {countdowns.map((c, idx) => {
          const isActive = c.id === activeId;
          return (
            <button
              key={c.id}
              draggable={sortMode}
              onDragStart={sortMode ? () => handleDragStart(idx) : undefined}
              onDragOver={sortMode ? (e) => handleDragOver(e, idx) : undefined}
              onDrop={sortMode ? handleDrop : undefined}
              onClick={() => { if (!sortMode) setActiveId(c.id); }}
              className="shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap"
              style={{
                background: isActive ? c.color : `${c.color}20`,
                border: `1px solid ${isActive ? c.color : `${c.color}40`}`,
                color: isActive ? '#fff' : c.color,
                cursor: sortMode ? 'grab' : 'pointer',
              }}
            >
              {sortMode && <span className="material-icons-round text-xs">drag_indicator</span>}
              {c.title}
            </button>
          );
        })}
      </div>

      {/* Main countdown display */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 gap-6">
        {countdowns.length === 0 ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="material-icons-round text-5xl text-[var(--muted-foreground)]">timer_off</span>
            <p className="text-[var(--muted-foreground)]">还没有倒计时事件</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={handleSeedDefaults}
                disabled={isPending}
                className="flex items-center gap-2 rounded-[8px] bg-[var(--card)] border border-[var(--card-border)] px-4 py-2 text-sm hover:bg-[var(--card-border)] transition-colors disabled:opacity-50"
              >
                <span className="material-icons-round text-base">auto_awesome</span>
                加载默认倒计时
              </button>
              <button
                onClick={openAdd}
                className="flex items-center gap-2 rounded-[8px] px-4 py-2 text-sm font-medium text-white transition-colors"
                style={{ background: '#4285f4' }}
              >
                <span className="material-icons-round text-base">add</span>
                添加事件
              </button>
            </div>
          </div>
        ) : active && timeLeft ? (
          <>
            {/* Event title */}
            <div className="text-center">
              <h1 className="text-2xl font-bold" style={{ color: themeColor }}>{active.title}</h1>
              {active.description && (
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">{active.description}</p>
              )}
            </div>

            {/* Number cards */}
            {timeLeft.isPast ? (
              <div className="flex items-center gap-2 rounded-[12px] px-6 py-4 text-xl font-semibold" style={{ background: `#ea433520`, color: '#ea4335' }}>
                <span className="material-icons-round">event_busy</span>
                已过期
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-3">
                {numUnits.map(({ key, label }) => {
                  const val = timeLeft[key] as number;
                  // hide leading zero units (months/weeks) but always show days..seconds
                  const alwaysShow = key === 'days' || key === 'hours' || key === 'minutes' || key === 'seconds';
                  if (!alwaysShow && val === 0) return null;
                  return (
                    <div
                      key={key}
                      className="flex flex-col items-center rounded-[12px] px-4 py-3 min-w-[72px]"
                      style={{ background: `${themeColor}15`, border: `1px solid ${themeColor}30` }}
                    >
                      <span
                        style={{
                          fontFamily: "'Montserrat', sans-serif",
                          fontSize: 56,
                          fontWeight: 900,
                          lineHeight: 1,
                          color: themeColor,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {pad2(val)}
                      </span>
                      <span className="mt-1 text-xs font-medium" style={{ color: themeColor }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Target date line */}
            <p className="text-xs text-[var(--muted-foreground)]">
              目标时间：{new Date(active.target_date).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </p>
          </>
        ) : null}

        {/* Action buttons */}
        {countdowns.length > 0 && (
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            <button
              onClick={openAdd}
              className="flex items-center gap-2 rounded-[8px] px-4 py-2 text-sm font-medium text-white transition-colors"
              style={{ background: themeColor }}
            >
              <span className="material-icons-round text-base">add</span>
              添加事件
            </button>
            {active && (
              <button
                onClick={() => openEdit(active)}
                className="flex items-center gap-2 rounded-[8px] border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <span className="material-icons-round text-base">edit</span>
                编辑
              </button>
            )}
            {active && (
              <button
                onClick={() => handleDelete(active.id)}
                disabled={isPending}
                className="flex items-center gap-2 rounded-[8px] border border-[#ea433530] px-4 py-2 text-sm text-[#ea4335] hover:bg-[#ea433515] transition-colors disabled:opacity-50"
              >
                <span className="material-icons-round text-base">delete_outline</span>
                删除
              </button>
            )}
            <button
              onClick={() => setSortMode((v) => !v)}
              className="flex items-center gap-2 rounded-[8px] border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              style={sortMode ? { background: `${themeColor}20`, borderColor: themeColor, color: themeColor } : {}}
            >
              <span className="material-icons-round text-base">swap_vert</span>
              {sortMode ? '完成排序' : '排序'}
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-[16px] bg-[var(--card)] border border-[var(--card-border)] shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-4">
              <h2 className="text-base font-semibold text-[var(--foreground)]">
                {modalMode === 'add' ? '添加倒计时事件' : '编辑倒计时事件'}
              </h2>
              <button onClick={closeModal} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5">
              {formError && (
                <div className="mb-4 flex items-center gap-2 rounded-[8px] bg-[#ea433515] px-3 py-2 text-sm text-[#ea4335]">
                  <span className="material-icons-round text-base">error_outline</span>
                  {formError}
                </div>
              )}
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">事件名称 *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="例：高考"
                    required
                    className="w-full rounded-[8px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285f4] focus:ring-1 focus:ring-[#4285f4] transition-colors"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">目标时间 *</label>
                  <input
                    type="datetime-local"
                    value={form.target_date}
                    onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))}
                    required
                    className="w-full rounded-[8px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285f4] focus:ring-1 focus:ring-[#4285f4] transition-colors"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">备注</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="可选描述"
                    className="w-full rounded-[8px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285f4] focus:ring-1 focus:ring-[#4285f4] transition-colors"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium text-[var(--muted-foreground)]">颜色</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, color: c }))}
                        className="h-7 w-7 rounded-full border-2 transition-all"
                        style={{
                          backgroundColor: c,
                          borderColor: form.color === c ? 'var(--foreground)' : 'transparent',
                          transform: form.color === c ? 'scale(1.2)' : 'scale(1)',
                        }}
                      />
                    ))}
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                      className="h-7 w-7 cursor-pointer rounded-full border border-[var(--card-border)] bg-transparent p-0.5"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex flex-1 items-center justify-center gap-2 rounded-[8px] py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
                    style={{ background: form.color || '#4285f4' }}
                  >
                    <span className="material-icons-round text-base">{modalMode === 'add' ? 'add_circle_outline' : 'save'}</span>
                    {isPending ? '保存中…' : modalMode === 'add' ? '添加' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-[8px] border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Montserrat font */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@900&display=swap');`}</style>
    </div>
  );
}
