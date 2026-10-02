import { dateKey, dateFromKey, type CueReview, type StudyCue, type LearningRecord, type LearningStatus } from './schedule-control.ts';

export const CUE_GAME_XP = 10;
export const CUE_LEVEL_XP = 100;
export const CUE_ENEMY_HITS = 5;
export const CUE_GAME_UNLOCKS = [
  { level: 1, name: '星际侦察艇', color: '#67e8f9' },
  { level: 3, name: '紫晶巡航舰', color: '#c4b5fd' },
  { level: 5, name: '黄金远征舰', color: '#fcd34d' },
  { level: 10, name: '玫瑰星辉舰', color: '#f9a8d4' },
] as const;

export function cueStudyPreferences(value: unknown) {
  const settings = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { cueGameEnabled: settings.cueGameEnabled === true, cueShuffle: settings.cueShuffle !== false };
}

/** One reward per Cue per local calendar day, independent of rating and session. */
export function cueGameProgress(reviews: CueReview[], now = new Date()) {
  const days = new Set<string>();
  const today = dateKey(now);
  let todayCount = 0;
  for (const review of reviews) {
    const at = new Date(review.reviewedAt);
    if (!review.cueId || !Number.isFinite(at.getTime()) || at > now) continue;
    const day = dateKey(at);
    const key = JSON.stringify([review.cueId, day]);
    if (days.has(key)) continue;
    days.add(key);
    if (day === today) todayCount++;
  }
  const count = days.size;
  const xp = count * CUE_GAME_XP;
  const level = Math.floor(xp / CUE_LEVEL_XP) + 1;
  const unlocked = CUE_GAME_UNLOCKS.filter((item) => item.level <= level);
  return { count, todayCount, xp, level, levelXp: xp % CUE_LEVEL_XP,
    defeats: Math.floor(count / CUE_ENEMY_HITS), enemyHits: count % CUE_ENEMY_HITS,
    unlocked, ship: unlocked.at(-1)!, nextUnlock: CUE_GAME_UNLOCKS.find((item) => item.level > level) };
}

export type CueStar = { id: string; cueId: string; day: string; subjectId: string; subjectName: string; status: LearningStatus; reviewedAt: string };
export type CueStarFeedback = { id: number; cueId: string; status: LearningStatus };
export const CUE_STAR_COLORS = { stable: '#6ee7b7', partial: '#fcd34d', unclear: '#fda4af' } as const;

/** The album is reconstructed from syncable evidence, rather than a second counter. */
export function cueStarAlbum(reviews: CueReview[], cues: StudyCue[], records: LearningRecord[] = [], now = new Date()): CueStar[] {
  const byId = new Map(cues.map((cue) => [cue.id, cue]));
  const historical = new Map<string, string>();
  for (const record of records) for (const cue of record.cues) historical.set(JSON.stringify([cue.cueId, dateKey(new Date(record.completedAt))]), cue.subjectName);
  const stars = new Map<string, CueStar>();
  for (const review of reviews) {
    const at = new Date(review.reviewedAt);
    if (!review.cueId || !Number.isFinite(at.getTime()) || at > now) continue;
    const day = dateKey(at);
    const id = JSON.stringify([review.cueId, day]);
    const previous = stars.get(id);
    if (previous && Date.parse(previous.reviewedAt) > at.getTime()) continue;
    const cue = byId.get(review.cueId);
    const subjectName = review.subjectName || historical.get(id) || cue?.subjectName || '未分类';
    stars.set(id, { id, cueId: review.cueId, day, subjectId: review.subjectId || cue?.subjectId || subjectName, subjectName, status: review.status, reviewedAt: review.reviewedAt });
  }
  return [...stars.values()].sort((a, b) => a.day.localeCompare(b.day) || a.subjectId.localeCompare(b.subjectId) || a.id.localeCompare(b.id));
}

/** Stable spiral-arm coordinates: adding or rerating one Cue never rearranges existing stars. */
export function cueGalaxyPoint(id: string) {
  let seed = 2166136261;
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 16777619) >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const radius = .12 + Math.sqrt(random()) * .83;
  const angle = radius * 7.8 + Math.floor(random() * 3) * Math.PI * 2 / 3 + (random() - .5) * .42;
  return { radius, angle, z: (random() - .5) * .12, size: .35 + random() * 1.15 };
}
export function cueStarPosition(id: string) {
  const point = cueGalaxyPoint(id);
  const x = Math.cos(point.angle - .55) * point.radius;
  const y = Math.sin(point.angle - .55) * point.radius;
  return { x: 100 + (x * .93 - y * .24) * 85, y: 75 + (y * .54 + point.z) * 90 };
}
export function cueStarWeek(day: string) {
  const at = dateFromKey(day);
  at.setDate(at.getDate() - (at.getDay() + 6) % 7);
  return dateKey(at);
}
export function cueConstellations(stars: CueStar[]) {
  const groups = new Map<string, CueStar[]>();
  for (const star of stars) {
    const key = star.day;
    const group = groups.get(key) ?? [];
    group.push(star);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((items) => { const group = [...items].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt) || a.id.localeCompare(b.id)); return Array.from({ length: Math.floor(group.length / 5) }, (_, i) => group.slice(i * 5, i * 5 + 5)); });
}

export type CueAnimationSituation = LearningStatus | 'updated' | 'constellation' | 'level' | 'finish';
/** Rotate within each situation so mixed ratings do not repeatedly pick the same animation. */
export function cueAnimationPlan(situation: CueAnimationSituation, occurrence: number) {
  const variant = ((occurrence % 3) + 3) % 3;
  const duration = situation === 'finish' ? 2200 : situation === 'level' ? 1900 : situation === 'constellation' ? 1600 : 1000;
  return { situation, variant, duration };
}
