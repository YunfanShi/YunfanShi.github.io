'use client';

import { useEffect, useRef, useState } from 'react';
import { parseAiJson, readAiResponseContent } from '@/lib/ai-json';
import { cueContentSignature, cueNeedsAiAnalysis, difficultyFactors, difficultyLabels, effectiveCueDifficulty, learningProfile, parseLearningAdvice, type CueDifficulty } from '@/lib/learning/learning-assistance';
import { dateKey, recalculateLegacyCueSchedules, sessionsForDate, type ScheduleControlState, type StudyCue, type CueReview } from '@/lib/learning/schedule-control';
import { studyButtonClass, studyInputClass } from './question-bank-manager';

export function CueDifficultyPicker({ cue, reviews = [], onChange, compact = true }: { cue: StudyCue; reviews?: CueReview[]; onChange?: (difficulty?: CueDifficulty) => void; compact?: boolean }) {
  const validAi = cue.aiAdvice?.signature === cueContentSignature(cue);
  const effective = effectiveCueDifficulty(cue, reviews);
  const content = <div className="space-y-2 rounded-xl border border-[var(--card-border)] p-3 text-sm">
    <p>系统采用：{difficultyLabels[effective]} · 间隔系数 ×{difficultyFactors[effective].toFixed(2)}</p>
    {onChange && <label className="block">我的评级<select aria-label="修改 CUE 难度" className={studyInputClass} value={cue.userDifficulty ?? ''} onChange={(event) => onChange((event.target.value || undefined) as CueDifficulty | undefined)}><option value="">跟随 AI / 系统</option>{Object.entries(difficultyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
    <p className="text-xs text-[var(--muted-foreground)]">{validAi ? `AI 基础评级：${difficultyLabels[cue.aiAdvice!.difficulty]}。${cue.aiAdvice!.reason}` : '等待后台自动分析；暂用中等或你的评级。'}{cue.userDifficulty ? ` 你的基础评级：${difficultyLabels[cue.userDifficulty]}。` : ''}系统结合实际 √ / △ / ○ 调整；反复失误提高难度，未掌握项优先修复，稳定项按系数延长或缩短间隔，最长 18 天。</p>
    {validAi && <p className="text-xs text-[var(--muted-foreground)]">分析时间：{new Date(cue.aiAdvice!.generatedAt).toLocaleString()}</p>}
    {validAi && cue.aiAdvice?.qualityIssue && <p className="text-xs text-amber-700 dark:text-amber-200">提示质量：{cue.aiAdvice.qualityIssue}</p>}
  </div>;
  return compact ? <details className="text-sm"><summary className="cursor-pointer text-[var(--muted-foreground)]">CUE 信息 · {difficultyLabels[effective]} · 系数 ×{difficultyFactors[effective].toFixed(2)}</summary><div className="mt-2">{content}</div></details> : content;
}

export default function LearningAssistant({ state, signedIn, visible, onChange }: { state: ScheduleControlState; signedIn: boolean; visible: boolean; onChange: (updater: (state: ScheduleControlState) => ScheduleControlState) => void }) {
  const attempted = useRef(new Set<string>());
  const current = useRef(state);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [cueId, setCueId] = useState('');
  const today = dateKey(new Date());
  const analysisKey = (cue: StudyCue, reviews: CueReview[]) => `${cue.id}:${cueContentSignature(cue)}:${reviews.filter((review) => review.cueId === cue.id).map((review) => review.reviewedAt).sort().at(-1) ?? ''}`;
  const contentKey = JSON.stringify(state.cues.map((cue) => [analysisKey(cue, state.cueReviews), cueNeedsAiAnalysis(cue, state.cueReviews)]));
  useEffect(() => { current.current = state; }, [state]);
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const tried = attempted.current;
    const controller = new AbortController();
    let pendingKeys: string[] = [];
    async function run() {
      while (!cancelled) {
        const latest = current.current;
        const candidates = latest.cues.filter((cue) => cueNeedsAiAnalysis(cue, latest.cueReviews) && !tried.has(analysisKey(cue, latest.cueReviews))).slice(0, 10);
        const dailyKey = `daily:${today}`;
        const needsDaily = latest.dailyLearningAdvice?.date !== today && !tried.has(dailyKey);
        if (!candidates.length && !needsDaily) break;
        pendingKeys = candidates.map((cue) => analysisKey(cue, latest.cueReviews));
        if (needsDaily) pendingKeys.push(dailyKey);
        pendingKeys.forEach((key) => tried.add(key));
        setBusy(true);
        try {
          const response = await fetch('/api/llm-proxy', { signal: controller.signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'chat', stream: false, temperature: 0.1, _no_thinking: true, messages: [
            { role: 'system', content: '你只提供学习建议，不能评分、生成任务、删改知识或决定掌握程度。根据用户真实记录辅助评级，用户表现优先。返回严格 JSON {"cues":[{"id":"原始id","difficulty":"easy|medium|hard|extreme","skill":"general|definition|calculate|explain|proof|formula|state","reason":"基于证据的理由","qualityIssue":"可选，题干是否含糊或只给陌生术语、需翻到答案才能作答","suggestedPrompt":"可选，保持原知识目标，不包含答案的可直接作答提示"}],"daily":{"batchLimit":1或2,"reason":"根据真实历史和当前课程量说明"}}。不要编造用户弱项，没有记录则明确无证据。建议提示不能泄露所考公式；数学可以给具体运算检索或明确中文任务。' },
            { role: 'user', content: JSON.stringify({ date: dateKey(new Date()), profile: learningProfile(latest.cues, latest.cueReviews), coursesToday: sessionsForDate(latest.timetable, new Date()).length, pendingManualMinutes: latest.manualTasks.filter((task) => task.date <= today && !latest.completions[task.id] && !latest.cancellations[task.id]).reduce((total, task) => total + task.durationMinutes, 0), recentOutcomes: latest.cueReviews.slice(-50).map(({ status, reviewedAt }) => ({ status, reviewedAt })), cues: candidates.map((cue) => ({ id: cue.id, subject: cue.subjectName, unit: cue.unit, type: cue.type, prompt: cue.prompt, subtitle: cue.subtitle, answer: cue.answer, markingPoints: cue.markingPoints, history: latest.cueReviews.filter((review) => review.cueId === cue.id).slice(-8).map(({ status, reviewedAt, note }) => ({ status, reviewedAt, note })) })) }) },
          ] }) });
          const parsed = parseLearningAdvice(parseAiJson(await readAiResponseContent(response)), candidates, new Date().toISOString());
          if (cancelled) break;
          if (needsDaily && !parsed.daily) throw new Error('AI 未返回当天容量建议。');
          onChange((value) => recalculateLegacyCueSchedules({ ...value, cueScheduleRevision: candidates.length ? 0 : value.cueScheduleRevision, cues: value.cues.map((cue) => parsed.cues[cue.id]?.signature === cueContentSignature(cue) ? { ...cue, aiAdvice: parsed.cues[cue.id] } : cue), dailyLearningAdvice: parsed.daily ? { ...parsed.daily, date: dateKey(new Date()) } : value.dailyLearningAdvice }));
          pendingKeys = [];
          setNotice('');
        } catch (error) { if (!cancelled) pendingKeys = []; if (!cancelled) setNotice(`AI 暂不可用：${error instanceof Error ? error.message : '请求失败'}。继续使用代码规则，可手动重试。`); break; }
      }
      if (!cancelled) setBusy(false);
    }
    const timer = window.setTimeout(() => { void run(); }, 1200);
    return () => { cancelled = true; controller.abort(); pendingKeys.forEach((key) => tried.delete(key)); window.clearTimeout(timer); };
  }, [signedIn, retry, contentKey, today, onChange]);
  const profile = learningProfile(state.cues, state.cueReviews);
  const cue = state.cues.find((item) => item.id === cueId);
  if (!visible) return null;
  return <section className="mt-5 space-y-4 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">学习画像与复习建议</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">按真实检索记录统计，显示学科与题型中的薄弱位置；不是能力定论。稳定项最长 18 天再检索，未掌握项优先修复。</p></div><button disabled={busy || !signedIn} className={studyButtonClass} onClick={() => { attempted.current.clear(); setRetry((value) => value + 1); }}>{busy ? 'AI 评级中…' : '重试待评级 CUE'}</button></div>{!signedIn && <p className="text-sm">登录后自动辅助评级；未登录时使用代码规则和手动难度。</p>}{notice && <p role="status" className="text-sm">{notice}</p>}{state.dailyLearningAdvice && <p className="text-xs">{state.dailyLearningAdvice.date} AI 容量建议：{state.dailyLearningAdvice.batchLimit} 批 · {state.dailyLearningAdvice.reason}（代码仍受课程量上限与到期保护约束）</p>}
    <div className="grid gap-3 sm:grid-cols-2">{profile.map((group) => <div key={`${group.subject}:${group.type}`} className="rounded-xl bg-black/5 p-3 dark:bg-white/5"><div className="flex justify-between gap-2 text-sm"><span>{group.subject} · {group.type.toUpperCase()}</span><span>△ / ○ {group.weak} / {group.attempts} 次</span></div><div role="meter" aria-label={`${group.subject} ${group.type} 薄弱占比`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(group.weak / group.attempts * 100)} className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-200"><div className="h-full bg-amber-500" style={{ width: `${group.weak / group.attempts * 100}%` }} /></div></div>)}</div>{!profile.length && <p className="text-sm text-[var(--muted-foreground)]">完成实际检索后，这里会形成有证据的学习画像。</p>}
    <input aria-label="搜索 CUE 评级" className={studyInputClass} placeholder="搜索需要检查提示或调整难度的 CUE" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="选择 CUE 评级" className={studyInputClass} value={cueId} onChange={(event) => setCueId(event.target.value)}><option value="">选择 CUE 查看难度与质量建议</option>{state.cues.filter((cue) => `${cue.prompt} ${cue.subjectName} ${cue.unit}`.toLowerCase().includes(query.toLowerCase())).slice(0, 100).map((cue) => <option key={cue.id} value={cue.id}>{cue.subjectName} · {cue.prompt}</option>)}</select>{cue && <><CueDifficultyPicker compact={false} cue={cue} reviews={state.cueReviews} onChange={(userDifficulty) => onChange((value) => recalculateLegacyCueSchedules({ ...value, cueScheduleRevision: 0, cues: value.cues.map((item) => item.id === cue.id ? { ...item, userDifficulty } : item) }))} />{cue.aiAdvice?.signature === cueContentSignature(cue) && cue.aiAdvice.suggestedPrompt && <div className="space-y-2 text-sm"><p>建议提示：{cue.aiAdvice.suggestedPrompt}</p><button className={studyButtonClass} onClick={() => onChange((value) => ({ ...value, cues: value.cues.map((item) => item.id === cue.id && item.aiAdvice?.signature === cueContentSignature(item) ? { ...item, prompt: item.aiAdvice.suggestedPrompt!, version: (item.version ?? 1) + 1, updatedAt: new Date().toISOString() } : item) }))}>采用提示修改（保留历史）</button></div>}</>}
  </section>;
}
