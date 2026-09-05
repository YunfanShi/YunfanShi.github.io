export interface LearningCandidate {
  id: string;
  priority?: number;
  dueDate?: string | null;
  reviewDue?: boolean;
  weakness?: number;
  examDaysRemaining?: number | null;
}

export interface RankedLearningCandidate<T extends LearningCandidate> {
  item: T;
  score: number;
  reasons: string[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function dayDifference(fromDateKey: string, toDateKey: string): number {
  const from = Date.parse(`${fromDateKey}T00:00:00Z`);
  const to = Date.parse(`${toDateKey}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** Deterministic baseline ranking. AI may explain or refine this order, but not bypass its constraints. */
export function rankLearningCandidates<T extends LearningCandidate>(
  candidates: readonly T[],
  todayKey: string,
): RankedLearningCandidate<T>[] {
  return candidates
    .map((item) => {
      let score = clamp(item.priority ?? 3, 1, 5) * 10;
      const reasons: string[] = [];

      if (item.dueDate) {
        const days = dayDifference(todayKey, item.dueDate);
        if (days < 0) {
          score += 100 + Math.min(30, Math.abs(days) * 3);
          reasons.push(`逾期 ${Math.abs(days)} 天`);
        } else if (days === 0) {
          score += 90;
          reasons.push('今天到期');
        } else if (days <= 3) {
          score += 55 - days * 5;
          reasons.push(`${days} 天后到期`);
        } else if (days <= 7) {
          score += 20;
          reasons.push('一周内到期');
        }
      }

      if (item.reviewDue) {
        score += 45;
        reasons.push('复习已到期');
      }

      const weakness = clamp(item.weakness ?? 0, 0, 1);
      if (weakness > 0) {
        score += Math.round(weakness * 35);
        reasons.push('薄弱知识点');
      }

      if (item.examDaysRemaining != null && item.examDaysRemaining >= 0) {
        const examBoost = Math.max(0, 30 - Math.min(30, item.examDaysRemaining));
        score += examBoost;
        if (examBoost > 0) reasons.push('考试临近');
      }

      return { item, score, reasons };
    })
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id));
}
