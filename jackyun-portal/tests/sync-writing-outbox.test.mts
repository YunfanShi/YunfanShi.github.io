import assert from 'node:assert/strict';
import test from 'node:test';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {commitWritingPage,prepareWritingCollection} from '../src/lib/sync/writing-outbox.ts';
import {getDocuments,getOutbox,getSetting,getV5Conflicts,getV5Cursor,getV5Outbox,getV5Resources,openDatabase,type V5ResourceConflict,type V5ResourceRecord} from '../src/lib/sync/outbox.ts';
import {legacyWorkspaceRecordId} from '../src/lib/sync/resource-model.ts';
import {resolveWritingConflictRemotely} from '../src/lib/sync/writing-outbox.ts';
import {WRITING_COLLECTIONS,writingItemKey,writingMarkerKey} from '../src/lib/sync/writing-resource-model.ts';

Object.assign(globalThis,{indexedDB:new IDBFactory()});
const id=()=>`writing-outbox-${crypto.randomUUID()}`;
const essay=WRITING_COLLECTIONS[0];
const recordId=(key:string)=>legacyWorkspaceRecordId(key)!;
async function seed(dbName:string,work:(tx:IDBTransaction)=>void){
  const db=await openDatabase(dbName);try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['documents','metadata','outbox','settings','v5Resources','v5FieldCursors','v5Conflicts','v5Outbox'],'readwrite');work(tx);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
function put(tx:IDBTransaction,store:string,value:unknown){tx.objectStore(store).put(value);}

test('writing handoff splits legacy edits into stable v5 records and retains the editor projection',async()=>{
  const dbName=id(),base=[{id:'essay-a',savedAt:'2026-10-01',draft:{essay:'base',essayId:'essay-a',question:'',originalEssay:'',task:'task2'},feedback:null}],local=[{...base[0],draft:{...base[0].draft,essay:'local edit'}}];
  const marker={scope:'workspace' as const,recordId:recordId(writingMarkerKey(essay)),revision:1,contentHash:'a'.repeat(64),deleted:false,updatedAt:'now',value:{kind:'baseline'}};
  const item={scope:'workspace' as const,recordId:recordId(writingItemKey(essay,'essay-a')),revision:4,contentHash:'b'.repeat(64),deleted:false,updatedAt:'now',value:base[0]};
  await seed(dbName,tx=>{
    put(tx,'documents',{key:essay.legacyKey,value:JSON.stringify(local),updatedAt:2});
    put(tx,'documents',{key:'jackyun_ielts_writing_draft_v1',value:JSON.stringify({essayId:'essay-a',essay:'local edit',question:'',originalEssay:'',task:'task2'}),updatedAt:2});
    put(tx,'metadata',{key:essay.legacyKey,value:base,revision:1,contentHash:'c'.repeat(64),deleted:false,updatedAt:'now'});
    put(tx,'v5Resources',marker);put(tx,'v5Resources',item);
    put(tx,'v5FieldCursors',{scope:'workspace',field:essay.field,mode:'changes',after:'',cursor:9,head:9});
  });
  const db=await openDatabase(dbName);let result;
  try{result=await prepareWritingCollection(db,essay.field);}finally{db.close();}
  assert.equal(result?.active,true);
  const projection=(await getDocuments(dbName)).find(row=>row.key===essay.legacyKey);
  assert.equal(projection?.writingProjection,true);
  assert.deepEqual(JSON.parse(projection!.value!),local);
  const operations=await getV5Outbox('workspace',dbName);
  assert.equal(operations.length,1);
  assert.equal(operations[0].recordId,item.recordId);
  assert.deepEqual(operations[0].value,local[0]);
  assert.deepEqual(await getOutbox(dbName),[]);
  assert.ok((await getSetting<string[]>('v5WorkspaceAuthorityKeys',dbName))?.includes(essay.legacyKey));
});

test('frozen legacy submission defers writing handoff without consuming either queue',async()=>{
  const dbName=id(),operationId=crypto.randomUUID(),legacy={id:operationId,key:essay.legacyKey,baseRevision:1,baseHash:'a'.repeat(64),baseValue:[],baseDeleted:false,value:[],deleted:false,clientUpdatedAt:'now',sequence:1};
  const marker={scope:'workspace' as const,recordId:recordId(writingMarkerKey(essay)),revision:1,contentHash:'a'.repeat(64),deleted:false,updatedAt:'now',value:{}};
  await seed(dbName,tx=>{
    put(tx,'documents',{key:essay.legacyKey,value:'[]',updatedAt:1});put(tx,'outbox',legacy);
    put(tx,'settings',{key:'syncSubmission',value:{body:'frozen',protocol:4,compressed:false,operations:[{id:operationId,key:essay.legacyKey}]} });
    put(tx,'v5Resources',marker);put(tx,'v5FieldCursors',{scope:'workspace',field:essay.field,mode:'changes',after:'',cursor:1,head:1});
  });
  const db=await openDatabase(dbName);let result;
  try{result=await prepareWritingCollection(db,essay.field);}finally{db.close();}
  assert.equal(result?.active,false);assert.equal(result?.deferred,'submission');
  assert.deepEqual((await getOutbox(dbName)).map(row=>row.id),[operationId]);
  assert.deepEqual(await getV5Outbox('workspace',dbName),[]);
  assert.equal((await getDocuments(dbName)).find(row=>row.key===essay.legacyKey)?.writingProjection,undefined);
});

