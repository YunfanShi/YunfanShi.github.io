import type { CueDisplayPreset, CueType } from './schedule-control.ts';

export const CUE_EDITOR_DRAFT_KEY = 'jackyun_cue_manager_editor_draft_v1';

export interface CueManagerEditorDraft {
  subjectName: string;
  unit: string;
  subsection: string;
  editingId: string;
  prompt: string;
  subtitle: string;
  answer: string;
  type: CueType;
  display: CueDisplayPreset;
  choices: string;
  correctChoice: number;
  markingPoints: string;
}

const cueTypes: CueType[] = ['general', 'definition', 'explain', 'state', 'calculate', 'formula', 'derivation', 'proof', 'compare', 'process', 'application', 'diagram', 'multiple-choice'];
const displayPresets: CueDisplayPreset[] = ['standard', 'headline', 'formula', 'steps', 'comparison', 'scenario', 'definition-card', 'multiple-choice'];

export function readCueManagerEditorDraft(storage: Pick<Storage, 'getItem'>): CueManagerEditorDraft | null {
  try {
    const raw = storage.getItem(CUE_EDITOR_DRAFT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CueManagerEditorDraft>;
    if (
      typeof value.subjectName !== 'string' || typeof value.unit !== 'string' ||
      typeof value.subsection !== 'string' || typeof value.editingId !== 'string' ||
      typeof value.prompt !== 'string' || typeof value.subtitle !== 'string' ||
      typeof value.answer !== 'string' || typeof value.choices !== 'string' ||
      typeof value.markingPoints !== 'string' || !cueTypes.includes(value.type as CueType) ||
      !displayPresets.includes(value.display as CueDisplayPreset) ||
      !Number.isInteger(value.correctChoice) || (value.correctChoice ?? -1) < 0
    ) return null;
    return value as CueManagerEditorDraft;
  } catch {
    return null;
  }
}

export function cueManagerEditorDraftHasContent(draft: CueManagerEditorDraft): boolean {
  return Boolean(draft.editingId || draft.subsection || draft.prompt || draft.subtitle || draft.answer || draft.choices || draft.markingPoints);
}

export function writeCueManagerEditorDraft(storage: Pick<Storage, 'setItem'>, draft: CueManagerEditorDraft): void {
  storage.setItem(CUE_EDITOR_DRAFT_KEY, JSON.stringify(draft));
}

export function clearCueManagerEditorDraft(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(CUE_EDITOR_DRAFT_KEY);
}
