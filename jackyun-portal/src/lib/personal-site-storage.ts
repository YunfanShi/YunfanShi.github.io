import type { PersonalSiteDefinition } from './personal-site.ts';
import { validatePersonalSite } from './personal-site.ts';
import { getDocuments } from './sync/outbox.ts';
import { captureRepositoryContext, importRepositoryRecordIfMissing, workspaceStorage } from './sync/repository.ts';
import { canonicalJson } from './sync/hash.ts';

const DB_NAME = 'jackyun-personal-sites';
const STORE = 'sites';
const WORKSPACE_PREFIX = 'jackyun_personal_site_v1:';
const SITE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function personalSiteWorkspaceKey(id: string): string | null {
  return SITE_ID.test(id) ? `${WORKSPACE_PREFIX}${id}` : null;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function localSites(): Promise<PersonalSiteDefinition[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result as PersonalSiteDefinition[]);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

async function writeLocal(site: PersonalSiteDefinition): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(site);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('个人网站本地缓存写入失败。'));
    });
  } finally { db.close(); }
}

async function removeLocal(id: string): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('个人网站本地缓存删除失败。'));
    });
  } finally { db.close(); }
}

function parseWorkspaceSite(id: string, value: string | null): PersonalSiteDefinition | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    if (!raw || raw.id !== id || raw.schemaVersion !== 1 || typeof raw.updatedAt !== 'string') return null;
    return { ...validatePersonalSite(raw), id, updatedAt: raw.updatedAt };
  } catch { return null; }
}

/** The account workspace is authoritative; this IndexedDB is only a local cache and migration source. */
export async function listLocalSites(): Promise<PersonalSiteDefinition[]> {
  const context=await captureRepositoryContext();
  // The legacy cache has no owner metadata. Never claim it for a signed-in account.
  const [cached, documents] = await Promise.all([context.owner?Promise.resolve([]):localSites(), getDocuments(context.databaseScope)]);
  context.assertCurrent();
  const documentByKey = new Map(documents.map(row => [row.key, row]));
  const migrated = new Set<string>();

  for (const site of cached) {
    const key = personalSiteWorkspaceKey(site.id);
    if (!key) continue;
    if (documentByKey.has(key)) continue;
    workspaceStorage.setItem(key, JSON.stringify(site));
    migrated.add(key);
  }
  if (migrated.size) await workspaceStorage.flush();

  const latest = await getDocuments(context.databaseScope);
  context.assertCurrent();
  const siteByKey = new Map<string, PersonalSiteDefinition>();
  const resolvedKeys = new Set(latest.map(row => row.key).filter(key => key.startsWith(WORKSPACE_PREFIX)));
  for (const row of latest) {
    if (!row.key.startsWith(WORKSPACE_PREFIX)) continue;
    const id = row.key.slice(WORKSPACE_PREFIX.length);
    if (!personalSiteWorkspaceKey(id)) continue;
    const site = parseWorkspaceSite(id, row.value);
    if (site) siteByKey.set(row.key, site);
    else if (row.value === null&&!context.owner) await removeLocal(id);
  }

  const sites = [...siteByKey.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if(!context.owner)for (const site of sites){context.assertCurrent();await writeLocal(site);}
  context.assertCurrent();
  const syncedIds = new Set(sites.map(site => site.id));
  return [...sites, ...cached.filter(site => {
    const key = personalSiteWorkspaceKey(site.id);
    return !key || (!syncedIds.has(site.id) && !resolvedKeys.has(key));
  })]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveLocalSite(site: PersonalSiteDefinition): Promise<void> {
  const context=await captureRepositoryContext();
  const key = personalSiteWorkspaceKey(site.id);
  if (!key) throw Error('网站 ID 无效，无法安全保存。');
  context.assertCurrent();
  workspaceStorage.setItem(key, JSON.stringify(site));
  await workspaceStorage.flush();
  context.assertCurrent();
  if(!context.owner)await writeLocal(site);
}

export async function deleteLocalSite(id: string): Promise<void> {
  const context=await captureRepositoryContext();
  const key = personalSiteWorkspaceKey(id);
  if (key) {
    workspaceStorage.removeItem(key);
    await workspaceStorage.flush();
  }
  context.assertCurrent();
  if(!context.owner)await removeLocal(id);
}

const siteContent=(site:PersonalSiteDefinition)=>canonicalJson({id:site.id,name:site.name,schemaVersion:site.schemaVersion,theme:site.theme,blocks:site.blocks});
async function legacyCopyId(owner:string,site:PersonalSiteDefinition):Promise<string>{
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${owner}\n${siteContent(site)}`)));
  digest[6]=(digest[6]&15)|128;digest[8]=(digest[8]&63)|128;
  const hex=Array.from(digest.slice(0,16),byte=>byte.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

/** Import only the authenticated owner's legacy backup; existing edits and tombstones always win. */
export async function importLegacyCloudSites(request:typeof fetch=fetch){
  const context=await captureRepositoryContext();
  if(!context.owner)throw Error('请先登录再导入旧版云端备份。');
  const response=await request('/api/personal-sites',{cache:'no-store',headers:{'X-Sync-Account':context.owner}});
  if(!response.ok)throw Error('旧版云端备份读取失败，本机内容未覆盖。');
  const snapshot=await response.json() as {ownerId?:unknown;sites?:Array<{id?:unknown;definition?:unknown}>};
  context.assertCurrent();
  if(snapshot.ownerId!==context.owner||!Array.isArray(snapshot.sites)||snapshot.sites.length>1000)throw Error('旧版备份账号或格式不匹配，导入已停止。');
  const sources=snapshot.sites.map(row=>{
    if(typeof row.id!=='string'||!personalSiteWorkspaceKey(row.id))throw Error('旧版备份包含无效网站 ID。');
    const source=parseWorkspaceSite(row.id,JSON.stringify(row.definition));
    if(!source)throw Error('旧版备份内容校验失败。');
    return source;
  });
  if(new Set(sources.map(row=>row.id)).size!==sources.length)throw Error('旧版备份网站 ID 重复。');
  const result={imported:0,preservedCopies:0,unchanged:0,tombstonesPreserved:0,deferred:0};
  for(const source of sources){
    const copyId=await legacyCopyId(context.owner,source);
    const documents=await getDocuments(context.databaseScope);
    context.assertCurrent();
    const key=personalSiteWorkspaceKey(source.id)!,existing=documents.find(row=>row.key===key);
    if(existing?.value===null){result.tombstonesPreserved++;continue;}
    const local=existing?parseWorkspaceSite(source.id,existing.value):null;
    if(local&&siteContent(local)===siteContent(source)){result.unchanged++;continue;}
    let target=source;
    if(existing){
      target={...source,id:copyId,name:`${source.name} (旧版云端副本)`};
      const copy=documents.find(row=>row.key===personalSiteWorkspaceKey(copyId));
      if(copy?.value===null){result.tombstonesPreserved++;continue;}
      if(copy){
        const saved=parseWorkspaceSite(copyId,copy.value);
        if(saved&&siteContent(saved)===siteContent(target))result.unchanged++;
        else result.deferred++;
        continue;
      }
    }
    const targetKey=personalSiteWorkspaceKey(target.id)!;
    // A same-tab edit after the IndexedDB read must not be replaced by the source snapshot.
    if(workspaceStorage.getItem(targetKey)!==null){result.deferred++;continue;}
    if(!await importRepositoryRecordIfMissing(targetKey,JSON.stringify(target))){result.deferred++;continue;}
    context.assertCurrent();
    if(existing)result.preservedCopies++;else result.imported++;
  }
  return result;
}
