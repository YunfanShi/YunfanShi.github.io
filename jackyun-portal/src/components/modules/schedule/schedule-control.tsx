'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { parseAiJson, readAiResponseContent } from '@/lib/ai-json';
import {
  completeReview,
  createEmptyScheduleState,
  dateFromKey,
  dateKey,
  parseTimetableImport,
  sessionsForDate,
  tasksForDate,
  timetableImportTemplate,
  weekDates,
  withReviewCourseSelection,
  type LearningStatus,
  type LearningTask,
  type ManualLearningTask,
  type ScheduleControlState,
  type TimetableImport,
} from '@/lib/learning/schedule-control';

const STORAGE_KEY = 'jackyun_schedule_control_v1';
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const REVIEW_TYPES = new Set<LearningTask['type']>(['course-review', 'interval-review', 'weekly-review']);
const TYPE_META: Record<LearningTask['type'], { label: string; icon: string; tone: string }> = {
  'course-review': { label: '今日复习', icon: 'history_edu', tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200' },
  'interval-review': { label: '间隔复习', icon: 'event_repeat', tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200' },
  'weekly-review': { label: '周末集中', icon: 'view_week', tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200' },
  preview: { label: '预习', icon: 'preview', tone: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-200' },
  special: { label: '专项学习', icon: 'target', tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200' },
  exam: { label: '考试', icon: 'assignment', tone: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-200' },
  custom: { label: '待办', icon: 'check_circle', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
};

function loadState(): ScheduleControlState {
  const empty = createEmptyScheduleState();
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Partial<ScheduleControlState> | null;
    if (!parsed || parsed.schemaVersion !== 1) return empty;
    const storedSettings = parsed.settings as Partial<ScheduleControlState['settings']> | undefined;
    const previewPreferenceSet = storedSettings?.previewPreferenceSet === true;
    return {
      ...empty,
      ...parsed,
      settings: {
        ...empty.settings,
        ...storedSettings,
        previewEnabled: previewPreferenceSet && storedSettings?.previewEnabled === true,
        previewPreferenceSet,
      },
      manualTasks: Array.isArray(parsed.manualTasks) ? parsed.manualTasks : [],
      completions: parsed.completions && typeof parsed.completions === 'object' ? parsed.completions : {},
      reviewProgress: parsed.reviewProgress && typeof parsed.reviewProgress === 'object' ? parsed.reviewProgress : {},
      timetable: parsed.timetable ? parseTimetableImport(parsed.timetable) : null,
    };
  } catch {
    return empty;
  }
}

function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(date);
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date);
}

function formatReviewTimestamp(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function statusMark(status: LearningStatus): string {
  return status === 'stable' ? '√' : status === 'partial' ? '△' : '○';
}

function minutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function taskId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Notice({ message }: { message: string }) {
  if (!message) return null;
  return <div role="status" className="fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-[#202124] px-4 py-2.5 text-sm font-medium text-white shadow-xl">{message}</div>;
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--card-border)] bg-[var(--card)] px-6 text-center">
      <span className="material-icons-round text-4xl text-[var(--brand)]">calendar_month</span>
      <h3 className="mt-3 text-base font-semibold">先导入一份课表</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">支持规则 JSON 和 AI 文本识别。课表不会被写进网站代码；普通 JSON 导入只在这台设备的浏览器里处理。</p>
      <button type="button" onClick={onImport} className="mt-5 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">导入课表</button>
    </div>
  );
}

function ReviewDialog({ task, onClose, onComplete }: { task: LearningTask; onClose: () => void; onComplete: (status: LearningStatus, note: string) => void }) {
  const [status, setStatus] = useState<LearningStatus>('stable');
  const [note, setNote] = useState(task.note ?? '');
  const options: Array<{ value: LearningStatus; mark: string; title: string; hint: string; className: string }> = [
    { value: 'stable', mark: '√', title: '稳定', hint: '闭卷能讲清并能应用', className: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' },
    { value: 'partial', mark: '△', title: '不完整', hint: '有缺口，明天重测', className: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200' },
    { value: 'unclear', mark: '○', title: '陌生', hint: '先修复知识节点', className: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200' },
  ];
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="w-full max-w-xl rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--brand)] dark:bg-blue-950/50"><span className="material-icons-round">fact_check</span></div>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[var(--brand)]">完成复习</p><h2 id="review-dialog-title" className="mt-1 text-xl font-semibold">{task.title}</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">学习状态决定下次复习间隔；备注会在下次复习时带回。</p></div>
          <button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span className="material-icons-round">close</span></button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {options.map((option) => <button key={option.value} type="button" onClick={() => setStatus(option.value)} aria-pressed={status === option.value} className={`rounded-2xl border p-4 text-left transition ${option.className} ${status === option.value ? 'ring-2 ring-[var(--brand)] ring-offset-2 ring-offset-[var(--card)]' : 'opacity-75 hover:opacity-100'}`}><span className="text-2xl font-bold">{option.mark}</span><strong className="ml-2">{option.title}</strong><span className="mt-2 block text-xs leading-5 opacity-80">{option.hint}</span></button>)}
        </div>
        <label className="mt-5 block text-sm font-medium">备注与判定原因 <span className="text-rose-600">（必填）</span><textarea required value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={1000} placeholder="请写明为什么是 √ / △ / ○，以及下次要重测什么。例如：会套公式，但还说不清原理。" className="mt-2 w-full resize-none rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--brand)]" /></label>
        {!note.trim() && <p className="mt-2 text-xs text-rose-600">选择任何状态后都要写备注，下次复习会显示这个原因。</p>}
        <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm font-medium">取消</button><button type="button" disabled={!note.trim()} onClick={() => onComplete(status, note)} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#202124]">完成并安排下次复习</button></div>
      </div>
    </div>
  );
}

function TaskDialog({ date, onClose, onSave }: { date: string; onClose: () => void; onSave: (task: ManualLearningTask) => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ManualLearningTask['type']>('custom');
  const [taskDate, setTaskDate] = useState(date);
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState(30);
  const [subject, setSubject] = useState('');
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="w-full max-w-lg rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl" onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onSave({ id: taskId(), title: title.trim().slice(0, 120), type, date: taskDate, ...(start ? { start } : {}), durationMinutes: Math.max(5, Math.min(600, duration || 30)), ...(subject.trim() ? { subject: subject.trim().slice(0, 80) } : {}), ...(note.trim() ? { note: note.trim().slice(0, 1000) } : {}) }); }}>
        <div className="flex items-center justify-between"><h2 id="task-dialog-title" className="text-xl font-semibold">添加学习任务</h2><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span className="material-icons-round">close</span></button></div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium">任务名称<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="例如：力学专题训练" className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5 outline-none focus:border-[var(--brand)]" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">类型<select value={type} onChange={(event) => setType(event.target.value as ManualLearningTask['type'])} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5"><option value="custom">待办</option><option value="preview">预习（可选）</option><option value="special">专项学习</option><option value="exam">考试</option></select></label><label className="text-sm font-medium">科目（可选）<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={80} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5" /></label></div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3"><label className="text-sm font-medium">日期<input required type="date" value={taskDate} onChange={(event) => setTaskDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="text-sm font-medium">开始（可选）<input type="time" value={start} onChange={(event) => setStart(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="col-span-2 text-sm font-medium sm:col-span-1">分钟<input type="number" min={5} max={600} value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label></div>
          <label className="block text-sm font-medium">备注<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000} className="mt-2 w-full resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5" /></label>
        </div>
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm font-medium">取消</button><button type="submit" className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">添加</button></div>
      </form>
    </div>
  );
}

function ImportDialog({ onClose, onApply }: { onClose: () => void; onApply: (timetable: TimetableImport) => void }) {
  const [mode, setMode] = useState<'json' | 'ai'>('json');
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<TimetableImport | null>(null);
  const [reviewCourseIds, setReviewCourseIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const showPreview = (parsed: TimetableImport, prefix: string) => {
    setPreview(parsed);
    setReviewCourseIds([]);
    setMessage(`${prefix}${parsed.courses.length} 门课程、${parsed.courses.reduce((total, course) => total + course.sessions.length, 0)} 个时段。请在下方选择需要复习的科目。`);
  };
  const parseJson = (text: string) => {
    try { showPreview(parseTimetableImport(JSON.parse(text) as unknown), '识别到 '); }
    catch (error) { setPreview(null); setReviewCourseIds([]); setMessage(error instanceof Error ? error.message : 'JSON 无法读取。'); }
  };
  const runAiImport = async () => {
    if (!source.trim()) return;
    setBusy(true); setMessage('AI 正在整理课表，只会生成导入预览…'); setPreview(null); setReviewCourseIds([]);
    try {
      const response = await fetch('/api/llm-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'chat', stream: false, temperature: 0.1, _no_thinking: true, messages: [{ role: 'system', content: `把用户提供的课表文本转换成严格 JSON，不要解释，不要添加原文没有的课程。格式：${JSON.stringify(timetableImportTemplate())}。day 使用 1=周一 到 7=周日；时间使用 HH:mm；每个课程合并所有 sessions；无法确认的地点或教师省略；所有课程的 review 一律设为 false，复习科目由用户在导入预览中亲自选择。weeks 仅在原文明确给出时填写。` }, { role: 'user', content: source.slice(0, 40_000) }] }) });
      const content = await readAiResponseContent(response);
      showPreview(parseTimetableImport(parseAiJson(content)), 'AI 识别到 ');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'AI 导入失败。'); }
    finally { setBusy(false); }
  };
  const copyRules = async () => {
    const rules = `JackYun 课表 JSON 规则\n- version 固定为 1\n- day: 1=周一，7=周日\n- start/end: HH:mm\n- review 导入时保持 false；需要复习的科目在预览中手动选择\n- weeks: 可选，学期周次数组；需要 termStart 才能精确计算\n\n${JSON.stringify(timetableImportTemplate(), null, 2)}`;
    await navigator.clipboard.writeText(rules); setMessage('导入规则和模板已复制。');
  };
  const toggleReviewCourse = (courseId: string) => setReviewCourseIds((current) => current.includes(courseId) ? current.filter((id) => id !== courseId) : [...current, courseId]);
  const applyPreview = () => {
    if (!preview) return;
    onApply(withReviewCourseSelection(preview, reviewCourseIds));
  };
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-[var(--card-border)] bg-[var(--card)] shadow-2xl">
        <div className="relative overflow-hidden border-b border-[var(--card-border)] p-6"><div className="pointer-events-none absolute -right-8 -top-16 h-40 w-40 rounded-full bg-blue-500/15 blur-3xl" /><div className="relative flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--brand)] dark:bg-blue-950/50"><span className="material-icons-round">calendar_month</span></div><div className="min-w-0 flex-1"><h2 id="import-dialog-title" className="text-xl font-semibold">导入课表</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">先确认课程，再亲自选择需要复习的科目。</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span className="material-icons-round">close</span></button></div></div>
        <div className="overflow-y-auto p-6">
          <div className="inline-flex rounded-full bg-black/5 p-1 dark:bg-white/10"><button type="button" onClick={() => { setMode('json'); setPreview(null); setReviewCourseIds([]); setMessage(''); }} className={`rounded-full px-4 py-2 text-sm font-medium ${mode === 'json' ? 'bg-[var(--card)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}>JSON 导入</button><button type="button" onClick={() => { setMode('ai'); setPreview(null); setReviewCourseIds([]); setMessage(''); }} className={`rounded-full px-4 py-2 text-sm font-medium ${mode === 'ai' ? 'bg-[var(--card)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}>AI 文本识别</button></div>
          {mode === 'json' ? <div className="mt-5"><div className="flex flex-wrap gap-3"><label className="cursor-pointer rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white dark:text-[#202124]">选择 JSON<input type="file" accept="application/json,.json" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const text = await file.text(); setSource(text); parseJson(text); }} /></label><button type="button" onClick={copyRules} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium"><span className="material-icons-round mr-1 align-middle text-base">content_copy</span>复制规则</button></div><textarea value={source} onChange={(event) => setSource(event.target.value)} rows={10} spellCheck={false} placeholder="也可以在这里粘贴 JSON…" className="mt-4 w-full resize-y rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 font-mono text-xs leading-5 outline-none focus:border-[var(--brand)]" /><button type="button" onClick={() => parseJson(source)} className="mt-3 rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">检查并预览</button></div> : <div className="mt-5"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><strong>隐私提醒：</strong>只有点击“AI 识别”后，下面的文本才会发送到你在 JackYun 中配置的 AI 服务。若不希望发送，请使用 JSON 导入。</div><textarea value={source} onChange={(event) => setSource(event.target.value)} rows={10} maxLength={40_000} placeholder="粘贴课表文本、OCR 结果或从表格复制的内容…" className="mt-4 w-full resize-y rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 text-sm leading-6 outline-none focus:border-[var(--brand)]" /><button type="button" disabled={busy || !source.trim()} onClick={runAiImport} className="mt-3 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:text-[#202124]"><span className="material-icons-round mr-1 align-middle text-base">auto_awesome</span>{busy ? '识别中…' : 'AI 识别并预览'}</button></div>}
          {message && <p role="status" className="mt-4 rounded-xl bg-black/5 px-4 py-3 text-sm dark:bg-white/10">{message}</p>}
          {preview && <div className="mt-4 overflow-hidden rounded-3xl border border-[var(--card-border)]"><div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:from-blue-950/40 dark:to-indigo-950/30"><div><p className="font-semibold">{preview.name}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{preview.courses.length} 门课程 · 已选择 {reviewCourseIds.length} 门复习</p></div><div className="flex gap-2"><button type="button" onClick={() => setReviewCourseIds(preview.courses.map((course) => course.id))} className="rounded-full bg-[var(--card)] px-3 py-1.5 text-xs font-semibold shadow-sm">全选</button><button type="button" onClick={() => setReviewCourseIds([])} className="rounded-full bg-[var(--card)] px-3 py-1.5 text-xs font-semibold shadow-sm">清空</button></div></div><div className="grid max-h-72 gap-2 overflow-y-auto p-3 sm:grid-cols-2">{preview.courses.map((course) => { const checked = reviewCourseIds.includes(course.id); return <label key={course.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition ${checked ? 'border-[var(--brand)] bg-blue-50/80 shadow-sm dark:bg-blue-950/30' : 'border-[var(--card-border)] hover:bg-black/[.025] dark:hover:bg-white/[.04]'}`}><span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: course.color }} /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{course.shortName ?? course.name}</strong><span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">{course.sessions.length} 个上课时段</span></span><input type="checkbox" checked={checked} onChange={() => toggleReviewCourse(course.id)} className="h-5 w-5 shrink-0 accent-[var(--brand)]" aria-label={`${course.name}需要复习`} /></label>; })}</div></div>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--card-border)] p-5"><p className="text-xs text-[var(--muted-foreground)]">复习科目选择会随课表一起保存在本机。</p><div className="flex gap-3"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm font-medium">取消</button><button type="button" disabled={!preview} onClick={applyPreview} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-40 dark:text-[#202124]">保存课表与复习科目</button></div></div>
      </div>
    </div>
  );
}

function TaskList({ tasks, onComplete, onDelete }: { tasks: LearningTask[]; onComplete: (task: LearningTask) => void; onDelete: (task: LearningTask) => void }) {
  if (!tasks.length) {
    return <div className="rounded-2xl border border-dashed border-[var(--card-border)] px-5 py-10 text-center"><span className="material-icons-round text-3xl text-emerald-500">task_alt</span><p className="mt-2 font-medium">今天的任务已经清空</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">可以自己添加预习、专项学习、考试或普通待办。</p></div>;
  }
  return (
    <div className="space-y-3">
      {tasks.map((task) => {
        const meta = TYPE_META[task.type];
        return (
          <article key={task.key} className="group rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 transition hover:border-[color-mix(in_srgb,var(--brand)_45%,var(--card-border))] hover:shadow-sm">
            <div className="flex gap-3">
              <button type="button" aria-label={`完成 ${task.title}`} onClick={() => onComplete(task)} className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-[var(--card-border)] text-transparent transition hover:border-emerald-500 hover:bg-emerald-500 hover:text-white"><span className="material-icons-round text-base">check</span></button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.tone}`}><span className="material-icons-round text-sm">{meta.icon}</span>{meta.label}</span>
                  {task.overdue && <span className="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-200">已逾期</span>}
                  {task.start && <span className="text-xs font-medium text-[var(--muted-foreground)]">{task.start} · {task.durationMinutes} 分钟</span>}
                </div>
                <h3 className="mt-2 font-semibold">{task.title}</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{task.detail}</p>
                {task.lastStatus && task.lastReviewedAt && (
                  <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/80 px-3.5 py-3 text-xs leading-5 text-violet-950 dark:border-violet-900 dark:bg-violet-950/35 dark:text-violet-100">
                    <p className="font-semibold">上次记录：{statusMark(task.lastStatus)} · {formatReviewTimestamp(task.lastReviewedAt)}</p>
                    <p className="mt-1">原因：{task.note}</p>
                  </div>
                )}
                {task.note && !task.lastStatus && task.note !== task.detail && <p className="mt-2 rounded-xl bg-black/[.035] px-3 py-2 text-xs leading-5 dark:bg-white/[.06]">备注：{task.note}</p>}
              </div>
              {['preview', 'special', 'exam', 'custom'].includes(task.type) && <button type="button" onClick={() => onDelete(task)} aria-label={`删除 ${task.title}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)] opacity-0 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100 dark:hover:bg-rose-950/40"><span className="material-icons-round text-lg">delete</span></button>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function ScheduleControl() {
  const [state, setState] = useState<ScheduleControlState>(() => createEmptyScheduleState());
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [view, setView] = useState<'today' | 'week' | 'settings'>('today');
  const [reviewTask, setReviewTask] = useState<LearningTask | null>(null);
  const [taskDialog, setTaskDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    queueMicrotask(() => {
      const current = new Date();
      setNow(current);
      setSelectedDate(dateKey(current));
      setState(loadState());
      setReady(true);
    });
  }, []);
  useEffect(() => { if (!ready) return; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [ready, state]);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 2800); return () => window.clearTimeout(timer); }, [notice]);

  const selected = useMemo(() => selectedDate ? dateFromKey(selectedDate) : new Date(2000, 0, 1), [selectedDate]);
  const todayKey = now ? dateKey(now) : '';
  const todaySessions = useMemo(() => sessionsForDate(state.timetable, selected), [selected, state.timetable]);
  const tasks = useMemo(() => tasksForDate(state, selected), [selected, state]);
  const week = useMemo(() => weekDates(selected), [selected]);
  const activeSession = now && selectedDate === todayKey ? todaySessions.find((session) => minutes(session.start) <= now.getHours() * 60 + now.getMinutes() && minutes(session.end) > now.getHours() * 60 + now.getMinutes()) : undefined;
  const nextSession = now && selectedDate === todayKey ? todaySessions.find((session) => minutes(session.start) > now.getHours() * 60 + now.getMinutes()) : todaySessions[0];
  const completedToday = now ? Object.values(state.completions).filter((completion) => dateKey(new Date(completion.completedAt)) === todayKey).length : 0;
  const reviewDue = tasks.filter((task) => REVIEW_TYPES.has(task.type)).length;

  const completeTask = (task: LearningTask) => {
    if (REVIEW_TYPES.has(task.type)) { setReviewTask(task); return; }
    setState((current) => ({ ...current, completions: { ...current.completions, [task.key]: { completedAt: new Date().toISOString() } } }));
    setNotice('任务已完成。');
  };
  const deleteTask = (task: LearningTask) => setState((current) => ({ ...current, manualTasks: current.manualTasks.filter((item) => item.id !== task.key) }));
  const navigateDate = (offset: number) => { const date = new Date(selected); date.setDate(date.getDate() + offset); setSelectedDate(dateKey(date)); };

  if (!ready || !now || !selectedDate) return <div className="mx-auto max-w-[1500px] animate-pulse"><div className="h-28 rounded-3xl bg-black/5 dark:bg-white/5" /><div className="mt-5 grid gap-5 lg:grid-cols-3"><div className="h-80 rounded-3xl bg-black/5 dark:bg-white/5 lg:col-span-2" /><div className="h-80 rounded-3xl bg-black/5 dark:bg-white/5" /></div></div>;

  return (
    <div className="mx-auto max-w-[1500px] pb-10">
      <header className="overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--surface-shadow)]">
        <div className="relative px-5 py-6 sm:px-7">
          <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-5"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-[var(--brand)]"><span className="h-2 w-2 rounded-full bg-emerald-500" />Personal learning control</div><h1 className="mt-2 text-2xl font-semibold tracking-[-.035em] sm:text-3xl">{state.settings.mode === 'holiday' ? '假日学习控制台' : '今日学习与课表'}</h1><p className="mt-2 text-sm text-[var(--muted-foreground)]">{formatLongDate(selected)}{selectedDate !== todayKey ? ' · 正在查看其他日期' : ''}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setTaskDialog(true)} className="rounded-full border border-[var(--card-border)] bg-[var(--card)] px-4 py-2.5 text-sm font-semibold hover:bg-black/[.035] dark:hover:bg-white/[.06]"><span className="material-icons-round mr-1 align-middle text-lg">add</span>添加任务</button><button type="button" onClick={() => setImportDialog(true)} className="rounded-full bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white dark:text-[#202124]"><span className="material-icons-round mr-1 align-middle text-lg">upload_file</span>导入课表</button></div></div>
          <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">今日课程</p><strong className="mt-1 block text-2xl">{state.settings.mode === 'holiday' ? '—' : todaySessions.length}</strong></div><div className="rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">待复习</p><strong className="mt-1 block text-2xl">{reviewDue}</strong></div><div className="rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">今日完成</p><strong className="mt-1 block text-2xl">{completedToday}</strong></div><div className="rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">当前模式</p><strong className="mt-1 block text-lg">{state.settings.mode === 'term' ? '学期' : '假日'}</strong></div></div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-[var(--card-border)] px-4 pt-2 sm:px-6" aria-label="日程视图">{([['today', 'today', '今日'], ['week', 'calendar_view_week', '周课表'], ['settings', 'tune', '设置']] as const).map(([key, icon, label]) => <button key={key} type="button" onClick={() => setView(key)} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${view === key ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}><span className="material-icons-round text-lg">{icon}</span>{label}</button>)}</nav>
      </header>

      {view !== 'settings' && <div className="mt-5 flex items-center justify-between rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2"><button type="button" onClick={() => navigateDate(view === 'week' ? -7 : -1)} aria-label="上一日期" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span className="material-icons-round">chevron_left</span></button><button type="button" onClick={() => setSelectedDate(todayKey)} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10">{selectedDate === todayKey ? formatShortDate(selected) : '回到今天'}</button><button type="button" onClick={() => navigateDate(view === 'week' ? 7 : 1)} aria-label="下一日期" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span className="material-icons-round">chevron_right</span></button></div>}

      {view === 'today' && <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
        <section className="min-w-0"><div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Today</p><h2 className="mt-1 text-xl font-semibold">今天要完成</h2></div><span className="text-sm text-[var(--muted-foreground)]">{tasks.length} 项</span></div>{!state.timetable && !state.manualTasks.length ? <EmptyState onImport={() => setImportDialog(true)} /> : <TaskList tasks={tasks} onComplete={completeTask} onDelete={deleteTask} />}</section>
        <aside className="min-w-0"><div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Timeline</p><h2 className="mt-1 text-xl font-semibold">今日课表</h2></div>{state.timetable && <span className="max-w-40 truncate rounded-full bg-black/5 px-3 py-1.5 text-xs text-[var(--muted-foreground)] dark:bg-white/10">{state.timetable.name}</span>}</div>{state.settings.mode === 'holiday' ? <div className="mt-6 rounded-2xl bg-amber-50 p-5 text-sm leading-6 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><span className="material-icons-round mr-2 align-middle">beach_access</span>假日模式已暂停课程表、每日课程复习和自动预习。已到期的间隔复习与手动任务仍会保留。</div> : todaySessions.length ? <div className="relative mt-6 space-y-1 before:absolute before:bottom-3 before:left-[4.4rem] before:top-3 before:w-px before:bg-[var(--card-border)]">{todaySessions.map((session, index) => { const active = activeSession === session; return <div key={`${session.course.id}-${session.day}-${session.start}-${index}`} className={`relative grid grid-cols-[3.4rem_1.5rem_minmax(0,1fr)] items-start gap-2 rounded-2xl p-2.5 ${active ? 'bg-blue-50 dark:bg-blue-950/40' : ''}`}><div className="pt-1 text-right font-mono text-xs font-semibold"><span>{session.start}</span><span className="mt-1 block text-[10px] font-normal text-[var(--muted-foreground)]">{session.end}</span></div><div className="relative z-10 mt-1.5 grid h-4 w-4 place-items-center rounded-full border-4 border-[var(--card)]" style={{ backgroundColor: session.course.color }}>{active && <span className="absolute h-6 w-6 animate-ping rounded-full opacity-20" style={{ backgroundColor: session.course.color }} />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{session.course.shortName ?? session.course.name}</p>{active && <span className="rounded-full bg-[var(--brand)] px-2 py-0.5 text-[10px] font-semibold text-white dark:text-[#202124]">正在上课</span>}</div>{(session.location || session.teacher) && <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{[session.location, session.teacher].filter(Boolean).join(' · ')}</p>}</div></div>; })}</div> : <div className="mt-6 rounded-2xl border border-dashed border-[var(--card-border)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">这一天没有课程。</div>}{(activeSession || nextSession) && state.settings.mode === 'term' && <div className="mt-5 rounded-2xl bg-[#202124] p-4 text-white"><p className="text-[11px] uppercase tracking-[.12em] text-white/60">{activeSession ? 'Now' : 'Next'}</p><p className="mt-1 font-semibold">{(activeSession ?? nextSession)?.course.shortName ?? (activeSession ?? nextSession)?.course.name}</p><p className="mt-1 text-xs text-white/65">{activeSession ? `${activeSession.end} 下课` : `${nextSession?.start} 开始`}</p></div>}</div>
          <div className="mt-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5"><h2 className="font-semibold">StudyGuide 提醒</h2><div className="mt-3 space-y-3 text-sm leading-6 text-[var(--muted-foreground)]"><p><span className="mr-2 font-semibold text-[var(--brand)]">每日</span>下一日 Cue Recall，再按 √ / △ / ○ 分流。</p><p><span className="mr-2 font-semibold text-amber-600">周末</span>只验证本周 Cue、△ / ○、重复错误和精选难题。</p><p><span className="mr-2 font-semibold text-emerald-600">原则</span>AI 可以协助导入，但不会替你改课表或决定日程。</p></div><Link href="/study-guide" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--brand)]">打开 StudyGuide<span className="material-icons-round text-base">arrow_forward</span></Link></div>
        </aside>
      </div>}

      {view === 'week' && <section className="mt-5 overflow-x-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] p-5"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Week</p><h2 className="mt-1 text-xl font-semibold">{formatShortDate(week[0])} — {formatShortDate(week[6])}</h2></div><p className="text-sm text-[var(--muted-foreground)]">点击日期查看当天任务</p></div>{!state.timetable ? <div className="p-5"><EmptyState onImport={() => setImportDialog(true)} /></div> : <div className="grid min-w-[840px] grid-cols-7 divide-x divide-[var(--card-border)] overflow-x-auto">{week.map((day, index) => { const daySessions = state.settings.mode === 'term' ? sessionsForDate(state.timetable, day) : []; const key = dateKey(day); return <button key={key} type="button" onClick={() => { setSelectedDate(key); setView('today'); }} className={`min-h-[520px] p-3 text-left hover:bg-black/[.02] dark:hover:bg-white/[.03] ${key === todayKey ? 'bg-blue-50/70 dark:bg-blue-950/20' : ''}`}><div className="text-center"><p className={`text-xs font-semibold ${key === todayKey ? 'text-[var(--brand)]' : 'text-[var(--muted-foreground)]'}`}>周{WEEKDAY_LABELS[index]}</p><span className={`mt-1 inline-grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${key === todayKey ? 'bg-[var(--brand)] text-white dark:text-[#202124]' : ''}`}>{day.getDate()}</span></div><div className="mt-4 space-y-2">{daySessions.map((session, sessionIndex) => <div key={`${session.course.id}-${session.start}-${sessionIndex}`} className="rounded-xl border-l-4 bg-black/[.035] p-2.5 dark:bg-white/[.06]" style={{ borderLeftColor: session.course.color }}><p className="text-[11px] font-semibold">{session.start}–{session.end}</p><p className="mt-1 line-clamp-2 text-xs font-medium leading-5">{session.course.shortName ?? session.course.name}</p>{session.location && <p className="mt-1 truncate text-[10px] text-[var(--muted-foreground)]">{session.location}</p>}</div>)}{!daySessions.length && <p className="pt-8 text-center text-xs text-[var(--muted-foreground)]">{state.settings.mode === 'holiday' ? '假日模式' : '无课程'}</p>}</div></button>; })}</div>}</section>}

      {view === 'settings' && <div className="mt-5 grid gap-5 lg:grid-cols-2"><section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Mode</p><h2 className="mt-1 text-xl font-semibold">运行模式</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setState((current) => ({ ...current, settings: { ...current.settings, mode: 'term' } }))} aria-pressed={state.settings.mode === 'term'} className={`rounded-2xl border p-4 text-left ${state.settings.mode === 'term' ? 'border-[var(--brand)] bg-blue-50 dark:bg-blue-950/30' : 'border-[var(--card-border)]'}`}><span className="material-icons-round text-[var(--brand)]">school</span><strong className="ml-2">学期模式</strong><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">显示课程，并生成已选科目的每日复习和周末集中复习。</p></button><button type="button" onClick={() => setState((current) => ({ ...current, settings: { ...current.settings, mode: 'holiday' } }))} aria-pressed={state.settings.mode === 'holiday'} className={`rounded-2xl border p-4 text-left ${state.settings.mode === 'holiday' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-[var(--card-border)]'}`}><span className="material-icons-round text-amber-600">beach_access</span><strong className="ml-2">假日模式</strong><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">暂停课程相关自动任务，保留到期复习、专项、考试和待办。</p></button></div><div className="mt-5 space-y-4 border-t border-[var(--card-border)] pt-5"><label className="flex items-center justify-between gap-4"><span><strong className="text-sm">可选预习提示（默认关闭）</strong><span className="mt-1 block text-xs text-[var(--muted-foreground)]">只有你主动开启时才会自动生成；也可在“添加任务”中单独添加预习。</span></span><input type="checkbox" checked={state.settings.previewEnabled} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, previewEnabled: event.target.checked, previewPreferenceSet: true } }))} className="h-5 w-5 accent-[var(--brand)]" /></label><label className="flex items-center justify-between gap-4"><span><strong className="text-sm">周末集中复习日</strong><span className="mt-1 block text-xs text-[var(--muted-foreground)]">每周只生成一次集中复习。</span></span><select value={state.settings.weekendReviewDay} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, weekendReviewDay: Number(event.target.value) as 6 | 7 } }))} className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value={6}>周六</option><option value={7}>周日</option></select></label></div></section>
        <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Timetable</p><div className="flex items-start justify-between gap-3"><div><h2 className="mt-1 text-xl font-semibold">课表与隐私</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">当前控制台数据保存在浏览器 localStorage。代码库中不包含你的姓名、学校、教师、教室或真实课程。</p></div><span className="material-icons-round text-emerald-600">lock</span></div><div className="mt-5 rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><p className="font-semibold">{state.timetable?.name ?? '尚未导入课表'}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{state.timetable ? `${state.timetable.courses.length} 门课程 · ${state.timetable.courses.reduce((total, course) => total + course.sessions.length, 0)} 个时段` : '导入后可单独选择哪些科目需要课程复习。'}</p></div><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => setImportDialog(true)} className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white dark:text-[#202124]">导入或替换</button><Link href="/timetable-hub" className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">高级排程编辑器</Link><Link href="/control/focus" className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">旧版专注执行</Link></div>{state.timetable && <div className="mt-5 border-t border-[var(--card-border)] pt-5"><p className="text-sm font-semibold">生成每日复习的科目</p><div className="mt-3 space-y-2">{state.timetable.courses.map((course) => <label key={course.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-black/[.025] dark:hover:bg-white/[.04]"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: course.color }} /><span className="min-w-0 flex-1 truncate text-sm">{course.name}</span><input type="checkbox" checked={course.review} onChange={(event) => setState((current) => current.timetable ? { ...current, timetable: { ...current.timetable, courses: current.timetable.courses.map((item) => item.id === course.id ? { ...item, review: event.target.checked } : item) } } : current)} className="h-5 w-5 accent-[var(--brand)]" /></label>)}</div></div>}</section>
      </div>}

      {reviewTask && <ReviewDialog task={reviewTask} onClose={() => setReviewTask(null)} onComplete={(status, note) => { setState((current) => completeReview(current, reviewTask, status, note, new Date())); setReviewTask(null); setNotice(status === 'stable' ? '已记录为 √，并安排下一次复习。' : '已记录状态，明天会再次提醒。'); }} />}
      {taskDialog && <TaskDialog date={selectedDate} onClose={() => setTaskDialog(false)} onSave={(task) => { setState((current) => ({ ...current, manualTasks: [...current.manualTasks, task] })); setTaskDialog(false); setNotice('任务已添加。'); }} />}
      {importDialog && <ImportDialog onClose={() => setImportDialog(false)} onApply={(timetable) => { setState((current) => ({ ...current, timetable, importedAt: new Date().toISOString() })); setImportDialog(false); setNotice('课表已导入，只保存在你的浏览器中。'); }} />}
      <Notice message={notice} />
    </div>
  );
}
