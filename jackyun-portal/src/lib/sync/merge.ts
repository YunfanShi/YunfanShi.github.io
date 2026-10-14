import { canonicalJson } from './hash.ts';

export type MergeResult = { merged: unknown; conflicts: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function equal(left: unknown, right: unknown): boolean {
  return (left === undefined) === (right === undefined) && canonicalJson(left) === canonicalJson(right);
}

function hasStableIds(value: unknown[]): value is Array<Record<string, unknown> & { id: string }> {
  return value.every((item) => isObject(item) && typeof item.id === 'string' && item.id.length > 0)
    && new Set(value.map(item => (item as { id: string }).id)).size === value.length;
}

export function threeWayMerge(base: unknown, local: unknown, remote: unknown, path = '$'): MergeResult {
  if (equal(local, remote)) return { merged: local, conflicts: [] };
  if (equal(local, base)) return { merged: remote, conflicts: [] };
  if (equal(remote, base)) return { merged: local, conflicts: [] };

  if ((base === undefined || base === null || isObject(base)) && isObject(local) && isObject(remote)) {
    const original = isObject(base) ? base : {};
    const merged: Record<string, unknown> = {};
    const conflicts: string[] = [];
    const keys = new Set([...Object.keys(original), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      const result = threeWayMerge(Object.hasOwn(original,key)?original[key]:undefined, Object.hasOwn(local,key)?local[key]:undefined, Object.hasOwn(remote,key)?remote[key]:undefined, `${path}.${key}`);
      if (result.merged !== undefined) Object.defineProperty(merged, key, { value: result.merged, enumerable: true, writable: true, configurable: true });
      conflicts.push(...result.conflicts);
    }
    return { merged, conflicts };
  }

  if ((base === undefined || base === null || Array.isArray(base)) && Array.isArray(local) && Array.isArray(remote)
      && (!Array.isArray(base) || hasStableIds(base)) && hasStableIds(local) && hasStableIds(remote)) {
    const baseMap = new Map((Array.isArray(base) ? base : []).map((item) => [item.id, item]));
    const localMap = new Map(local.map((item) => [item.id, item]));
    const remoteMap = new Map(remote.map((item) => [item.id, item]));
    const mergedMap = new Map<string,unknown>();
    const conflicts: string[] = [];
    const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
    for (const id of ids) {
      const result = threeWayMerge(baseMap.get(id), localMap.get(id), remoteMap.get(id), `${path}[${id}]`);
      if (result.merged !== undefined) mergedMap.set(id,result.merged);
      conflicts.push(...result.conflicts);
    }
    const common = [...baseMap.keys()].filter(id=>localMap.has(id)&&remoteMap.has(id));
    const order = (map:Map<string,unknown>)=>[...map.keys()].filter(id=>common.includes(id));
    const localOrder=order(localMap),remoteOrder=order(remoteMap);
    const localChanged=!equal(common,localOrder),remoteChanged=!equal(common,remoteOrder);
    if(localChanged&&remoteChanged&&!equal(localOrder,remoteOrder))conflicts.push(`${path}.$order`);
    const preferred=localChanged?localMap:remoteChanged?remoteMap:localMap;
    const mergedOrder=[...preferred.keys()].filter(id=>mergedMap.has(id));
    // Keep each insertion beside its surviving neighbors, including insertions
    // from the side whose existing records did not change order.
    for(const source of [localMap,remoteMap]) {
      const sourceOrder=[...source.keys()].filter(id=>mergedMap.has(id));
      for(let index=0;index<sourceOrder.length;index++) {
        const id=sourceOrder[index];
        if(mergedOrder.includes(id))continue;
        const next=sourceOrder.slice(index+1).find(candidate=>mergedOrder.includes(candidate));
        const previous=sourceOrder.slice(0,index).reverse().find(candidate=>mergedOrder.includes(candidate));
        const position=next!==undefined?mergedOrder.indexOf(next):previous!==undefined?mergedOrder.indexOf(previous)+1:mergedOrder.length;
        mergedOrder.splice(position,0,id);
      }
    }
    const merged=mergedOrder.map(id=>mergedMap.get(id));
    return { merged, conflicts };
  }

  // Primitive lists can merge concurrent append-only changes. Removals and
  // reordering remain conflicts; concatenation would silently resurrect data.
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)
      && [...base,...local,...remote].every(item=>item===null || ['string','number','boolean'].includes(typeof item))
      && [base,local,remote].every(items=>new Set(items.map(canonicalJson)).size===items.length)
      && local.length>=base.length && remote.length>=base.length
      && base.every((item,index)=>equal(item,local[index]) && equal(item,remote[index]))) {
    const additions=[...local.slice(base.length),...remote.slice(base.length)];
    const unique=new Map(additions.map(item=>[canonicalJson(item),item]));
    // Canonical order gives both devices the same result, independent of who syncs first.
    return {merged:[...base,...[...unique].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,value])=>value)],conflicts:[]};
  }

  return { merged: local, conflicts: [path] };
}
