import type { ScheduleControlState } from './schedule-control.ts';
import type { PracticeSession, PracticeQuestion } from './practice-timer.ts';
import { firstPracticeOutcome } from './practice-timer.ts';
import { threeWayMerge } from '../sync/merge.ts';
import { canonicalJson } from '../sync/hash.ts';

// One vocabulary for diagnosis and timer annotations. Application is reasoning
// in a specified scenario; no second set of incompatible CS cause labels.
export const ROOT_CAUSES = {
  knowledge: 'Knowledge 知识缺口', recall: 'Recall 提取', interpretation: 'Interpretation 审题',
  condition: 'Condition / Rule 条件', selection: 'Selection 方法选择',
  reasoning: 'Reasoning / Modelling / Application 建模应用', execution: 'Execution / Calculation 执行计算',
  structure: 'Response Structure 答题结构', expression: 'Expression / Marking-point 表达得分点', time: 'Time / Strategy 时间策略',
} as const;
export type RootCause = keyof typeof ROOT_CAUSES;
export const CS_SKILLS = ['Definition Precision', 'State / Give', 'Describe Process', 'Explain Cause and Effect', 'Compare / Contrast', 'Scenario Application', 'Algorithm / Pseudocode', 'Trace / Debug'] as const;
export interface MarkingPointReview {
  id: string; text: string; marks: number; status: 'achieved' | 'missing' | 'uncertain';
  evidence: string; cause?: RootCause;
}
export interface MarkingReview {
  id: string; date: string; score: number; maxMarks: number; source: string;
  points: MarkingPointReview[]; rule: string; method: 'manual';
}
export interface DiagnosisEvent {
  id: string; date: string; kind: 'repair' | 'transfer'; note: string;
  sessionId?: string; questionId?: string; review?: MarkingReview;
}
export interface ExamDiagnosis {
  id: string; subject: string; exam: string; date: string; reference: string; unit: string; subsection: string;
  node: string; causes: RootCause[]; certainty: 'potential' | 'confirmed'; problem: string; target: string;
  score?: number; maxMarks?: number; lostMarks?: number;
  originalAnswer: string; commandWord: string; skill: string;
  cueIds: string[]; bankQuestionId: string; sourceRecordId: string; sourceSessionId: string; sourceQuestionId: string;
  transferDate: string; transferPlan: string; reviews: MarkingReview[]; events: DiagnosisEvent[];
}
const fail = () => { throw Error('诊断格式无效，请检查日期、分值与必填内容；原记录已保留。'); };
const text = (v: unknown, max = 200, required = false): v is string => typeof v === 'string' && v.length <= max && (!required || !!v.trim());
const validDate = (v: unknown): v is string => text(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const marks = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000;
const unique = (items: { id: string }[]) => new Set(items.map(i => i.id)).size === items.length;
export function validateMarkingReview(r: MarkingReview): MarkingReview {
  if (!r || !text(r.id, 150, true) || !validDate(r.date) || !marks(r.score) || !marks(r.maxMarks) || r.maxMarks <= 0 || r.score > r.maxMarks
    || !text(r.source, 500, true) || !text(r.rule, 2000) || r.method !== 'manual' || !Array.isArray(r.points) || r.points.length > 100 || !unique(r.points)) fail();
  for (const p of r.points) if (!p || !text(p.id, 150, true) || !text(p.text, 2000, true) || !marks(p.marks) || p.marks <= 0
    || !['achieved', 'missing', 'uncertain'].includes(p.status) || !text(p.evidence, 2000) || (p.cause !== undefined && !Object.hasOwn(ROOT_CAUSES, p.cause))) fail();
  // Actual score is entered by the human. Point totals are only a capped aid:
  // alternative points / level-of-response rules need judgement, not keywords.
  return structuredClone(r);
}
export function markingSummary(r: MarkingReview) {
  validateMarkingReview(r);
  return { achieved: r.points.filter(p => p.status === 'achieved'), missing: r.points.filter(p => p.status === 'missing'),
    uncertain: r.points.filter(p => p.status === 'uncertain'), pointScore: Math.min(r.maxMarks, r.points.filter(p => p.status === 'achieved').reduce((n,p) => n + p.marks, 0)) };
}
export function emptyDiagnosis(date: string, id: string): ExamDiagnosis {
  return { id, date, subject: 'Pure Math', exam: '', reference: '', unit: '', subsection: '', node: '', causes: [], certainty: 'potential', problem: '', target: '',
    originalAnswer: '', commandWord: '', skill: '', cueIds: [], bankQuestionId: '', sourceRecordId: '', sourceSessionId: '', sourceQuestionId: '', transferDate: '', transferPlan: '', reviews: [], events: [] };
}
export function validateDiagnosis(d: ExamDiagnosis): ExamDiagnosis {
  if (!d || !text(d.id, 150, true) || !validDate(d.date) || !text(d.subject, 100, true) || !text(d.exam, 200, true) || !text(d.reference, 200, true)
    || !text(d.problem, 5000, true) || !text(d.target, 2000, true) || !text(d.originalAnswer, 20000)
    || !['potential', 'confirmed'].includes(d.certainty) || !Array.isArray(d.causes) || d.causes.some(c => !Object.hasOwn(ROOT_CAUSES,c)) || new Set(d.causes).size !== d.causes.length
    || !Array.isArray(d.cueIds) || d.cueIds.length > 100 || d.cueIds.some(id => !text(id,150,true))
    || !['unit','subsection','node','commandWord','skill','bankQuestionId','sourceRecordId','sourceSessionId','sourceQuestionId','transferPlan'].every(k => text(d[k as keyof ExamDiagnosis], k === 'transferPlan' ? 2000 : 200))
    || (d.skill && !CS_SKILLS.includes(d.skill as typeof CS_SKILLS[number])) || (d.transferDate && !validDate(d.transferDate))
    || (d.score !== undefined && !marks(d.score)) || (d.maxMarks !== undefined && (!marks(d.maxMarks) || d.maxMarks <= 0))
    || (d.score !== undefined && (d.maxMarks === undefined || d.score > d.maxMarks)) || (d.lostMarks !== undefined && (!marks(d.lostMarks) || d.maxMarks === undefined || d.lostMarks > d.maxMarks))
    || !Array.isArray(d.reviews) || !unique(d.reviews) || !Array.isArray(d.events) || !unique(d.events)) fail();
  d.reviews.forEach(validateMarkingReview);
  for (const e of d.events) {
    if (!e || !text(e.id,150,true) || !validDate(e.date) || !['repair','transfer'].includes(e.kind) || !text(e.note,5000,true)
      || (e.kind === 'transfer' && (!text(e.sessionId,150,true) || !text(e.questionId,150,true)))) fail();
    if (e.review) validateMarkingReview(e.review);
  }
  return structuredClone(d);
}
export function readDiagnoses(value: unknown): ExamDiagnosis[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail();
  const entries = (value as ExamDiagnosis[]).map(validateDiagnosis);
  if (!unique(entries)) fail();
  return entries;
}
export function saveDiagnosis(state: ScheduleControlState, d: ExamDiagnosis, base?: ExamDiagnosis): ScheduleControlState {
  const next = validateDiagnosis(d);
  const current = (state.examDiagnoses ?? []).find(x => x.id === next.id);
  if (current) {
    if (!base) throw Error('诊断已存在，请重新打开。');
    for (const k of ['originalAnswer','sourceRecordId','sourceSessionId','sourceQuestionId'] as const) if (next[k] !== base[k] && (k!=='originalAnswer' || base.originalAnswer)) throw Error('原始作答与首次来源不可覆盖；请新增诊断。');
    for (const k of ['reviews','events'] as const) for (const original of base[k]) if (canonicalJson(next[k].find(e => e.id === original.id)) !== canonicalJson(original)) throw Error('历史复核与验证不可覆盖；请追加修正。');
    const merged = threeWayMerge(base, next, current);
    if (merged.conflicts.length) throw Error('其他设备修改了同一诊断，请导出当前内容并重新打开；双方内容保留。');
    return { ...state, examDiagnoses: state.examDiagnoses!.map(x => x.id === next.id ? validateDiagnosis(merged.merged as ExamDiagnosis) : x) };
  }
  if (base) throw Error('原诊断已变更，请重新打开。');
  return { ...state, examDiagnoses: [...(state.examDiagnoses ?? []), next] };
}
export function diagnosisFromPractice(state: ScheduleControlState, sessionId: string, questionId: string, id: string): ExamDiagnosis {
  const s = state.practiceSessions?.find(s => s.id === sessionId && s.finished);
  const q = s?.questions.find(q => q.id === questionId);
  if (!s || !q || firstPracticeOutcome(q).result === 'pending') throw Error('请选择已结束且已批改的逐题记录。');
  return { ...emptyDiagnosis(s.date, id), subject: s.subject, exam: s.scope || 'Timed Practice', reference: q.name, unit: q.unit || s.unit || '', subsection: q.subsection || s.subsection || '',
    node: q.node, causes: Object.hasOwn(ROOT_CAUSES,q.cause) ? [q.cause as RootCause] : [], problem: q.cause || '补充已确认的错误事实', target: q.retest || '修复主要卡点，再换一道新题独立验证',
    sourceRecordId: `timer-${s.id}`, sourceSessionId: s.id, sourceQuestionId: q.id };
}
export function transferCandidates(state: ScheduleControlState, d: ExamDiagnosis): { session: PracticeSession; question: PracticeQuestion }[] {
  return (state.practiceSessions ?? []).filter(s => s.finished && s.independent && ['B','homework'].includes(s.source) && s.subject === d.subject && s.date >= d.date)
    .flatMap(session => session.questions.filter(q => firstPracticeOutcome(q).result !== 'pending' && firstPracticeOutcome(q).elapsedMs > 0 && !(session.id === d.sourceSessionId && q.id === d.sourceQuestionId)
      && !d.events.some(e => e.kind === 'transfer' && e.sessionId === session.id && e.questionId === q.id)).map(question => ({session,question})));
}
export function appendDiagnosisEvent(state: ScheduleControlState, base: ExamDiagnosis, event: DiagnosisEvent): ScheduleControlState {
  if (event.kind === 'transfer') {
    const candidate = transferCandidates(state, base).find(c => c.session.id === event.sessionId && c.question.id === event.questionId);
    if (!candidate || event.date !== candidate.session.date || (base.transferDate && event.date < base.transferDate)) throw Error('验证必须关联计划日期之后的另一道独立未见题；熟题和模考不计迁移验证。');
    if (!base.events.some(e => e.kind === 'repair' && e.date <= event.date)) throw Error('请先记录修复说明，再关联修复之后的新题。');
    if (base.skill && !event.review) throw Error('CS 主观题复测需附实际分数与评分点复核。');
  }
  return saveDiagnosis(state, {...base, events: [...base.events,event]}, base);
}
export function diagnosisProgress(state: ScheduleControlState, d: ExamDiagnosis) {
  const transfers = d.events.filter(e => e.kind === 'transfer').flatMap(e => {
    const s = state.practiceSessions?.find(s => s.id === e.sessionId);
    const q = s?.questions.find(q => q.id === e.questionId);
    if (!s || !q || !s.finished || !s.independent || !['B','homework'].includes(s.source) || s.subject !== d.subject || s.date < d.date || s.date !== e.date
      || (s.id === d.sourceSessionId && q.id === d.sourceQuestionId) || !d.events.some(r => r.kind === 'repair' && r.date <= e.date)) return [];
    const first = firstPracticeOutcome(q);
    const completeMarks = !d.skill || Boolean(e.review && e.review.score === e.review.maxMarks && !e.review.points.some(p => p.status === 'uncertain' || p.status === 'missing'));
    const status = first.result === 'correct' && !first.blocked && completeMarks ? (first.elapsedMs > first.limitSeconds * 1000 ? 'speed' : 'verified') : 'repair';
    return [{ id: `${s.id}:${q.id}`, date: s.date, name: q.name, status, cause: q.cause, score: e.review ? `${e.review.score}/${e.review.maxMarks}` : '' }];
  }).filter((e,i,rows) => rows.findIndex(x => x.id === e.id) === i).sort((a,b) => a.date.localeCompare(b.date));
  const last = transfers.at(-1);
  return { transfers, status: last?.status ?? (d.events.some(e => e.kind === 'repair') ? 'awaiting-transfer' : 'observe') };
}
export function diagnosisRecommendations(state: ScheduleControlState) {
  return (state.examDiagnoses ?? []).map(d => {
    const p = diagnosisProgress(state,d);
    const repeated = new Set((state.examDiagnoses ?? []).filter(x => x.subject === d.subject && x.node && x.node === d.node && x.causes.some(c => d.causes.includes(c)) && x.sourceSessionId
      && state.practiceSessions?.some(s => s.id === x.sourceSessionId && s.finished && s.independent && ['B','homework'].includes(s.source) && s.questions.some(q => q.id === x.sourceQuestionId && ['wrong','help'].includes(firstPracticeOutcome(q).result))))
      .map(x => `${x.sourceSessionId}:${x.sourceQuestionId}`));
    const failedTransfers = p.transfers.filter(t => t.status === 'repair');
    failedTransfers.forEach(t => repeated.add(t.id));
    const highGap = d.certainty === 'confirmed' && d.causes.includes('knowledge') && (d.maxMarks ?? 0) >= 6 && (d.maxMarks ?? 0) - (d.score ?? d.maxMarks ?? 0) >= 3;
    return { diagnosis: d, priority: repeated.size >= 2 ? 3 : highGap ? 2 : 1, reason: repeated.size >= 2 ? '多道独立新题再次失分' : highGap ? '已确认的高分值知识缺口' : '单次线索，继续观察', status: p.status,
      action: p.status === 'awaiting-transfer' || p.status === 'speed' ? '换一道新题限时验证' : '解释主要错误并完成针对修复' };
  }).filter(x => x.status !== 'verified').sort((a,b) => b.priority - a.priority || b.diagnosis.date.localeCompare(a.diagnosis.date)).slice(0,2);
}
export function planDiagnosisTransfer(state: ScheduleControlState, d: ExamDiagnosis, id: string): ScheduleControlState {
  if (!d.transferDate || !d.transferPlan.trim()) throw Error('请先保存复测日期和新题目标。');
  const presetId = `diagnosis-transfer-${d.id}`;
  if (state.manualTasks.some(t => t.presetId === presetId && t.date === d.transferDate && !state.cancellations[t.id])) return state;
  return {...state, manualTasks: [...state.manualTasks, {id, date: d.transferDate, presetId, type:'practice', subject:d.subject, durationMinutes:20,
    title:`新题验证 · ${d.node || d.reference}`, note:d.transferPlan, scope:{cueIds:[],questionIds:[]}, guide:{tab:'practice',subTab:'timed'}}]};
}
