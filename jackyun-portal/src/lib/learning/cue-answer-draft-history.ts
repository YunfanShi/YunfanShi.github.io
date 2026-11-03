export const CUE_ANSWER_DRAFT_HISTORY_LIMIT = 5;
export const CUE_ANSWER_DRAFT_HISTORY_DELAY = 800;

export interface CueAnswerDraftVersion {
  text: string;
  savedAt: string;
}

export interface CueAnswerDraftHistory {
  text: string;
  versions: CueAnswerDraftVersion[];
  activeIndex: number;
}

const keyFor = (sessionId: string, cueId: string) => `jackyun_cue_answer_draft_v1:${JSON.stringify([sessionId, cueId])}`;

export function emptyCueAnswerDraftHistory(text = '', savedAt = new Date().toISOString()): CueAnswerDraftHistory {
  return { text, versions: [{ text, savedAt }], activeIndex: 0 };
}

export function parseCueAnswerDraftHistory(value: unknown, fallbackText = '', savedAt = new Date().toISOString()): CueAnswerDraftHistory {
  if (!value || typeof value !== 'object') return emptyCueAnswerDraftHistory(fallbackText, savedAt);
  const candidate = value as Partial<CueAnswerDraftHistory>;
  const versions = Array.isArray(candidate.versions)
    ? candidate.versions.filter((item): item is CueAnswerDraftVersion => !!item && typeof item.text === 'string' && typeof item.savedAt === 'string').slice(-CUE_ANSWER_DRAFT_HISTORY_LIMIT)
    : [];
  const text = typeof candidate.text === 'string' ? candidate.text.slice(0, 10_000) : fallbackText;
  if (!versions.length) versions.push({ text, savedAt });
  const activeIndex = Number.isInteger(candidate.activeIndex)
    ? Math.max(0, Math.min(candidate.activeIndex!, versions.length - 1))
    : versions.length - 1;
  return { text, versions, activeIndex };
}

export function readCueAnswerDraftHistory(sessionId: string, cueId: string, fallbackText = '', storage?: Pick<Storage, 'getItem'>): CueAnswerDraftHistory {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : workspaceStorage);
    const serialized = target?.getItem(keyFor(sessionId, cueId));
    return serialized ? parseCueAnswerDraftHistory(JSON.parse(serialized), fallbackText) : emptyCueAnswerDraftHistory(fallbackText);
  } catch {
    return emptyCueAnswerDraftHistory(fallbackText);
  }
}

export function writeCueAnswerDraftHistory(sessionId: string, cueId: string, history: CueAnswerDraftHistory, storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : workspaceStorage);
    if (!target) return false;
    target.setItem(keyFor(sessionId, cueId), JSON.stringify(parseCueAnswerDraftHistory(history)));
    return true;
  } catch {
    return false;
  }
}

export function checkpointCueAnswerDraft(history: CueAnswerDraftHistory, savedAt: string): CueAnswerDraftHistory {
  const branch = history.versions.slice(0, history.activeIndex + 1);
  if (branch.at(-1)?.text === history.text) return { ...history, versions: branch, activeIndex: branch.length - 1 };
  const versions = [...branch, { text: history.text, savedAt }].slice(-CUE_ANSWER_DRAFT_HISTORY_LIMIT);
  return { ...history, versions, activeIndex: versions.length - 1 };
}

export function moveCueAnswerDraftHistory(history: CueAnswerDraftHistory, offset: -1 | 1): CueAnswerDraftHistory {
  const activeIndex = Math.max(0, Math.min(history.versions.length - 1, history.activeIndex + offset));
  return { ...history, activeIndex, text: history.versions[activeIndex]?.text ?? history.text };
}
import {workspaceStorage} from '../sync/repository.ts';