test('active writing pull merges server changes into the editor projection with its cursor',async()=>{
  const dbName=id(),base={id:'essay-a',draft:{essay:'local text'},feedback:null},remote={...base,feedback:{bandEstimate:'7'}};
  const record:V5ResourceRecord={scope:'workspace',recordId:recordId(writingItemKey(essay,'essay-a')),revision:2,contentHash:'d'.repeat(64),deleted:false,updatedAt:'now',value:remote};
  await seed(dbName,tx=>{
    put(tx,'settings',{key:'v5WritingCollections',value:[essay.field]});
    put(tx,'documents',{key:essay.legacyKey,value:JSON.stringify([base]),writingProjection:true,updatedAt:1});
    put(tx,'v5Resources',{...record,revision:1,contentHash:'c'.repeat(64),value:base});
    put(tx,'v5FieldCursors',{scope:'workspace',field:essay.field,mode:'changes',after:'',cursor:1,head:1});
  });
  const updated=await commitWritingPage(openDatabase,[record],{scope:'workspace',field:essay.field,mode:'changes',after:'',cursor:2,head:2},dbName);
  const row=(await getDocuments(dbName)).find(item=>item.key===essay.legacyKey);
  assert.equal(row?.writingProjection,true);assert.deepEqual(JSON.parse(row!.value!),[remote]);
  assert.deepEqual(updated,[{key:essay.legacyKey,value:JSON.stringify([remote])},{key:'jackyun_ielts_writing_workspaces_mirror_v1',value:JSON.stringify([remote])}]);
  assert.equal((await getV5Cursor('workspace',dbName,essay.field))?.cursor,2);
  assert.equal((await getV5Resources('workspace',dbName)).find(item=>item.recordId===record.recordId)?.revision,2);
});

test('writing resource, projection and cursor roll back together when projection storage fails',async()=>{
  const dbName=id(),record:V5ResourceRecord={scope:'workspace',recordId:recordId(writingItemKey(essay,'essay-a')),revision:2,contentHash:'e'.repeat(64),deleted:false,updatedAt:'now',value:{id:'essay-a',draft:{essay:'remote'}}};
  await seed(dbName,tx=>{
    put(tx,'settings',{key:'v5WritingCollections',value:[essay.field]});
    put(tx,'documents',{key:essay.legacyKey,value:'[]',writingProjection:true,updatedAt:1});
    put(tx,'v5FieldCursors',{scope:'workspace',field:essay.field,mode:'changes',after:'',cursor:1,head:1});
  });
  const original=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args:Parameters<typeof original>){if(this.name==='documents')throw Error('Injected writing projection failure');return original.apply(this,args);};
  try{await assert.rejects(commitWritingPage(openDatabase,[record],{scope:'workspace',field:essay.field,mode:'changes',after:'',cursor:2,head:2},dbName),/Injected writing projection failure/);}
  finally{IDBObjectStore.prototype.put=original;}
  assert.equal((await getV5Cursor('workspace',dbName,essay.field))?.cursor,1);
  assert.equal((await getV5Resources('workspace',dbName)).length,0);
  assert.equal((await getV5Conflicts(dbName)).length,0);
  assert.equal((await getDocuments(dbName)).find(row=>row.key===essay.legacyKey)?.value,'[]');
});

test('remote conflict choice preserves edits made after the conflict and rebases them on the selected cloud version',async()=>{
  const dbName=id(),key=writingItemKey(essay,'essay-a'),record=recordId(key),latest={id:'essay-a',draft:{essay:'newer local'}},reviewed={id:'essay-a',draft:{essay:'reviewed local'}},remote={id:'essay-a',draft:{essay:'cloud'}};
  const conflict:V5ResourceConflict={operationId:crypto.randomUUID(),scope:'workspace',recordId:record,baseRevision:1,baseHash:'a'.repeat(64),localValue:reviewed,localDeleted:false,
    remoteValue:remote,remoteDeleted:false,remoteRevision:3,remoteHash:'c'.repeat(64),createdAt:'now'};
  await seed(dbName,tx=>{
    put(tx,'settings',{key:'v5WritingCollections',value:[essay.field]});
    put(tx,'documents',{key:essay.legacyKey,value:JSON.stringify([latest]),writingProjection:true,updatedAt:1});
    put(tx,'v5Resources',{scope:'workspace',recordId:record,revision:2,contentHash:'b'.repeat(64),deleted:false,updatedAt:'now',value:reviewed});
    put(tx,'v5Conflicts',conflict);
  });
  const updates=await resolveWritingConflictRemotely(openDatabase,conflict.operationId,dbName);
  assert.deepEqual(updates,[{key:essay.legacyKey,value:JSON.stringify([latest])},{key:'jackyun_ielts_writing_workspaces_mirror_v1',value:JSON.stringify([latest])}]);
  assert.deepEqual(await getV5Conflicts(dbName),[]);
  const [operation]=await getV5Outbox('workspace',dbName);
  assert.equal(operation.baseRevision,3);assert.equal(operation.baseHash,'c'.repeat(64));assert.deepEqual(operation.value,latest);
  assert.deepEqual((await getV5Resources('workspace',dbName)).find(row=>row.recordId===record)?.value,remote);
  assert.deepEqual(JSON.parse((await getDocuments(dbName)).find(row=>row.key===essay.legacyKey)!.value!),[latest]);
});
