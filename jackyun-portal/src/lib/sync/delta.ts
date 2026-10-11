import { canonicalJson } from './hash.ts';

export type DeltaPath = Array<string | { id: string }>;
export type RecordDelta = { kind: 'set'; path: DeltaPath; value: unknown }
  | { kind: 'remove'; path: DeltaPath }
  | { kind: 'order'; path: DeltaPath; ids: string[] };

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const records = (value: unknown): value is Array<Record<string, unknown> & { id: string }> => Array.isArray(value)
  && value.every(item => object(item) && typeof item.id === 'string' && item.id.length > 0)
  && new Set(value.map(item => item.id)).size === value.length;
const equal = (left: unknown, right: unknown) => (left === undefined) === (right === undefined) && canonicalJson(left) === canonicalJson(right);

/** Paths address collection records by immutable IDs, never their array index. */
export function createRecordDelta(base: unknown, next: unknown, path: DeltaPath = []): RecordDelta[] {
  if (equal(base, next)) return [];
  if (object(base) && object(next)) {
    return [...new Set([...Object.keys(base), ...Object.keys(next)])].flatMap(key => createRecordDelta(Object.hasOwn(base,key)?base[key]:undefined, Object.hasOwn(next,key)?next[key]:undefined, [...path, key]));
  }
  if (records(base) && records(next)) {
    const before = new Map(base.map(item => [item.id, item])), after = new Map(next.map(item => [item.id, item]));
    const changes = [...new Set([...before.keys(), ...after.keys()])].flatMap(id => createRecordDelta(before.get(id), after.get(id), [...path, { id }]));
    if (!equal(base.map(item => item.id), next.map(item => item.id))) changes.push({ kind: 'order', path, ids: next.map(item => item.id) });
    return changes;
  }
  return next === undefined ? [{ kind: 'remove', path }] : [{ kind: 'set', path, value: next }];
}

/** Applied only after an atomic revision/hash check; rejects ambiguous paths. */
export function applyRecordDelta(base: unknown, changes: RecordDelta[]): unknown {
  if (!Array.isArray(changes) || changes.length > 10_000) throw Error('Invalid sync delta');
  let result: unknown = structuredClone(base);
  for (const change of changes) {
    if (!change || !['set', 'remove', 'order'].includes(change.kind) || !Array.isArray(change.path) || change.path.length > 64) throw Error('Invalid sync delta');
    const path = change.path;
    let parent: unknown = result;
    for (const part of path.slice(0, -1)) {
      if (typeof part === 'string') {
        if (!object(parent) || !Object.hasOwn(parent, part)) throw Error('Sync path changed');
        parent = parent[part];
      } else {
        if (!part || typeof part.id !== 'string' || !records(parent)) throw Error('Invalid record path');
        parent = parent.find(item => item.id === part.id);
        if (parent === undefined) throw Error('Sync record disappeared');
      }
    }
    if (change.kind === 'order') {
      const value = path.length ? (typeof path.at(-1) === 'string' && object(parent) ? parent[path.at(-1) as string] : undefined) : result;
      if (!records(value) || !Array.isArray(change.ids) || change.ids.length !== value.length || new Set(change.ids).size !== value.length) throw Error('Invalid record order');
      const byId = new Map(value.map(item => [item.id, item]));
      const ordered = change.ids.map(id => { const item = byId.get(id); if (!item) throw Error('Invalid record order'); return item; });
      if (path.length) Object.defineProperty(parent, path.at(-1) as string, { value: ordered, writable: true, enumerable: true, configurable: true });
      else result = ordered;
      continue;
    }
    if (change.kind === 'set' && !Object.hasOwn(change, 'value')) throw Error('Missing delta value');
    if (!path.length) { result = change.kind === 'remove' ? undefined : structuredClone(change.value); continue; }
    const part = path.at(-1)!;
    if (typeof part === 'string') {
      if (!object(parent)) throw Error('Sync path changed');
      if (change.kind === 'remove') delete parent[part];
      else Object.defineProperty(parent, part, { value: structuredClone(change.value), writable: true, enumerable: true, configurable: true });
    } else {
      if (!part || typeof part.id !== 'string' || !records(parent)) throw Error('Invalid record path');
      const index = parent.findIndex(item => item.id === part.id);
      if (change.kind === 'remove') { if (index >= 0) parent.splice(index, 1); }
      else {
        if (!object(change.value) || change.value.id !== part.id) throw Error('Record identity changed');
        const value = structuredClone(change.value) as Record<string, unknown> & { id: string };
        if (index < 0) parent.push(value); else parent[index] = value;
      }
    }
  }
  return result;
}
