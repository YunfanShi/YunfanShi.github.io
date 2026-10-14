import { createEmptyScheduleState, migrateIeltsWeekTaskDates, normalizeCueMetadata, parseTimetableImport, reconcileScheduleSubjects, rollOverManualTasks, recalculateLegacyCueSchedules, dateKey, type ScheduleControlState, type CueMemo, type CueStudyDraft } from './schedule-control.ts';
import { normalizeTimedPractice, normalizePracticeFrequencies } from './timed-practice.ts';
import { readDiagnoses } from './exam-diagnosis.ts';
export const SCHEDULE_STORAGE_KEY = 'jackyun_schedule_control_v1';
export function readScheduleState(storage: Pick<Storage, 'getItem'>, now = new Date()): ScheduleControlState {
  const empty = createEmptyScheduleState();
  try {
    const parsed = JSON.parse(storage.getItem(SCHEDULE_STORAGE_KEY) || 'null') as Partial<ScheduleControlState> | null;
    if (!parsed) return empty;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.cues)) throw new Error('学习数据格式无法读取，原内容已保留。');
    const storedSettings = parsed.settings as Partial<ScheduleControlState['settings']> | undefined;
    const previewPreferenceSet = storedSettings?.previewPreferenceSet === true;
    const storedMemos = Array.isArray(parsed.cueMemos) ? parsed.cueMemos.flatMap((memo): CueMemo[] => (
      memo && typeof memo === 'object' && typeof memo.cueId === 'string' && typeof memo.content === 'string' && memo.content.trim()
        ? [{ cueId: memo.cueId, content: memo.content.slice(0, 10_000), updatedAt: typeof memo.updatedAt === 'string' ? memo.updatedAt : now.toISOString() }]
        : []
    )) : [];
    const memoByCueId = new Map(storedMemos.map((memo) => [memo.cueId, memo]));
    if (parsed.cueStudyDraft?.writtenResponses && typeof parsed.cueStudyDraft.writtenResponses === 'object') {
      for (const [cueId, content] of Object.entries(parsed.cueStudyDraft.writtenResponses)) {
        if (!memoByCueId.has(cueId) && typeof content === 'string' && content.trim()) {
          memoByCueId.set(cueId, { cueId, content: content.slice(0, 10_000), updatedAt: parsed.cueStudyDraft.updatedAt ?? now.toISOString() });
        }
      }
    }
    const loaded: ScheduleControlState = {
      ...empty,
      ...parsed,
      cueScheduleRevision: parsed.cueScheduleRevision ?? 0,
      studyReports: Array.isArray(parsed.studyReports) ? parsed.studyReports.filter((report) => report && typeof report.subjectId === 'string' && typeof report.signature === 'string' && typeof report.content === 'string' && Number.isFinite(Date.parse(report.generatedAt))).slice(0, 20) : [],
      settings: {
        ...empty.settings,
        ...storedSettings,
        cueCollectionReminderDays: Number.isInteger(storedSettings?.cueCollectionReminderDays) ? Math.max(1, Math.min(365, storedSettings?.cueCollectionReminderDays ?? 30)) : empty.settings.cueCollectionReminderDays,
        previewEnabled: previewPreferenceSet && storedSettings?.previewEnabled === true,
        previewPreferenceSet,
      },
      manualTasks: Array.isArray(parsed.manualTasks) ? migrateIeltsWeekTaskDates(parsed.manualTasks) : [],
      completions: parsed.completions && typeof parsed.completions === 'object' ? parsed.completions : {},
      cancellations: parsed.cancellations && typeof parsed.cancellations === 'object' ? parsed.cancellations : {},
      reviewProgress: parsed.reviewProgress && typeof parsed.reviewProgress === 'object' ? parsed.reviewProgress : {},
      cues: Array.isArray(parsed.cues) ? parsed.cues.map((cue) => normalizeCueMetadata(cue, now.toISOString())) : [],
      cueReviews: Array.isArray(parsed.cueReviews) ? parsed.cueReviews : [],
      timedPracticeRecords: normalizeTimedPractice(parsed.timedPracticeRecords),
      examDiagnoses: readDiagnoses(parsed.examDiagnoses),
      practiceFrequencies: normalizePracticeFrequencies(parsed.practiceFrequencies),
      learningRecords: Array.isArray(parsed.learningRecords) ? parsed.learningRecords : [],
      learningCatalog: Array.isArray(parsed.learningCatalog) ? parsed.learningCatalog : [],
      learningReminders: Array.isArray(parsed.learningReminders) ? parsed.learningReminders : [],
      cueCollectionUpdates: Array.isArray(parsed.cueCollectionUpdates) ? parsed.cueCollectionUpdates : [],
      cueChangeHistory: Array.isArray(parsed.cueChangeHistory) ? parsed.cueChangeHistory : [],
      cueSimilarityDecisions: Array.isArray(parsed.cueSimilarityDecisions) ? parsed.cueSimilarityDecisions.filter((decision) => decision && typeof decision.id === 'string' && typeof decision.leftCueId === 'string' && typeof decision.rightCueId === 'string' && decision.leftCueId !== decision.rightCueId && Number.isInteger(decision.leftVersion) && decision.leftVersion > 0 && Number.isInteger(decision.rightVersion) && decision.rightVersion > 0 && typeof decision.decidedAt === 'string') : [],
      cueMemos: [...memoByCueId.values()],
      cueAnswerCards: Array.isArray(parsed.cueAnswerCards) ? parsed.cueAnswerCards : [],
      cueStudyDraft: parsed.cueStudyDraft && Array.isArray(parsed.cueStudyDraft.cueIds) && parsed.cueStudyDraft.task ? {
        ...parsed.cueStudyDraft,
        writtenResponses: {},
      } : undefined,
      cueStudyDrafts: Object.fromEntries(Object.entries(parsed.cueStudyDrafts ?? {}).filter((entry): entry is [string, CueStudyDraft] => {
        const draft = entry[1];
        return Boolean(draft && typeof draft === 'object' && Array.isArray(draft.cueIds) && draft.task && typeof draft.updatedAt === 'string');
      })),
      timetable: parsed.timetable ? parseTimetableImport(parsed.timetable) : null,
    };
    return reconcileScheduleSubjects(rollOverManualTasks(recalculateLegacyCueSchedules(loaded), dateKey(now), now.toISOString()));
  } catch (error) {
    throw new Error(`学习数据读取失败：${error instanceof Error ? error.message : '格式错误'}`);
  }
}

