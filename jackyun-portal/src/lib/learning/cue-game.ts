import { dateKey, type CueReview } from './schedule-control.ts';

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
