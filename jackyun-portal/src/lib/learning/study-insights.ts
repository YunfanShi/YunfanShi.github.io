import { cueProfileType } from './learning-assistance.ts';
import type { CueReview, LearningStatus, StudyCue } from './schedule-control.ts';
import type { QuestionAttempt } from './question-bank.ts';
import { addCalendarDays, dateKey } from './schedule-control.ts';
export type StudyRange = '7' | '30' | 'all';
export function evidenceInRange(evidence: StudyEvidence[], range: StudyRange, now = new Date()): StudyEvidence[] {
  const today = dateKey(now);
  const first = range === 'all' ? '' : addCalendarDays(today, range === '7' ? -6 : -29);
  return evidence.filter(item => {
    if (!Number.isFinite(Date.parse(item.at))) return false;
    const day = dateKey(new Date(item.at));
    return day <= today && (!first || day >= first);
  });
}
export type StudyDimension = 'subject' | 'unit' | 'cueType' | 'skill' | 'questionType' | 'issue';
export const dimensionLabels: Record<StudyDimension, string> = { subject: '学科', unit: 'Unit', cueType: 'CUE type', skill: '知识能力', questionType: '题型', issue: '错因' };
export interface StudyEvidence { subjectId: string; subject: string; unit: string; cueType?: string; skill?: string; questionType?: string; issue?: string; status: LearningStatus; at: string; correct?: boolean | null }
export interface StudyMetric { key: string; label: string; stable: number; partial: number; unclear: number; attempts: number; objective: number; correct: number }
export function studyEvidence(cues: StudyCue[], reviews: CueReview[], attempts: QuestionAttempt[]): StudyEvidence[] {
  const byId = new Map(cues.map((cue) => [cue.id, cue]));
  return [...reviews.flatMap((review): StudyEvidence[] => {
    const cue = byId.get(review.cueId);
    if (!cue) return [];
    return [{ subjectId: cue.subjectId, subject: cue.subjectName, unit: cue.unit, cueType: cue.type, skill: cueProfileType(cue), status: review.status, at: review.reviewedAt }];
  }), ...attempts.map((attempt): StudyEvidence => ({ subjectId: attempt.snapshot.subjectId, subject: attempt.snapshot.subjectName, unit: attempt.snapshot.unit, questionType: attempt.snapshot.type, issue: attempt.issue.trim() || undefined, status: attempt.status, at: attempt.reviewedAt, correct: attempt.correct }))];
}
export function studyMetrics(evidence: StudyEvidence[], dimension: StudyDimension, subjectId = ''): StudyMetric[] {
  const groups = new Map<string, StudyMetric>();
  for (const item of evidence) {
    if (subjectId && item.subjectId !== subjectId) continue;
    const value = dimension === 'subject' ? item.subject : item[dimension];
    // CUE notes are not an asserted error cause; never infer one from prose.
    if (!value) continue;
    const key = dimension === 'subject' ? item.subjectId : dimension === 'unit' ? `${item.subjectId}:${value}` : value;
    const label = dimension === 'unit' && !subjectId ? `${item.subject} · ${value}` : value;
    const group = groups.get(key) ?? { key, label, stable: 0, partial: 0, unclear: 0, attempts: 0, objective: 0, correct: 0 };
    group[item.status] += 1; group.attempts += 1;
    if (typeof item.correct === 'boolean') { group.objective += 1; if (item.correct) group.correct += 1; }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => (b.partial + b.unclear) / b.attempts - (a.partial + a.unclear) / a.attempts || b.attempts - a.attempts || a.label.localeCompare(b.label));
}
export function studyReportData(evidence: StudyEvidence[], subjectId = '') {
  const selected = evidence.filter((item) => !subjectId || item.subjectId === subjectId);
  return { attempts: selected.length, first: selected.map((item) => item.at).sort().at(0), last: selected.map((item) => item.at).sort().at(-1), dimensions: Object.fromEntries((Object.keys(dimensionLabels) as StudyDimension[]).map((dimension) => [dimension, studyMetrics(selected, dimension, subjectId).slice(0, 80).map((metric) => ({ ...metric, label: metric.label.length > 240 ? metric.label.slice(0, 240) + '…' : metric.label }))])) };
}
