export const PLAN_ORDER = ['free', 'plus', 'pro', 'ultra'] as const;
export type PlanCode = (typeof PLAN_ORDER)[number];

export function isPlanCode(value: string): value is PlanCode {
  return PLAN_ORDER.includes(value as PlanCode);
}

export function planRank(plan: string): number {
  return PLAN_ORDER.indexOf(plan as PlanCode);
}

export function hasPlanAccess(currentPlan: string, minimumPlan: string): boolean {
  return planRank(currentPlan) >= planRank(minimumPlan);
}

export function normalizeRedemptionCode(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/gu, '');
}

export function isValidCustomCode(value: string): boolean {
  const normalized = normalizeRedemptionCode(value);
  return /^[A-Z0-9]{6,32}$/u.test(normalized);
}

export function formatRedemptionCode(value: string): string {
  return normalizeRedemptionCode(value).replace(/(.{4})(?=.)/gu, '$1-');
}

export function parseShanghaiDateTime(value: string | null | undefined): Date | null {
  const input = value?.trim();
  if (!input) return null;
  const withZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/u.test(input) ? `${input}+08:00` : input;
  const parsed = new Date(withZone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
