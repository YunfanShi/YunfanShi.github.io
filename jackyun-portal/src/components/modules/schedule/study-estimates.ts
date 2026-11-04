import type { StudyItemRef } from '@/lib/learning/question-bank';

export function estimatedStudyMinutes(items: StudyItemRef[]): number {
  return items.reduce((total, item) => total + (item.kind === 'cue' ? 4 : 8), 0);
}
