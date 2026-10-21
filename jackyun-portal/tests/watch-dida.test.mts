import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { harness } from './helpers/dida-schedule-harness.mts';
import * as didaSchedule from '../src/lib/integrations/dida-schedule.ts';
import * as refs from '../src/lib/integrations/dida-task-reference.ts';
import { digest, validateOperation } from '../src/lib/watch/policy.ts';
import { mergeWatchDidaTasks } from '../src/lib/watch/snapshot.ts';
/* eslint-disable @typescript-eslint/no-unsafe-function-type -- Tests load transpiled modules through a deliberately dynamic VM boundary. */
const require=createRequire(import.meta.url),ts=require('typescript');
const account='11111111-1111-4111-8111-111111111111';
const operation='22222222-2222-4222-8222-222222222222';
function watchHarness(refuseChange=false,rows?:Record<string,unknown>[]) {
 const h=harness({refuseChange,rows});const receipts:Record<string,Record<string,unknown>>={};let failReceipt=false;
 const filters:[string,string,unknown][]=[];
 const tables:Record<string,Record<string,unknown>[]>= {
  external_accounts:[{id:account,user_id:'owner',provider:'dida365',status:'active',settings:h.getSettings()}],
  external_account_secrets:[{account_id:account,user_id:'owner',encrypted_access_token:'encrypted'}],
 };
 const db={from:(table:string)=>{
  const criteria:[string,unknown][]=[];let insert:Record<string,unknown>|undefined,update:Record<string,unknown>|undefined;
  const selected=()=> (table==='watch_operation_receipts'?Object.values(receipts):tables[table]??[]).filter(row=>criteria.every(([key,value])=>row[key]===value));
  const execute=()=>{
   if(insert){const key=String(insert.operation_id);if(receipts[key])return {error:{code:'23505'},data:null};receipts[key]={...insert};}
   if(update){if(failReceipt){failReceipt=false;return {error:{code:'TEST'},data:null};}for(const row of selected())Object.assign(row,update);}
   return {error:null,data:selected()};
  };
  const query={select:()=>query,eq:(key:string,value:unknown)=>{criteria.push([key,value]);filters.push([table,key,value]);return query;},limit:()=>query,insert:(row:Record<string,unknown>)=>{insert=row;return query;},update:(row:Record<string,unknown>)=>{update=row;return query;},maybeSingle:async()=>({data:selected()[0]??null,error:null}),then:(resolve:(value:unknown)=>void)=>resolve(execute())};return query;
 }};
 const ApiError=h.DidaApiError;
 const exports:Record<string,Function>={};const code=ts.transpileModule(readFileSync(new URL('../src/lib/watch/dida-tasks.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mocks:Record<string,unknown>={'server-only':{},'@/lib/integrations/dida-sync-service':h.service,'@/lib/integrations/dida-task-reference':refs,'@/lib/integrations/dida365-server':{DidaApiError:ApiError},'./policy':{digest},'@/lib/integrations/dida-schedule':didaSchedule};
 new Function('require','exports',code)((name:string)=>mocks[name]??(()=>{throw Error(name)})(),exports);
 const value=(completed=true,version=refs.didaTaskVersion(h.task,'p'),id=operation)=>({operationId:id,kind:'task',targetId:refs.didaTarget(account,'p','task'),version,details:{completed}});
 return {...h,db,receipts,filters,watch:exports,value,failNextReceipt:()=>{failReceipt=true;}};
}
test('native task envelopes accept Dida references but never for notifications',()=>{
 const h=watchHarness();const value=h.value();assert.deepEqual(validateOperation(value),{completed:true});
 assert.throws(()=>validateOperation({...value,kind:'notification'}));assert.throws(()=>validateOperation({...value,version:'2026-10-14T00:00:00Z'}));
 assert.equal(refs.parseDidaTarget('dida:'+account+':../project:task'),undefined);
});
test('selected Dida tasks are returned with stable references and native-compatible fields',async()=>{
 const h=watchHarness();const result=await h.watch.watchDidaSnapshot(h.db,'owner','2026-10-14');
 assert.equal(result.tasks.length,1);assert.equal(result.tasks[0].id,h.value().targetId);assert.equal(result.tasks[0].title,'滴答 · Own task');assert.equal(result.tasks[0].date,'2026-10-14');assert.ok(refs.isDidaVersion(result.tasks[0].version));
 const foreign=await h.watch.watchDidaSnapshot(h.db,'other-user','2026-10-14');assert.equal(foreign.tasks.length,0);
});
test('watch completes, reopens and acknowledges a repeated operation exactly once',async()=>{
 const h=watchHarness();const value=h.value();const first=await h.watch.applyWatchDidaOperation(h.db,'owner',value,value.details);assert.equal(first.ok,true);assert.equal(h.task.status,2);
 const count=h.calls.length;assert.deepEqual(await h.watch.applyWatchDidaOperation(h.db,'owner',value,value.details),first);assert.equal(h.calls.length,count);
 const undo=h.value(false,first.version,'33333333-3333-4333-8333-333333333333');await h.watch.applyWatchDidaOperation(h.db,'owner',undo,undo.details);assert.equal(h.task.status,0);
});
test('receipt content cannot be changed by reusing its operation ID',async()=>{
 const h=watchHarness();const value=h.value();await h.watch.applyWatchDidaOperation(h.db,'owner',value,value.details);
 await assert.rejects(()=>h.watch.applyWatchDidaOperation(h.db,'owner',{...value,details:{completed:false}},{completed:false}),/编号/);
 assert.equal(h.task.status,2);
});
test('a stale remote version cannot overwrite a newer different state',async()=>{
 const h=watchHarness();const value=h.value();h.task.content='Changed remotely';await assert.rejects(()=>h.watch.applyWatchDidaOperation(h.db,'owner',value,value.details),/已改变/);assert.equal(h.task.status,0);
});
test('lost receipt response can be retried without repeating a completed remote mutation',async()=>{
 const h=watchHarness();const value=h.value();h.failNextReceipt();await assert.rejects(()=>h.watch.applyWatchDidaOperation(h.db,'owner',value,value.details),/回执/);assert.equal(h.task.status,2);
 await h.watch.applyWatchDidaOperation(h.db,'owner',value,value.details);assert.equal(h.calls.filter(call=>call.path.endsWith('/complete')).length,1);
});
test('different users and disabled synchronization cannot mutate remote tasks',async()=>{
 const h=watchHarness();const value=h.value();await assert.rejects(()=>h.watch.applyWatchDidaOperation(h.db,'other-user',value,value.details),/不可用/);assert.equal(h.calls.length,0);
 h.getSettings().syncProjectIds=[];await assert.rejects(()=>h.watch.applyWatchDidaOperation(h.db,'owner',value,value.details),/同步清单/);assert.equal(h.task.status,0);
});
test('unconfirmed remote completion leaves a pending receipt and rejects success',async()=>{
 const h=watchHarness(true);const value=h.value();await assert.rejects(()=>h.watch.applyWatchDidaOperation(h.db,'owner',value,value.details),/尚未确认/);assert.deepEqual(h.receipts[operation].result,{});
});
test('Dida agenda rows coexist with lessons and internal tasks, including no timetable',()=>{
 const task={id:'dida',title:'Read',completed:false,version:'opaque',date:'2026-10-13',start:'',minutes:0,subject:'滴答',detail:'',source:'dida365'};
 const result=mergeWatchDidaTasks({tasks:[{id:'local'}],agenda:[{id:'local-agenda',date:'2026-10-14'}],lessons:[{id:'lesson'}]},{tasks:'ready',agenda:'ready'},[task],new Date('2026-10-14T04:00:00Z'));
 assert.equal((result.tasks as unknown[]).length,2);assert.equal((result.agenda as {date:string}[])[1].date,'2026-10-14');assert.deepEqual(result.lessons,[{id:'lesson'}]);
 const modules={tasks:'not_synced',agenda:'not_synced'};mergeWatchDidaTasks({},modules,[task],new Date('2026-10-14T04:00:00Z'));assert.equal(modules.tasks,'ready');assert.equal(modules.agenda,'ready');
});
test('watch gateway routes external task operations to Dida and keeps the internal RPC',async()=>{
 const h=watchHarness();let localWrites=0;const route:Record<string,Function>={};
 class WatchError extends Error {status:number;code:string;constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;}}
 const mocks:Record<string,unknown>={
  '@/lib/watch/server':{WatchError,body:(req:Request)=>req.json(),watchContext:async()=>({supabase:{...h.db,rpc:async()=>{localWrites++;return {data:{ok:true},error:null};}},user:{id:'owner'}}),fail:(status:number,code:string,message:string)=>{throw new WatchError(status,code,message);}},
  '@/lib/watch/reader':{},'@/app/api/llm-proxy/route':{},'next/server':{},'@/lib/ai-smart-selection':{},'@/lib/watch/snapshot':{},
  '@/lib/watch/policy':{digest,validateOperation,UUID:/^[a-f0-9-]{36}$/},'@/lib/integrations/dida-task-reference':refs,'@/lib/watch/dida-tasks':h.watch,'@/lib/integrations/dida365-server':{DidaApiError:h.DidaApiError},
 };
 const code=ts.transpileModule(readFileSync(new URL('../src/app/api/watch/v1/[...action]/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',code)((name:string)=>mocks[name]??(()=>{throw Error(name)})(),route);
 const send=(value:Record<string,unknown>)=>route.POST(new Request('http://watch.test/api/watch/v1/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}),{params:Promise.resolve({action:['operations']})});
 assert.equal((await send(h.value())).status,200);assert.equal(h.task.status,2);assert.equal(localWrites,0);
 assert.equal((await send({operationId:operation,kind:'task',targetId:account,version:'2026-10-14T00:00:00Z',details:{completed:true}})).status,200);assert.equal(localWrites,1);
 assert.equal((await send({...h.value(),version:'bad'})).status,422);
 const undo=h.value(false,refs.didaTaskVersion({...h.task,content:'old'},'p'),'44444444-4444-4444-8444-444444444444');assert.equal((await send(undo)).status,409);assert.equal(h.task.status,2);
});
test('a deleted remote task produces a permanent conflict instead of endless retries',async()=>{
 const exports:Record<string,Function>={};const code=ts.transpileModule(readFileSync(new URL('../src/lib/integrations/dida365-server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports','fetch',code)((name:string)=>name==='server-only'?{}:{DIDA365_API_BASE:'https://api.dida365.com/open/v1'},exports,async()=>new Response('',{status:404}));
 await assert.rejects(()=>exports.didaRequest('not-disclosed','/project/p/task/deleted'),(error:unknown)=>(error as {status:number}).status===404);
});

test('watch preserves parent context, inherited dates and only unfinished checklist contents',async()=>{
 const h=watchHarness(false,[{id:'parent',projectId:'p',title:'Parent',status:0,startDate:'2026-10-15T00:00:00+0800',isAllDay:true},{id:'task',projectId:'p',title:'Child',parentId:'parent',status:0,items:[{id:'a',title:'Pending item',status:0},{id:'b',title:'Completed item',status:1}]},{id:'done',projectId:'p',title:'Completed task',status:2}]);
 const result=await h.watch.watchDidaSnapshot(h.db,'owner','2026-10-14');assert.equal(result.tasks.length,2);const child=result.tasks.find((task:{title:string})=>task.title==='滴答 · Child');assert.equal(child.date,'2026-10-15');assert.match(child.detail,/所属任务：Parent/);assert.match(child.detail,/Pending item/);assert.doesNotMatch(child.detail,/Completed item/);
});
