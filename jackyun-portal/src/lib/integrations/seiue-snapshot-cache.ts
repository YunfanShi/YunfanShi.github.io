import type { SeiueSnapshot } from './seiue';

export type SeiueSnapshotCache = Readonly<Record<string, SeiueSnapshot>>;

function key(accountId: string, week: string): string {
  return JSON.stringify([accountId, week]);
}

/** Return only the last successful in-memory snapshot for this exact account/week. */
export function getSeiueSnapshot(cache: SeiueSnapshotCache, accountId: string, week: string): SeiueSnapshot | null {
  if (!accountId || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return null;
  return cache[key(accountId, week)] ?? null;
}

/** Store normalized data in component memory; this module never persists credentials or snapshots. */
export function withSeiueSnapshot(cache: SeiueSnapshotCache, accountId: string, week: string, snapshot: SeiueSnapshot): SeiueSnapshotCache {
  if (!accountId || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return cache;
  return { ...cache, [key(accountId, week)]: snapshot };
}
