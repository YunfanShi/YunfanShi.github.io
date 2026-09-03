export type MergeResult = { merged: unknown; conflicts: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasStableIds(value: unknown[]): value is Array<Record<string, unknown> & { id: string }> {
  return value.every((item) => isObject(item) && typeof item.id === 'string' && item.id.length > 0);
}

export function threeWayMerge(base: unknown, local: unknown, remote: unknown, path = '$'): MergeResult {
  if (equal(local, remote)) return { merged: local, conflicts: [] };
  if (equal(local, base)) return { merged: remote, conflicts: [] };
  if (equal(remote, base)) return { merged: local, conflicts: [] };

  if (isObject(base) && isObject(local) && isObject(remote)) {
    const merged: Record<string, unknown> = {};
    const conflicts: string[] = [];
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      const result = threeWayMerge(base[key], local[key], remote[key], `${path}.${key}`);
      if (result.merged !== undefined) merged[key] = result.merged;
      conflicts.push(...result.conflicts);
    }
    return { merged, conflicts };
  }

  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)
      && hasStableIds(base) && hasStableIds(local) && hasStableIds(remote)) {
    const baseMap = new Map(base.map((item) => [item.id, item]));
    const localMap = new Map(local.map((item) => [item.id, item]));
    const remoteMap = new Map(remote.map((item) => [item.id, item]));
    const merged: unknown[] = [];
    const conflicts: string[] = [];
    const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
    for (const id of ids) {
      const result = threeWayMerge(baseMap.get(id), localMap.get(id), remoteMap.get(id), `${path}[${id}]`);
      if (result.merged !== undefined) merged.push(result.merged);
      conflicts.push(...result.conflicts);
    }
    return { merged, conflicts };
  }

  return { merged: local, conflicts: [path] };
}
