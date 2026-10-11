import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {persistLocalEditNow} from '../src/lib/sync/local-edit.ts';
import {canonicalJson} from '../src/lib/sync/hash.ts';
import {threeWayMerge} from '../src/lib/sync/merge.ts';
import {writeRedundantJson} from '../src/lib/ielts-writing.ts';
function statements(file:string,name:string){const source=ts.createSourceFile(file,readFileSync(new URL(file,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const component=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name) as ts.FunctionDeclaration;return component.body!.statements;}
function execute(code:string,context:Record<string,unknown>){return runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);}
function storage(){const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};}
const globals={persistLocalEditNow,canonicalJson,threeWayMerge,writeRedundantJson,Date,JSON,Error,queueMicrotask:(work:()=>void)=>work()};
test('actual writing handlers and timer effect retain another tab independent draft field',()=>{
 for(const failMirror of [false,true]) {
 const nodes=statements('../src/components/modules/ielts/writing-workbench.tsx','WritingWorkbench');const handler=nodes.filter(n=>ts.isFunctionDeclaration(n)&&['persistDraft','commitDraft'].includes(n.name?.text??'')).map(n=>n.getText()).join('\n');
 const effect=nodes.find(n=>n.getText().includes('useEffect(() =>')&&n.getText().includes('const previous=draftBase'))!.getText();
 const base={essayId:'one',task:'task2',question:'base',essay:'base',originalEssay:'',secondsLeft:2400,timerStarted:false};
 const localStorage=storage(),write=localStorage.setItem;localStorage.setItem=(k,v)=>{if(failMirror&&k==='mirror')throw Error('mirror full');write(k,v);};localStorage.setItem('draft',JSON.stringify({...base,question:'other tab'}));const ctx:Record<string,unknown>={...globals,localStorage,DRAFT_KEY:'draft',MIRROR_KEY:'mirror',SNAPSHOTS_KEY:'snapshots',draftBase:{current:base},hydrated:true,draft:base,setSaveState:()=>{},setMessage:()=>{},useEffect:(work:()=>void)=>work()};ctx.setDraft=(next:unknown)=>{ctx.draft=typeof next==='function'?next(ctx.draft):next;};
 execute(handler+'\ncommitDraft('+JSON.stringify({...base,essay:'new essay'})+');',ctx);execute(effect,ctx);
 assert.deepEqual(JSON.parse(localStorage.getItem('draft')!),{...base,essay:'new essay',question:'other tab'});assert.equal((ctx.draft as typeof base).question,'other tab');
 }
});
test('actual IELTS cycle persistence reflects a merge before a subsequent edit',()=>{
 const nodes=statements('../src/components/modules/ielts/ielts-cycle-board.tsx','IeltsCycleBoard');const effect=nodes.find(n=>n.getText().includes('useEffect(() =>')&&n.getText().includes('const merged=persistLocalEditNow(localStorage,STORAGE_KEY'))!.getText();
 const base={cycle:1,modules:{reading:{note:'base'},writing:{note:'base'}}},localStorage=storage();localStorage.setItem('cycle',JSON.stringify({cycle:1,modules:{reading:{note:'other tab'},writing:{note:'base'}}}));
 const ctx:Record<string,unknown>={...globals,localStorage,STORAGE_KEY:'cycle',cycleBase:{current:base},cycle:{cycle:1,modules:{reading:{note:'base'},writing:{note:'first edit'}}},setNotice:()=>{},useEffect:(work:()=>void)=>work()};ctx.setCycle=(next:unknown)=>{ctx.cycle=typeof next==='function'?next(ctx.cycle):next;};
 execute(effect,ctx);const cycle=ctx.cycle as typeof base;assert.equal(cycle.modules.reading.note,'other tab');ctx.cycle={...cycle,modules:{...cycle.modules,writing:{note:'second edit'}}};execute(effect,ctx);
 assert.equal(JSON.parse(localStorage.getItem('cycle')!).modules.reading.note,'other tab');
});
