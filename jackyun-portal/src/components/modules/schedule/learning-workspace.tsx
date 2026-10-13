'use client';
import { isCueMasteryPaused } from '@/lib/learning/schedule-control';

import { siteConfirm } from '@/lib/site-dialog';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CueGamePanel from './cue-game-panel';
import type { CueGameAccount, CueShopAction } from '@/lib/learning/cue-shop';
import type { CueStarFeedback } from '@/lib/learning/cue-game';
import deviceStyles from './learning-device.module.css';
import universeStyles from './cue-game-layout.module.css';
import { useCueUniverseEnabled, useCueStudyPreferences } from './use-cue-study-preferences';
import { CueDifficultyPicker } from './learning-assistant';
import type { CueDifficulty } from '@/lib/learning/learning-assistance';
import MarkdownRenderer from '@/components/modules/markdown-renderer';
import { cueMatchesStatusFilter, dateKey, type CueReview, type CueStatusFilter, type LearningCatalogSubject, type LearningRecord, type LearningStatus, type StudyCue } from '@/lib/learning/schedule-control';
import {
  buildStudyQueue, checkQuestionAnswer, emptyResponse, itemKey, questionMatchesFilter,
  type QuestionBankState, type QuestionFilter, type QuestionResponse, type StudyDraft, type StudyItemRef, type StudyMode, type StudyQuestion,
} from '@/lib/learning/question-bank';
import { QuestionImages, questionSourceLabels, questionTypeLabels, studyButtonClass, studyInputClass, studyStatusMark } from './question-bank-manager';

import { DEFAULT_STUDY_FILTER, selectJointCues, type JointCueSelection } from '@/lib/learning/joint-cue-study';

const modes: Record<StudyMode, string> = { cue: '知识 CUE', question: '题目', mixed: '统一学习' };
const filters = { all: '全部', unreviewed: '未学习 / 已修改', due: '今天到期', weak: '△ / ○', partial: '仅 △', unclear: '仅 ○', stable: '仅 √', 'repeated-weak': '近期反复失误' };
export function estimatedStudyMinutes(items: StudyItemRef[]): number { return items.reduce((total, item) => total + (item.kind === 'cue' ? 4 : 8), 0); }

