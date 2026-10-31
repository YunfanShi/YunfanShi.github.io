import type { ScheduleControlState } from './schedule-control.ts';
import { PRACTICE_CONTENT_TYPES, type PracticeContentType, type TimedPracticeRecord } from './timed-practice.ts';
import { threeWayMerge } from '../sync/merge.ts';

export interface PracticeQuestion {
  id: string; name: string; typeId: string; typeName: string; limitSeconds: number;
  elapsedMs: number; startedAt: number | null; result: 'pending' | 'correct' | 'wrong' | 'help';
  blocked: boolean; node: string; cause: string; retest: string;
  subjectName?: string; courseId?: string; presetFamily?: string;
  unit?: string; subsection?: string;
  firstAttempt?: { result: PracticeQuestion['result']; elapsedMs: number; limitSeconds: number; blocked: boolean };
}
export function firstPracticeOutcome(q: PracticeQuestion) { return q.firstAttempt ?? q; }
export function currentPracticeRecords(state: ScheduleControlState): TimedPracticeRecord[] {
  const sessions=new Map((state.practiceSessions ?? []).filter(s=>s.finished).map(s=>[s.id,s]));
  return (state.timedPracticeRecords ?? []).flatMap(record=>{
    const session=record.id.startsWith('timer-')?sessions.get(timerSessionId(record.id)):undefined;
    if(!session) return [record];
    const evidence=practiceEvidenceRecords(session).find(item=>item.id===record.id);
    return evidence?[evidence]:[];
  });
}
export interface PracticeSession {
  id: string; date: string; subject: string; source: TimedPracticeRecord['source'];
  mixed?: boolean;
  courseId?: string; presetFamily?: string;
  ieltsSection?: 'listening' | 'reading' | 'writing' | 'speaking';
  independent: boolean; scope: string; mode: 'relaxed' | 'normal' | 'exam';
  contentType?: PracticeContentType; questionRange?: string;
  unit?: string; subsection?: string;
  index: number; updatedAt: number; finished: boolean; questions: PracticeQuestion[];
}
export interface PracticeType { id: string; name: string; description: string; seconds: { relaxed: number; normal: number; exam: number } }
export interface PracticeConfig { subjects: Record<string, PracticeType[]>; green: number; red: number; effects?: boolean; sound?: boolean; volume?: number;
  courseBindings?: Record<string, { family: string; name: string; source: 'auto' | 'manual' }>;
  courseTypes?: Record<string, PracticeType[]>;
}
const families = ['math','mechanics','statistics','further','furtherMechanics','furtherStatistics','physics','chemistry','biology','cs','economics','business','history','geography','english','custom','ielts'];
export function validateSession(value: unknown): PracticeSession {
  const s = value as PracticeSession;
  if (s?.ieltsSection !== undefined && (!['listening','reading','writing','speaking'].includes(s.ieltsSection) || s.presetFamily !== 'ielts')) throw Error('雅思板块无效，原记录已保留。');
  if (s && ['unit','subsection'].some(key => s[key as 'unit' | 'subsection'] !== undefined && (typeof s[key as 'unit' | 'subsection'] !== 'string' || s[key as 'unit' | 'subsection']!.length > 200))) throw Error('单元或小节格式无效，原记录已保留。');
  if (s && ((s.contentType !== undefined && !Object.hasOwn(PRACTICE_CONTENT_TYPES, s.contentType)) || (s.questionRange !== undefined && (typeof s.questionRange !== 'string' || s.questionRange.length > 200)))) throw Error('练习内容类型或题号无效，原记录已保留。');
  if (s && ((s.courseId !== undefined && (typeof s.courseId !== 'string' || !s.courseId || s.courseId.length > 150)) || (s.presetFamily !== undefined && !families.includes(s.presetFamily)))) throw Error('课表科目关联无效，原记录已保留。');
  if (!s || typeof s.id !== 'string' || !s.id || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !Number.isFinite(Date.parse(s.date))
    || typeof s.subject !== 'string' || !s.subject.trim() || s.subject.length > 100 || (s.mixed !== undefined && typeof s.mixed !== 'boolean') || typeof s.scope !== 'string' || s.scope.length > 200
    || !['A','B','C','homework'].includes(s.source) || !['relaxed','normal','exam'].includes(s.mode)
    || typeof s.independent !== 'boolean' || typeof s.finished !== 'boolean' || !Number.isFinite(s.updatedAt)
    || !Array.isArray(s.questions) || s.questions.length < 1 || s.questions.length > 300
    || !Number.isInteger(s.index) || s.index < 0 || s.index >= s.questions.length) throw Error('练习记录格式无效，原数据已保留。');
  const ids = new Set<string>();
  for (const q of s.questions) {
    if (q.firstAttempt && (!['correct','wrong','help'].includes(q.firstAttempt.result) || !Number.isFinite(q.firstAttempt.elapsedMs) || q.firstAttempt.elapsedMs < 0 || q.firstAttempt.elapsedMs > 86400000 || !Number.isFinite(q.firstAttempt.limitSeconds) || q.firstAttempt.limitSeconds < 10 || q.firstAttempt.limitSeconds > 86400 || typeof q.firstAttempt.blocked !== 'boolean')) throw Error('首次作答快照无效。');
    if (q && ['unit','subsection'].some(key => q[key as 'unit' | 'subsection'] !== undefined && (typeof q[key as 'unit' | 'subsection'] !== 'string' || q[key as 'unit' | 'subsection']!.length > 200))) throw Error('逐题单元或小节格式无效，原数据已保留。');
    if (q && ((q.subjectName !== undefined && (typeof q.subjectName !== 'string' || !q.subjectName.trim() || q.subjectName.length > 100)) || (q.courseId !== undefined && (typeof q.courseId !== 'string' || !q.courseId || q.courseId.length > 150)) || (q.presetFamily !== undefined && !families.includes(q.presetFamily)))) throw Error('逐题科目关联无效，原记录已保留。');
    if (!q || typeof q.id !== 'string' || !q.id || ids.has(q.id) || !['name','typeId','typeName','node','cause','retest'].every(key => typeof q[key as keyof PracticeQuestion] === 'string' && String(q[key as keyof PracticeQuestion]).length <= 300)
      || !Number.isFinite(q.limitSeconds) || q.limitSeconds < 10 || q.limitSeconds > 86400
      || !Number.isFinite(q.elapsedMs) || q.elapsedMs < 0 || q.elapsedMs > 86400000
      || (q.startedAt !== null && !Number.isFinite(q.startedAt)) || !['pending','correct','wrong','help'].includes(q.result) || typeof q.blocked !== 'boolean') throw Error('逐题数据无效，原数据已保留。');
    ids.add(q.id);
  }
  return structuredClone(s);
}
export function validateConfig(value: unknown): PracticeConfig {
  const c = value as PracticeConfig;
  if (c && ((c.effects !== undefined && typeof c.effects !== 'boolean') || (c.sound !== undefined && typeof c.sound !== 'boolean') || (c.volume !== undefined && (!Number.isFinite(c.volume) || c.volume < 0 || c.volume > 1)))) throw Error('动画、音效或音量设置无效。');
  if (!c || !Number.isFinite(c.green) || !Number.isFinite(c.red) || c.green <= c.red || c.green >= 100 || c.red <= 0 || !c.subjects || typeof c.subjects !== 'object' || Array.isArray(c.subjects)) throw Error('颜色阈值必须满足 0 < 红色 < 黄色 < 100。');
  if (c.courseBindings !== undefined) {
    if (!c.courseBindings || typeof c.courseBindings !== 'object' || Array.isArray(c.courseBindings)) throw Error('课表关联设置无效。');
    for (const [id,binding] of Object.entries(c.courseBindings)) if (!id || id.length > 150 || !binding || !families.includes(binding.family) || typeof binding.name !== 'string' || !binding.name.trim() || binding.name.length > 100 || !['auto','manual'].includes(binding.source)) throw Error('课表科目关联无效。');
  }
  if (c.courseTypes !== undefined && (!c.courseTypes || typeof c.courseTypes !== 'object' || Array.isArray(c.courseTypes))) throw Error('课表题型设置无效。');
  for (const [name, types] of [...Object.entries(c.subjects),...Object.entries(c.courseTypes ?? {})]) {
    if (!name.trim() || name.length > 200 || !Array.isArray(types) || !types.length || types.length > 80) throw Error('科目与题型设置无效。');
    const ids = new Set<string>();
    for (const type of types) {
      if (!type || typeof type.id !== 'string' || !type.id || ids.has(type.id) || typeof type.name !== 'string' || !type.name.trim() || type.name.length > 100 || typeof type.description !== 'string' || type.description.length > 300 || !type.seconds || !['relaxed','normal','exam'].every(mode => Number.isFinite(type.seconds[mode as keyof PracticeType['seconds']]) && type.seconds[mode as keyof PracticeType['seconds']] >= 10 && type.seconds[mode as keyof PracticeType['seconds']] <= 86400)) throw Error('每种题型的三档时间必须为 10 秒至 24 小时。');
      ids.add(type.id);
    }
  }
  return c;
}
/** A derived record keeps weekly metrics and first-attempt evidence together. */
export function timerSessionId(recordId:string):string { return recordId.startsWith('timer-') ? recordId.slice(6).split(':',1)[0] : ''; }
function questionEvidenceKey(q:PracticeQuestion,s:PracticeSession):string {
  return s.mixed ? `${q.courseId ?? ''}|${q.subjectName ?? s.subject}|${q.presetFamily ?? ''}` : `${s.courseId ?? ''}|${s.subject}|${s.presetFamily ?? ''}`;
}
export function practiceEvidenceRecords(s:PracticeSession):TimedPracticeRecord[] {
  const attempted=s.questions.map(q=>({...q,...firstPracticeOutcome(q)})).filter(q=>q.elapsedMs>0&&q.result!=='pending');
  if(!attempted.length)return [];
  const groups=new Map<string,typeof attempted>();
  for(const question of attempted){const key=questionEvidenceKey(question,s);groups.set(key,[...(groups.get(key)??[]),question]);}
  const mixedGroups=s.mixed&&groups.size>1;
  return [...groups].map(([key,questions])=>{
    const subject=questions[0].subjectName??s.subject,courseId=questions[0].courseId??s.courseId,presetFamily=questions[0].presetFamily??s.presetFamily;
    const isSlow=(q:PracticeQuestion)=>q.elapsedMs>q.limitSeconds*1000;
    const failed=questions.filter(q=>q.result!=='correct'||q.blocked),causes=new Map<string,number>();
    questions.forEach(q=>{if(q.cause)causes.set(q.cause,(causes.get(q.cause)??0)+1);});
    return {id:`timer-${s.id}${mixedGroups?`:${encodeURIComponent(key)}`:''}`,date:s.date,subject,courseId,presetFamily,source:s.source,reference:s.scope||`Practice timer · ${questions.length} questions`,...(s.contentType?{contentType:s.contentType}:{}),...(s.questionRange!==undefined?{questionRange:s.questionRange}:{}),independent:s.independent,
      ...(s.unit!==undefined?{unit:s.unit}:{}),...(s.subsection!==undefined?{subsection:s.subsection}:{}),minutes:questions.reduce((n,q)=>n+q.elapsedMs,0)/60000,
      onTime:questions.filter(q=>q.result==='correct'&&!q.blocked&&!isSlow(q)).length,overtime:questions.filter(q=>q.result==='correct'&&!q.blocked&&isSlow(q)).length,
      failed:failed.length,failedOvertime:failed.filter(isSlow).length,blocked:failed.filter(q=>q.blocked).length,bottleneck:[...causes].sort((a,b)=>b[1]-a[1])[0]?.[0]||''};
  });
}
export function practiceEvidence(s:PracticeSession):TimedPracticeRecord|null {return practiceEvidenceRecords(s)[0]??null;}
export function practiceEvidenceRecordId(s:PracticeSession,q:PracticeQuestion):string {
  const groups=new Set(s.questions.filter(item=>item.elapsedMs>0&&firstPracticeOutcome(item).result!=='pending').map(item=>questionEvidenceKey(item,s)));
  return `timer-${s.id}${s.mixed&&groups.size>1?`:${encodeURIComponent(questionEvidenceKey(q,s))}`:''}`;
}
export function applyPracticeSession(state: ScheduleControlState, value: unknown): ScheduleControlState {
  const session = validateSession(value);
  const existing = (state.practiceSessions ?? []).find(s=>s.id===session.id);
  if (existing && existing.updatedAt > session.updatedAt) throw Error('已发现更新的练习记录，请重新打开记录，原始数据已保留。');
  if (existing?.finished && !session.finished) throw Error('这次训练已结束，请刷新查看报告。');
  for (const q of session.questions) {
    const old = existing?.questions.find(x => x.id === q.id);
    if (old?.firstAttempt) {
      if (q.firstAttempt && JSON.stringify(old.firstAttempt) !== JSON.stringify(q.firstAttempt)) throw Error('首次作答不可覆盖。');
      q.firstAttempt = structuredClone(old.firstAttempt);
    } else if (old && old.result !== 'pending') {
      q.firstAttempt = {result:old.result, elapsedMs:old.elapsedMs, limitSeconds:old.limitSeconds, blocked:old.blocked};
    } else if (q.result !== 'pending') q.firstAttempt = {result:q.result, elapsedMs:q.elapsedMs, limitSeconds:q.limitSeconds, blocked:q.blocked};
  }
  if (existing?.questions.some(q => q.firstAttempt && !session.questions.some(x => x.id === q.id))) throw Error('首次作答题目不可删除。');
  const records = session.finished ? practiceEvidenceRecords(session) : [];
  return { ...state, practiceSessions: [...(state.practiceSessions ?? []).filter(s=>s.id!==session.id), session],
    timedPracticeRecords: session.finished ? [...(state.timedPracticeRecords ?? []).filter(r=>!r.id.startsWith('timer-')||timerSessionId(r.id)!==session.id), ...records] : state.timedPracticeRecords };
}
/** Merge from the last submitted UI snapshot, preserving remote-only edits. */
export function mergePracticeSession(base: PracticeSession | undefined, value: unknown, remote: PracticeSession | undefined): PracticeSession {
  const next = validateSession(value);
  if (!remote) return next;
  if (!base) throw Error('这次练习已有记录，请重新打开后编辑。');
  const result = threeWayMerge({ ...base, updatedAt:0 }, { ...next, updatedAt:0 }, { ...remote, updatedAt:0 });
  if (result.conflicts.length) throw Error('另一设备修改了同一题的数据，已保留原记录。请导出当前内容，再重新打开记录。');
  return validateSession({ ...(result.merged as PracticeSession), updatedAt:Math.max(next.updatedAt,remote.updatedAt) });
}
