export const WRITING_COLLECTIONS=[
  {field:'writingEssays',legacyKey:'jackyun_ielts_writing_workspaces_v1',prefix:'jackyun_ielts_writing_essay_v2:',idField:'id',limit:40},
  {field:'writingErrorHistory',legacyKey:'jackyun_ielts_writing_error_history_v1',prefix:'jackyun_ielts_writing_error_v2:',idField:'essayId',limit:500},
  {field:'writingArchive',legacyKey:'jackyun_ielts_writing_archive_v1',prefix:'jackyun_ielts_writing_archive_v2:',idField:'id',limit:500},
] as const;
export type WritingCollection=typeof WRITING_COLLECTIONS[number];
export const WRITING_DEVICE_KEYS=['jackyun_ielts_writing_draft_v1','jackyun_ielts_writing_draft_mirror_v1','jackyun_ielts_writing_snapshots_v1'] as const;
export function writingProjectionKeys(collection:WritingCollection):string[]{
  return collection.field==='writingEssays'?[collection.legacyKey,'jackyun_ielts_writing_workspaces_mirror_v1',...WRITING_DEVICE_KEYS]:[collection.legacyKey];
}
export function isWritingProjectionKey(key:string):boolean{return WRITING_COLLECTIONS.some(collection=>writingProjectionKeys(collection).includes(key));}
const ITEM_ID=/^[A-Za-z0-9_.:-]{1,64}$/;
export const writingMarkerKey=(collection:WritingCollection)=>`${collection.prefix}$baseline`;
export function writingCollectionForKey(key:string):WritingCollection|null{
  return WRITING_COLLECTIONS.find(collection=>key===writingMarkerKey(collection)||writingItemId(collection,key)!==null)??null;
}
export function writingItemKey(collection:WritingCollection,id:string):string{
  if(!ITEM_ID.test(id))throw Error('Writing item ID is not safely representable');
  // Hex keeps opaque IDs from accidentally matching credential/log key filters.
  return `${collection.prefix}${Array.from(id,char=>char.charCodeAt(0).toString(16).padStart(2,'0')).join('')}`;
}
export function writingItemId(collection:WritingCollection,key:string):string|null{
  if(!key.startsWith(collection.prefix))return null;
  const encoded=key.slice(collection.prefix.length);
  if(!/^(?:[0-9a-f]{2}){1,64}$/.test(encoded))return null;
  const id=String.fromCharCode(...(encoded.match(/../g)??[]).map(pair=>parseInt(pair,16)));
  return ITEM_ID.test(id)?id:null;
}
/** Fail closed on malformed or duplicate identities, rather than dropping source records. */
export function splitWritingCollection(collection:WritingCollection,value:unknown):Array<{key:string;id:string;value:Record<string,unknown>}>{
  if(!Array.isArray(value)||value.length>collection.limit)throw Error('Writing collection is invalid or exceeds its limit');
  const seen=new Set<string>();
  return value.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw Error('Writing collection item must be an object');
    const row=item as Record<string,unknown>,id=row[collection.idField];
    if(typeof id!=='string'||seen.has(id))throw Error('Writing collection item identity is missing or duplicated');
    const key=writingItemKey(collection,id);seen.add(id);
    return {key,id,value:row};
  });
}
export function replaceWritingCollectionItem(collection:WritingCollection,current:unknown,key:string,value:unknown,deleted:boolean):Record<string,unknown>[]{
  const id=writingItemId(collection,key);
  if(id===null)throw Error('Writing resource identity is invalid');
  const entries=splitWritingCollection(collection,current);
  if(deleted)return entries.filter(row=>row.id!==id).map(row=>row.value);
  const incoming=splitWritingCollection(collection,[value])[0];
  if(incoming.id!==id)throw Error('Writing resource identity does not match its value');
  const exists=entries.some(row=>row.id===id);
  const result=entries.map(row=>row.id===id?incoming.value:row.value);
  if(!exists)result.unshift(incoming.value);
  if(result.length>collection.limit)throw Error('Writing collection limit exceeded');
  return result;
}
