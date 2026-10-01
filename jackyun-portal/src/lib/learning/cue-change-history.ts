import type { StudyCue } from './schedule-control.ts';

export const cueChangeFields = {
  subjectId: '科目 ID', subjectName: '科目', unit: '单元', subsection: '章节',
  prompt: '问题', subtitle: '说明', answer: '参考答案', type: '类型', display: '显示方式',
  choices: '选项', correctChoice: '正确选项', markingPoints: '评分点', userDifficulty: '难度',
} as const;
export type CueChangeField = keyof typeof cueChangeFields;
export type CueChangeSource = 'manual' | 'import' | 'memory' | 'lesson';
export interface CueFieldChange { field: CueChangeField; before: unknown; after: unknown }
export interface CueContentChange {
  cueId: string; action: 'create' | 'update' | 'delete'; subjectName: string; unit: string; prompt: string;
  beforeVersion?: number; afterVersion?: number; fields: CueFieldChange[];
}
export interface CueChangeRecord {
  id: string; at: string; source: CueChangeSource; changes: CueContentChange[];
  createdCount: number; modifiedCount: number; deletedCount: number;
}

/** Compare content only: review scheduling and ratings are kept in learning history. */
export function createCueChangeRecord(before: StudyCue[], after: StudyCue[], source: CueChangeSource, at: string, id: string): CueChangeRecord | null {
  const previous = new Map(before.map((cue) => [cue.id, cue]));
  const next = new Map(after.map((cue) => [cue.id, cue]));
  const changes: CueContentChange[] = [];
  for (const cueId of new Set([...previous.keys(), ...next.keys()])) {
    const oldCue = previous.get(cueId), newCue = next.get(cueId);
    const cue = newCue ?? oldCue!;
    const fields = (Object.keys(cueChangeFields) as CueChangeField[]).flatMap((field) => {
      const oldValue = oldCue?.[field] ?? null, newValue = newCue?.[field] ?? null;
      return JSON.stringify(oldValue) === JSON.stringify(newValue) ? [] : [{ field, before: structuredClone(oldValue), after: structuredClone(newValue) }];
    });
    if (!fields.length && oldCue && newCue) continue;
    changes.push({ cueId, action: !oldCue ? 'create' : !newCue ? 'delete' : 'update', subjectName: cue.subjectName, unit: cue.unit, prompt: cue.prompt, beforeVersion: oldCue?.version, afterVersion: newCue?.version, fields });
  }
  if (!changes.length && source !== 'import' && source !== 'memory') return null;
  return { id, at, source, changes, createdCount: changes.filter((item) => item.action === 'create').length, modifiedCount: changes.filter((item) => item.action === 'update').length, deletedCount: changes.filter((item) => item.action === 'delete').length };
}
