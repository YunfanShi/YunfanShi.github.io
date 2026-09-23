export const IELTS_SKILLS = ['listening', 'reading', 'writing', 'speaking'] as const;
export type IeltsSkill = typeof IELTS_SKILLS[number];
export type IeltsOutcome = 'stable' | 'partial' | 'unclear';

export const IELTS_SKILL_LABELS: Record<IeltsSkill, string> = {
  listening: '听力', reading: '阅读', writing: '写作', speaking: '口语',
};

export interface IeltsGoal {
  overall: number;
  examDate: string;
  weeklyHours: number;
  targets: Record<IeltsSkill, number>;
}

export interface IeltsPractice {
  id: string;
  skill: IeltsSkill;
  practicedAt: string;
  minutes: number;
  band: number | null;
  outcome: IeltsOutcome;
  material: string;
  issue: string;
  nextStep: string;
}

export interface IeltsActivity {
  skill: IeltsSkill;
  practicedAt: string;
  source: string;
  issue?: string;
}

export interface IeltsInsight {
  skill: IeltsSkill;
  target: number;
  latestBand: number | null;
  practiceCount: number;
  latestAt: string | null;
  issue: string | null;
  reason: string;
  priority: number;
}

export function planIeltsWeek(weeklyHours: number, insights: IeltsInsight[]): { sessions: { skill: IeltsSkill; minutes: number }[]; reviewMinutes: number } {
  const budget = weeklyHours * 60;
  const reviewMinutes = budget < 120 ? 15 : budget < 240 ? 30 : 45;
  const practiceBudget = budget - reviewMinutes;
  const count = Math.min(4, Math.floor(practiceBudget / 45), insights.length);
  return {
    sessions: insights.slice(0, count).map((item) => ({ skill: item.skill, minutes: Math.min(60, Math.floor(practiceBudget / count)) })),
    reviewMinutes,
  };
}

export function validBand(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 9 && value * 2 === Math.round(value * 2);
}

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseIeltsGoal(value: unknown): IeltsGoal | null {
  if (!value || typeof value !== 'object') return null;
  const goal = value as Partial<IeltsGoal>;
  if (!validBand(goal.overall) || !validDate(goal.examDate) || typeof goal.weeklyHours !== 'number' || !Number.isInteger(goal.weeklyHours) || goal.weeklyHours < 1 || goal.weeklyHours > 40) return null;
  if (!goal.targets || !IELTS_SKILLS.every((skill) => validBand(goal.targets?.[skill]))) return null;
  return goal as IeltsGoal;
}

export function parseIeltsPractices(value: unknown): IeltsPractice[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is IeltsPractice => {
    if (!item || typeof item !== 'object') return false;
    const row = item as Partial<IeltsPractice>;
    return typeof row.id === 'string' && IELTS_SKILLS.includes(row.skill as IeltsSkill)
      && typeof row.practicedAt === 'string' && !Number.isNaN(Date.parse(row.practicedAt))
      && typeof row.minutes === 'number' && Number.isInteger(row.minutes) && row.minutes > 0 && row.minutes <= 240
      && (row.band === null || validBand(row.band))
      && ['stable', 'partial', 'unclear'].includes(row.outcome ?? '')
      && typeof row.material === 'string' && typeof row.issue === 'string' && typeof row.nextStep === 'string';
  }).slice(-500);
}

export function buildIeltsInsights(goal: IeltsGoal, practices: IeltsPractice[], activity: IeltsActivity[], today: string): IeltsInsight[] {
  const now = Date.parse(`${today}T00:00:00Z`);
  return IELTS_SKILLS.map((skill) => {
    const skillPractices = practices.filter((entry) => entry.skill === skill).sort((a, b) => b.practicedAt.localeCompare(a.practicedAt));
    const skillActivity = activity.filter((entry) => entry.skill === skill).sort((a, b) => b.practicedAt.localeCompare(a.practicedAt));
    const latestBand = skillPractices.find((entry) => entry.band !== null)?.band ?? null;
    const latestAt = [...skillPractices.map((entry) => entry.practicedAt), ...skillActivity.map((entry) => entry.practicedAt)].sort().at(-1) ?? null;
    const issue = skillPractices.find((entry) => entry.issue.trim())?.issue.trim()
      ?? skillActivity.find((entry) => entry.issue?.trim())?.issue?.trim() ?? null;
    const gap = latestBand === null ? 0 : Math.max(0, goal.targets[skill] - latestBand);
    const daysSince = latestAt ? Math.max(0, Math.floor((now - Date.parse(latestAt.slice(0, 10) + 'T00:00:00Z')) / 86_400_000)) : null;
    const priority = (latestBand === null ? 5 : gap * 4) + (latestAt === null ? 3 : daysSince !== null && daysSince >= 7 ? 2 : 0)
      + (skillPractices[0]?.outcome === 'unclear' ? 2 : skillPractices[0]?.outcome === 'partial' ? 1 : 0);
    const reason = latestBand === null
      ? `还没有${IELTS_SKILL_LABELS[skill]}的分数记录，先做一次限时基线练习。`
      : gap > 0 ? `最近记录 ${latestBand}，距单项目标 ${goal.targets[skill]} 还差 ${gap.toFixed(1)} 分。`
        : `最近记录 ${latestBand}，已达到单项目标；继续用新材料验证稳定性。`;
    return { skill, target: goal.targets[skill], latestBand, practiceCount: skillPractices.length, latestAt, issue, reason, priority };
  }).sort((a, b) => b.priority - a.priority || IELTS_SKILLS.indexOf(a.skill) - IELTS_SKILLS.indexOf(b.skill));
}