export default function LearningWorkspace({ cues, reviews, bank, catalog, onStart, onResume, onDiscard, onManage }: { cues: StudyCue[]; reviews: CueReview[]; bank: QuestionBankState; catalog: LearningCatalogSubject[]; onStart: (mode: StudyMode, subjectId: string, unit: string, items: StudyItemRef[], sourceTask?: undefined, shuffled?: boolean) => void; onResume: (id: string) => void; onDiscard: (id: string) => void; onManage: () => void }) {
  const { cueShuffle } = useCueStudyPreferences();
  const [shuffleOverride, setShuffleOverride] = useState<boolean | null>(null);
  const shuffled = shuffleOverride ?? cueShuffle;
  const [joint, setJoint] = useState(false);
  const [jointSelection, setJointSelection] = useState<JointCueSelection>({});
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [unit, setUnit] = useState('');
  const [mode, setMode] = useState<StudyMode>('question');
  const [filter, setFilter] = useState<QuestionFilter | 'unstable' | 'recovering'>(DEFAULT_STUDY_FILTER);
  const [excluded, setExcluded] = useState<string[]>([]);
  const date = dateKey(new Date());
  const subjects = [...new Map([...catalog.map((item) => [item.id, item.name] as const), ...cues.map((item) => [item.subjectId, item.subjectName] as const), ...bank.questions.map((item) => [item.subjectId, item.subjectName] as const)]).entries()];
  const scopedCues = joint ? selectJointCues(cues, jointSelection, filter as CueStatusFilter, date, reviews) : cues.filter((cue) => cue.subjectId === subjectId && (!unit || cue.unit === unit));
  const scopedQuestions = bank.questions.filter((question) => question.subjectId === subjectId && (!unit || question.unit === unit));
  const selectedCues = mode === 'question' ? [] : (joint ? scopedCues : scopedCues.filter((cue) => (!cue.lastReviewedAt || dateKey(new Date(cue.lastReviewedAt)) < date || Date.parse(cue.updatedAt) > Date.parse(cue.lastReviewedAt)) && cueMatchesStatusFilter(cue, filter as CueStatusFilter, date, reviews.filter((review) => review.cueId === cue.id)))).filter(cue => !isCueMasteryPaused(cue, date));
  const selectedQuestions = mode === 'cue' ? [] : scopedQuestions.filter((question) => questionMatchesFilter(question, bank, filter === 'unstable' || filter === 'recovering' ? 'weak' : filter, date));
  const preview = buildStudyQueue(selectedCues, selectedQuestions);
  const selectedItems = preview.filter((item) => !excluded.includes(itemKey(item)));
  const units = [...new Set([...cues, ...bank.questions].filter((item) => item.subjectId === subjectId).map((item) => item.unit))];
  const reset = () => setExcluded([]);
  return <section className="mt-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">题目与统一学习</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">题目与统一学习 · 先看各科到期、薄弱和未学内容，再按单元挑选。联合 CUE 可一次选择多个科目与单元。</p></div><button className={studyButtonClass} onClick={onManage}>题库管理</button></div>
    {Object.values(bank.drafts).length > 0 && <div className="space-y-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4"><h3 className="font-semibold">继续未完成的学习</h3>{Object.values(bank.drafts).map((draft) => <div key={draft.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/5 p-3 dark:bg-white/5"><div className="text-sm">{draft.task.subjectName} · {modes[draft.mode]} · 已评价 {Object.keys(draft.assessments).length} / {draft.items.length}</div><div className="flex gap-2"><button className={studyButtonClass} onClick={() => onResume(draft.id)}>继续</button><button className={studyButtonClass} onClick={async () => { if ((await siteConfirm('放弃这次学习进度？已经保存的评价与作答历史会保留。'))) onDiscard(draft.id); }}>放弃进度</button></div></div>)}</div>}
    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-6">
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="学习模式">{Object.entries(modes).map(([value, label]) => <button key={value} aria-pressed={!joint && mode === value} className={`${studyButtonClass} ${!joint && mode === value ? 'bg-[var(--brand)] text-white' : ''}`} onClick={() => { setJoint(false); setMode(value as StudyMode); if (filter === 'unstable' || filter === 'recovering') setFilter(DEFAULT_STUDY_FILTER); reset(); }}>{label}</button>)}<button aria-pressed={joint} className={`${studyButtonClass} ${joint ? 'bg-[var(--brand)] text-white' : ''}`} onClick={() => { setJoint(true); setMode('cue'); reset(); }}>联合 CUE 学习</button></div>
      {joint ? <div className="space-y-3">
        <p className="text-sm text-[var(--muted-foreground)]">多选科目，再展开科目选择单元；每科默认包含全部单元。学习范围应用于所有已选科目。</p>
        <label className="block text-sm">搜索科目<input type="search" aria-label="搜索联合学习科目" className={studyInputClass} value={subjectSearch} onChange={(event) => setSubjectSearch(event.target.value)} placeholder="输入科目名称" /></label>
        <div className="flex flex-wrap items-center gap-2 text-sm"><span>已选 {Object.keys(jointSelection).length} 科</span><button className={studyButtonClass} onClick={() => { setJointSelection(Object.fromEntries(subjects.filter(([id]) => cues.some((cue) => cue.subjectId === id)).map(([id]) => [id, []]))); reset(); }}>选择全部有 CUE 的科目</button><button className={studyButtonClass} onClick={() => { setJointSelection({}); reset(); }}>清空选择</button></div>
        <div className="max-h-[420px] space-y-2 overflow-y-auto">{subjects.filter(([, name]) => name.toLocaleLowerCase().includes(subjectSearch.trim().toLocaleLowerCase())).map(([id, name]) => {
          const subjectCues = cues.filter((cue) => cue.subjectId === id);
          const unitNames = [...new Set(subjectCues.map((cue) => cue.unit))];
          const selectedUnits = jointSelection[id];
          const selected = selectedUnits !== undefined;
          const matchingCount = selectJointCues(subjectCues, { [id]: selectedUnits ?? [] }, filter as CueStatusFilter, date, reviews).length;
          const changeUnits = (values: string[]) => { setJointSelection((current) => ({ ...current, [id]: values })); reset(); };
          return <div key={id} className={`rounded-xl border p-3 ${selected ? 'border-[var(--brand)]' : 'border-[var(--card-border)]'}`}>
            <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-4 w-4" checked={selected} disabled={!subjectCues.length} onChange={(event) => { setJointSelection((current) => { const next = { ...current }; if (event.target.checked) next[id] = []; else delete next[id]; return next; }); reset(); }} /><span className="min-w-0 flex-1 break-words font-semibold">{name}</span><span className="shrink-0 text-xs text-[var(--muted-foreground)]">{matchingCount} 条可学 / {subjectCues.length} 条</span></label>
            {selected && <details><summary className="min-h-11 cursor-pointer py-3 text-sm">选择单元 · {selectedUnits.length ? `已选 ${selectedUnits.length} 个` : '全部单元'}</summary><div className="max-h-60 space-y-1 overflow-y-auto"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={!selectedUnits.length} onChange={() => changeUnits([])} />全部单元</label>{unitNames.map((value) => <label key={value} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={!selectedUnits.length || selectedUnits.includes(value)} onChange={(event) => { const current = selectedUnits.length ? selectedUnits : unitNames; const next = event.target.checked ? [...new Set([...current, value])] : current.filter((unit) => unit !== value); if (!next.length) { setJointSelection((selection) => { const nextSelection = { ...selection }; delete nextSelection[id]; return nextSelection; }); reset(); } else changeUnits(next.length === unitNames.length ? [] : next); }} /><span className="break-words">{value || '未分单元'}</span></label>)}</div><p className="mt-2 text-xs text-[var(--muted-foreground)]">取消最后一个单元会取消选择该科目。</p></details>}
          </div>;
        })}</div>
      </div> : <><div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{subjects.map(([id, name]) => {
        const questions = bank.questions.filter((item) => item.subjectId === id);
        const cueItems = cues.filter((item) => item.subjectId === id);
        const dueQuestions = questions.filter((item) => questionMatchesFilter(item, bank, 'due', date)).length;
        const dueCues = cueItems.filter((item) => cueMatchesStatusFilter(item, 'due', date, reviews.filter((review) => review.cueId === item.id))).length;
        return <button key={id} aria-pressed={id === subjectId} className={`rounded-2xl border p-4 text-left ${id === subjectId ? 'border-[var(--brand)] bg-blue-50/60 dark:bg-blue-950/30' : 'border-[var(--card-border)]'}`} onClick={() => { setSubjectId(id); setUnit(''); reset(); }}><strong>{name}</strong><p className="mt-2 text-sm">到期：{dueCues} 条 CUE · {dueQuestions} 题</p><p className="mt-2 text-xs text-[var(--muted-foreground)]">题目 {questions.length} · 薄弱 {questions.filter((item) => questionMatchesFilter(item, bank, 'weak', date)).length} · 未练习 {questions.filter((item) => questionMatchesFilter(item, bank, 'unreviewed', date)).length}</p></button>;
      })}</div>
      <div className="grid gap-3 sm:grid-cols-2"><label>科目<select aria-label="学习科目" className={studyInputClass} value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setUnit(''); reset(); }}><option value="">请选择科目</option>{subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>单元<select aria-label="学习单元" className={studyInputClass} value={unit} onChange={(event) => { setUnit(event.target.value); reset(); }}><option value="">全部单元</option>{units.map((value) => <option key={value}>{value}</option>)}</select></label></div>
      </> }
      <label className="mt-4 block">学习范围<select aria-label="学习内容筛选" className={studyInputClass} value={filter} onChange={(event) => { setFilter(event.target.value as typeof filter); reset(); }}>{Object.entries(filters).map(([value, label]) => <option key={value} value={value}>{label}</option>)}{mode === 'cue' && <><option value="unstable">历史不稳定项</option><option value="recovering">刚转绿待巩固</option></>}</select></label>
      {mode === 'cue' && <label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={shuffled} onChange={(event) => setShuffleOverride(event.target.checked)} />乱序学习 · 关闭后按原顺序</label>}
      {mode === 'mixed' && <p className="mt-3 text-sm text-[var(--muted-foreground)]">按知识关联排列：知识 CUE → 相关题目。关联仅组织已选内容，不自动加入额外 CUE。</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm">已选 {selectedItems.filter((item) => item.kind === 'cue').length} 条 CUE、{selectedItems.filter((item) => item.kind === 'question').length} 题 · 预计 {estimatedStudyMinutes(selectedItems)} 分钟</p><button disabled={!selectedItems.length} className={`${studyButtonClass} bg-[var(--brand)] text-white`} onClick={() => onStart(mode, joint ? '' : subjectId, joint ? '' : unit, selectedItems, undefined, shuffled)}>开始学习</button></div>
      <div className="mt-4 max-h-[480px] space-y-2 overflow-y-auto">{preview.map((item) => { const content = item.kind === 'cue' ? cues.find((cue) => cue.id === item.id) : bank.questions.find((question) => question.id === item.id); return <label key={itemKey(item)} className="flex items-start gap-3 rounded-xl border border-[var(--card-border)] p-3"><input type="checkbox" className="mt-1 h-4 w-4" checked={!excluded.includes(itemKey(item))} onChange={(event) => setExcluded((current) => event.target.checked ? current.filter((key) => key !== itemKey(item)) : [...current, itemKey(item)])} /><div className="min-w-0"><p className="mb-1 text-xs text-[var(--muted-foreground)]">{item.kind === 'cue' ? '知识 CUE' : `题目 ${(content as StudyQuestion)?.code ?? ''}`} · {content?.subjectName} · {content?.unit || '未分单元'}</p><MarkdownRenderer content={content?.prompt ?? ''} /></div></label>; })}{!preview.length && <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">{(joint ? Object.keys(jointSelection).length > 0 : subjectId) ? '当前筛选下没有内容，可切换到“全部”或添加内容。' : '先选择科目，再查看本次学习内容。'}</p>}</div>
    </div>
  </section>;
}

export function LearningSession({ draft, cues, bank, onDraft, onRate, onMemo, memos, onDifficulty, reviews, starRecords, gameAccount, onShopAction, onClose, onComplete }: { gameAccount?: CueGameAccount; onShopAction?: (action: CueShopAction)=>void; starRecords: LearningRecord[]; reviews: CueReview[]; onDifficulty: (id: string, difficulty?: CueDifficulty) => void; draft: StudyDraft; cues: StudyCue[]; bank: QuestionBankState; onDraft: (draft: StudyDraft) => void; onRate: (draft: StudyDraft, item: StudyItemRef, status: LearningStatus) => void; onMemo: (cueId: string, content: string) => void; memos: Array<{ cueId: string; content: string }>; onClose: () => void; onComplete: (draft: StudyDraft) => Promise<void> }) {
  const cueGameEnabled = useCueUniverseEnabled();
  const [starFeedback, setStarFeedback] = useState<CueStarFeedback>();
  const rootRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [linkedPreviewId, setLinkedPreviewId] = useState('');
  const index = Math.min(draft.index, Math.max(0, draft.items.length - 1));
  const item = draft.items[index];
  const key = item ? itemKey(item) : '';
  const cue = item?.kind === 'cue' ? cues.find((cue) => cue.id === item.id) : undefined;
  const liveQuestion = item?.kind === 'question' ? bank.questions.find((question) => question.id === item.id) : undefined;
  const savedAttempt = item?.kind === 'question' ? bank.attempts.find((attempt) => attempt.sessionId === draft.id && attempt.questionId === item.id) : undefined;
  const question: StudyQuestion | undefined = savedAttempt?.snapshot ?? draft.questionSnapshots?.[key] ?? liveQuestion;
  const response = draft.responses[key] ?? emptyResponse();
  const revealed = Boolean(draft.revealed[key]);
  const currentStatus = draft.assessments[key];
  const content = cue ?? question;
  const assessedCount = draft.items.filter((ref) => draft.assessments[itemKey(ref)]).length;
  const update = (changes: Partial<StudyDraft>) => onDraft({ ...draft, ...changes, updatedAt: new Date().toISOString() });
  const updateResponse = (changes: Partial<QuestionResponse>) => update({ responses: { ...draft.responses, [key]: { ...response, ...changes } } });
  const move = (offset: number) => { setLinkedPreviewId(''); setError(''); update({ index: Math.max(0, Math.min(draft.items.length - 1, index + offset)) }); };
  const rate = (status: LearningStatus) => { if (!item) return; try { onRate(draft, item, status); if (item.kind === 'cue') setStarFeedback((previous) => ({ id: (previous?.id ?? 0) + 1, cueId: item.id, status })); setError(''); } catch (error) { setError(error instanceof Error ? error.message : '保存失败。'); } };
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const shell = document.querySelector<HTMLElement>('[data-portal-shell]');
    const previousInert = shell?.inert ?? false;
    if (shell) shell.inert = true;
    document.body.style.overflow = 'hidden';
    rootRef.current?.focus();
    return () => { if (shell) shell.inert = previousInert; document.body.style.overflow = previousOverflow; if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, []);
  const correct = question ? checkQuestionAnswer(question, response) : null;
  const linkedCue = cues.find((cue) => cue.id === linkedPreviewId);
  return createPortal(<div ref={rootRef} role="dialog" aria-modal="true" aria-label="学习会话" tabIndex={-1} data-responsive-study data-cue-universe={cueGameEnabled && draft.items.some((item) => item.kind === 'cue')} className={`${deviceStyles.session} ${universeStyles.session} fixed inset-0 z-[100] flex flex-col bg-[var(--background)] outline-none`} onKeyDown={(event) => {
    if (event.key === 'Escape') { onClose(); return; }
    if (event.key === 'Tab') {
      const focusable = [...(rootRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select, summary, [tabindex="0"]') ?? [])].filter((element) => element.getClientRects().length > 0);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === rootRef.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === rootRef.current)) { event.preventDefault(); first?.focus(); }
    }
    if ((event.target as HTMLElement).closest('input, textarea, select, button, summary')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
  }}>
    <header className="shrink-0 border-b border-[var(--card-border)] px-4 py-3"><div className="mx-auto flex max-w-4xl items-center justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-semibold">{draft.task.subjectName} · {modes[draft.mode]}</h2><p className="text-xs text-[var(--muted-foreground)]">{draft.items.length ? index + 1 : 0} / {draft.items.length} · 已评价 {assessedCount} 项 · 进度自动保存</p></div><button className={studyButtonClass} onClick={onClose}>退出并保存</button></div></header>
      {cueGameEnabled && draft.items.some((item) => item.kind === 'cue') && <CueGamePanel compact account={gameAccount} onShopAction={onShopAction} sessionKey={draft.id} sessionCount={draft.items.filter(item=>item.kind==='cue'&&draft.assessments[itemKey(item)]).length} reviews={reviews} cues={cues} records={starRecords} feedback={starFeedback} />}
    <main data-cue-study-content className="min-h-0 flex-1 overflow-y-auto px-4 py-5"><div className="mx-auto max-w-4xl space-y-4">
      {!content && <p className="rounded-xl border border-[var(--card-border)] p-6">队列中的内容已移除。退出后重新选择学习内容。</p>}
      {content && <><div className="flex flex-wrap items-center gap-2 text-sm"><span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">{cue ? '知识 CUE' : questionTypeLabels[question!.type]}</span><span>{content.subjectName} · {content.unit}{content.subsection ? ` / ${content.subsection}` : ''}</span><span className="text-[var(--muted-foreground)]">历史状态 {studyStatusMark(cue?.status ?? (question ? bank.reviews[question.id]?.status : undefined))}</span>{question && <span className="text-[var(--muted-foreground)]">{question.code} · {questionSourceLabels[question.sourceKind ?? 'other']} · {question.source} {question.number} · v{question.version}</span>}</div>
      <article className="min-w-0 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-6"><MarkdownRenderer content={content.prompt} />{question && <QuestionImages question={question} placement="prompt" />}{cue?.subtitle && <div className="mt-3 text-sm text-[var(--muted-foreground)]"><MarkdownRenderer content={cue.subtitle} /></div>}</article>
      {question && <div className="space-y-3 rounded-2xl border border-[var(--card-border)] p-4"><label className="flex items-center gap-2"><input type="checkbox" checked={response.paper} disabled={response.submitted} onChange={(event) => updateResponse({ paper: event.target.checked })} />已在纸上作答</label>{!response.paper && (question.type === 'written' ? <label className="block">我的作答<textarea aria-label="我的作答" rows={6} disabled={response.submitted} className={studyInputClass} value={response.text} onChange={(event) => updateResponse({ text: event.target.value })} /></label> : <fieldset className="space-y-2"><legend className="mb-2 text-sm">{question.type === 'multiple' ? '选择全部符合的选项' : '选择一个选项'}</legend>{question.choices.map((choice, choiceIndex) => <label key={choiceIndex} className="flex items-start gap-3 rounded-xl border border-[var(--card-border)] p-3"><input type={question.type === 'multiple' ? 'checkbox' : 'radio'} name={`answer-${question.id}`} className="mt-1" disabled={response.submitted} checked={response.selectedChoices.includes(choiceIndex)} onChange={(event) => updateResponse({ selectedChoices: question.type === 'multiple' ? event.target.checked ? [...response.selectedChoices, choiceIndex] : response.selectedChoices.filter((value) => value !== choiceIndex) : [choiceIndex] })} /><div className="min-w-0"><span className="text-xs">{String.fromCharCode(65 + choiceIndex)}</span><MarkdownRenderer content={choice} /></div></label>)}</fieldset>)}{!response.submitted && <button className={`${studyButtonClass} bg-[var(--brand)] text-white`} onClick={() => { update({ responses: { ...draft.responses, [key]: { ...response, submitted: true } }, revealed: { ...draft.revealed, [key]: true }, questionSnapshots: { ...draft.questionSnapshots, [key]: structuredClone(question) } }); }}>提交作答并查看答案</button>}{response.submitted && <p role="status" className="font-semibold">{correct === null ? '待自评：对照答案和评分点判断' : correct ? '答案核对：答对' : '答案核对：答错'} · 掌握评价单独记录</p>}</div>}
      {cue?.choices && <fieldset className="space-y-2"><legend className="text-sm">知识 CUE 选项</legend>{cue.choices.map((choice, index) => <label key={index} className="flex items-start gap-3 rounded-xl border border-[var(--card-border)] p-3"><input type="radio" className="mt-1" name={`cue-choice-${cue.id}`} checked={response.selectedChoices.includes(index)} onChange={() => updateResponse({ selectedChoices: [index] })} /><div className="min-w-0"><MarkdownRenderer content={choice} /></div></label>)}{revealed && response.selectedChoices.length > 0 && cue.correctChoice !== undefined && <p className="text-sm">{response.selectedChoices[0] === cue.correctChoice ? '选项核对：正确' : '选项核对：请检查参考答案'} · 掌握状态由你评价</p>}</fieldset>}
      {cue && !revealed && <button className={studyButtonClass} onClick={() => update({ revealed: { ...draft.revealed, [key]: true } })}>查看参考答案</button>}
      {revealed && <section className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-6"><h3 className="font-semibold">参考答案</h3>{question && <QuestionImages question={question} placement="answer" />}{question?.correctChoices.length ? <div><p className="text-sm font-semibold">正确选项：{question.correctChoices.map((index) => String.fromCharCode(65 + index)).join('、')}</p>{question.correctChoices.map((index) => <MarkdownRenderer key={index} content={question.choices[index]} />)}</div> : null}{cue?.choices && <p className="text-sm">{cue.correctChoice !== undefined ? `正确选项：${cue.choices[cue.correctChoice]}` : '未提供正确选项'}</p>}<MarkdownRenderer content={content?.answer || (question?.correctChoices.length || cue?.correctChoice !== undefined ? '' : '尚未提供参考答案，请自行核对。')} />{question?.explanation && <div><h4 className="font-semibold">解析</h4><MarkdownRenderer content={question.explanation} /></div>}{Boolean(content?.markingPoints.length) && <div><h4 className="font-semibold">评分点</h4>{content?.markingPoints.map((point, index) => <MarkdownRenderer key={index} content={`- ${point}`} />)}</div>}</section>}
      {question && response.submitted && <div className="grid gap-3 sm:grid-cols-2"><label>得分（可选）{question.maxScore ? ` / ${question.maxScore}` : ''}<input aria-label="作答得分" type="number" min="0" max={question.maxScore} step="any" className={studyInputClass} value={response.score ?? ''} onChange={(event) => updateResponse({ score: event.target.value === '' ? undefined : Number(event.target.value) })} /></label><label>错因 / 需要修复的问题（可选）<textarea aria-label="错因" rows={2} className={studyInputClass} value={response.issue} onChange={(event) => updateResponse({ issue: event.target.value })} /></label></div>}
      {cue && <CueDifficultyPicker cue={cue} reviews={reviews} onChange={(difficulty) => onDifficulty(cue.id, difficulty)} />}
      {cue && <label className="block text-sm">CUE 备忘录（可选）<textarea rows={3} className={studyInputClass} value={memos.find((memo) => memo.cueId === cue.id)?.content ?? ''} onChange={(event) => onMemo(cue.id, event.target.value)} /></label>}
      {revealed && <div className={deviceStyles.inlineRatings}><p className="mb-2 text-sm">掌握评价：选择后立即保存；修改得分或错因后，可再次点击评价更新记录。</p><div className="grid grid-cols-3 gap-2">{(['stable', 'partial', 'unclear'] as const).map((status) => <button aria-pressed={currentStatus === status} key={status} className={`${studyButtonClass} ${currentStatus === status ? 'ring-2 ring-[var(--brand)]' : ''}`} onClick={() => rate(status)}>{studyStatusMark(status)} {status === 'stable' ? '稳定掌握' : status === 'partial' ? '仍不稳定' : '未掌握'}</button>)}</div></div>}
      {question && question.linkedCueIds.length > 0 && <aside className="space-y-2 rounded-xl border border-[var(--card-border)] p-4"><h3 className="text-sm font-semibold">相关知识 CUE（仅查看，不改变评价）</h3>{correct === false && <p className="text-sm text-[var(--muted-foreground)]">可检查相关知识，再决定是否安排一次独立检索。</p>}<div className="flex flex-wrap gap-2">{question.linkedCueIds.map((id) => { const cue = cues.find((cue) => cue.id === id); return cue ? <button key={id} className={studyButtonClass} onClick={() => setLinkedPreviewId(linkedPreviewId === id ? '' : id)}>{cue.prompt.slice(0, 60)}</button> : <span key={id} className="text-xs text-[var(--muted-foreground)]">关联 CUE 已移除</span>; })}</div>{linkedCue && <div className="rounded-xl bg-black/5 p-3 dark:bg-white/5"><MarkdownRenderer content={linkedCue.prompt} /><MarkdownRenderer content={linkedCue.answer ?? ''} /></div>}</aside>}
      </>}
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <details><summary className="cursor-pointer text-sm">本次学习队列</summary><div className="mt-2 flex flex-wrap gap-2">{draft.items.map((ref, index) => <button key={itemKey(ref)} className={studyButtonClass} onClick={() => update({ index })}>{index + 1} · {ref.kind === 'cue' ? 'CUE' : '题'} · {studyStatusMark(draft.assessments[itemKey(ref)])}</button>)}</div></details>
    </div></main>
    <footer className={`${deviceStyles.footer} shrink-0 border-t border-[var(--card-border)] bg-[var(--card)] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3`}>
{revealed && content && <div className={deviceStyles.touchRatings} role="group" aria-label="触控掌握评价">{(['stable', 'partial', 'unclear'] as const).map((status) => <button aria-pressed={currentStatus === status} key={status} className={`${studyButtonClass} ${currentStatus === status ? 'ring-2 ring-[var(--brand)]' : ''}`} onClick={() => rate(status)}>{studyStatusMark(status)} {status === 'stable' ? '稳定掌握' : status === 'partial' ? '仍不稳定' : '未掌握'}</button>)}</div>}
<div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2"><button disabled={index === 0} className={studyButtonClass} onClick={() => move(-1)}>上一项</button><button disabled={!draft.items.length || assessedCount !== draft.items.length} className={`${studyButtonClass} bg-[var(--brand)] text-white`} onClick={async () => { try { await onComplete(draft); } catch (error) { setError(error instanceof Error ? error.message : '完成失败。'); } }}>完成学习 · {assessedCount}/{draft.items.length}</button><button disabled={index >= draft.items.length - 1} className={studyButtonClass} onClick={() => move(1)}>下一项</button></div></footer>
  </div>, document.body);
}
