import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { validateSession } from '../src/lib/learning/practice-timer.ts';
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-function-type -- VM fixture mirrors untyped browser bridge globals. */
const require=createRequire(import.meta.url),ts=require('typescript');
test('Schedule bridge keeps offline checkpoints private and only exits on confirmed other owner',async()=>{
 const effects:Function[]=[],messages:any[]=[],handlers:Record<string,Function>={},storage=new Map<string,string>();let now=1000,status=503,owner='device',writes=0;
 const source={postMessage:(m:any)=>messages.push(m)},window={addEventListener:(name:string,fn:Function)=>{handlers[name]=fn;},removeEventListener:()=>{},dispatchEvent:()=>{}};
 const state:any={practiceSessions:[],practiceTimerConfig:undefined};const mocks:any={react:{useRef:()=>({current:{contentWindow:source}}),useState:()=>[false,()=>{}],useEffect:(fn:Function)=>effects.push(fn)},'react/jsx-runtime':{jsx:()=>null},'@/lib/learning/workspace-reader':{readScheduleState:()=>state,SCHEDULE_STORAGE_KEY:'schedule'},'@/lib/learning/practice-timer':{validateSession,applyPracticeSession:(s:any,session:any)=>({...s,practiceSessions:[session]})},'@/lib/sync/merge':{},'@/lib/sync/local-edit':{parseLocalValue:()=>({}),createLocalEditWriter:()=>({reset:()=>{},write:async()=>{writes++;}})},'@/lib/local-workspace':{CLOUD_STATE_APPLIED_EVENT:'cloud'}};
 const exports:any={};const code=ts.transpileModule(readFileSync('src/components/modules/schedule/practice-timer-frame.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports','window','localStorage','navigator','location','fetch','Date',code)((name:string)=>mocks[name],exports,window,{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)},{},{origin:'https://timer.test'},async()=>new Response(JSON.stringify({ownerId:owner}),{status}),{now:()=>now});exports.default();for(const effect of effects)effect();
 const session={id:'session',date:'2026-10-15',subject:'Physics',source:'B',independent:true,scope:'Test',mode:'normal',index:0,updatedAt:now,finished:false,questions:[{id:'q',name:'Q1',typeId:'t',typeName:'Type',limitSeconds:60,elapsedMs:42000,startedAt:now,result:'pending',blocked:false,node:'',cause:'',retest:''}]};
 const send=async(id:number)=>{handlers.message({origin:'https://timer.test',source,data:{type:'practice-save',requestId:id,controllerId:'device',session}});await new Promise(r=>setTimeout(r,10));};
 await send(1);assert.equal(messages.at(-1).localOnly,true);assert.equal(writes,0);assert.equal(JSON.parse(storage.get('jackyun_debug_unsaved_edit:practice-timer:session')!).session.questions[0].elapsedMs,42000);
 now+=5000;status=200;await send(2);assert.equal(messages.at(-1).localOnly,true);now+=6000;await send(3);assert.equal(writes,1);assert.equal(messages.at(-1).type,'practice-saved');owner='another-device';await send(4);assert.equal(messages.at(-1).type,'practice-control-lost');assert.equal(writes,1);assert.equal(messages.some(m=>m.type==='practice-error'),false);
});
