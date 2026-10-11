/* eslint-disable @typescript-eslint/no-explicit-any -- Execute actual server actions against a stateful transport fixture. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {canonicalJson} from '../src/lib/sync/hash.ts';
const require=createRequire(import.meta.url),ts=require('typescript');
function fixture(){
 let units:any[]=[{name:'unit',steps:[{label:'Read',done:false}]}];let color='blue';let timestamp='v1';let changeDuringRead=false;
 const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from:()=>{
  let update:any,read=false,insert=false;const filters=new Map<string,unknown>();
  const builder:any={select:()=>{if(!update&&!insert)read=true;return builder;},eq:(k:string,v:unknown)=>{filters.set(k,v);return builder;},update:(v:unknown)=>{update=v;return builder;},insert:(v:unknown)=>{update=v;insert=true;return builder;},single:async()=>{const result={data:{units:structuredClone(units),updated_at:timestamp}};if(changeDuringRead){units=[...units,{name:'other',steps:[]}];timestamp='v2';}return result;},then:(resolve:any)=>{
   if(read)return resolve({data:[]});
   if(insert)return resolve({error:{message:'duplicate subject'},data:null});
   const mismatch=(filters.has('units')&&filters.get('units')!==JSON.stringify(units))||(filters.has('updated_at')&&filters.get('updated_at')!==timestamp)||(filters.has('color')&&filters.get('color')!==color);
   if(mismatch)return resolve({data:[],error:null});units=structuredClone(update.units);timestamp='v3';return resolve({data:[{id:'subject'}],error:null});
  }};return builder;
 }};
 const source=readFileSync(new URL('../src/actions/study.ts',import.meta.url),'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports:any={};runInNewContext(output,{exports,require:(name:string)=>name.includes('supabase/server')?{createClient:async()=>db}:name==='next/cache'?{revalidatePath:()=>{}}:name==='react'?{cache:(work:any)=>work}:{canonicalJson},Date,JSON,Error});
 return {actions:exports,get units(){return units;},get color(){return color;},get baseline(){return structuredClone(units);},recolor(){color='red';},concurrent(){changeDuringRead=true;}};
}
test('actual study action rejects a stale full syllabus instead of overwriting concurrent units',async()=>{
 const f=fixture(),original=f.baseline;await assert.rejects(f.actions.upsertSubject('math','blue',[],[],'blue'),/另一台设备/);assert.deepEqual(f.units,original);
});

test('color-only concurrent changes cannot be overwritten by a stale units edit',async()=>{
 const f=fixture(),original=f.baseline;f.recolor();await assert.rejects(f.actions.upsertSubject('math','blue',[...original,{name:'new',steps:[]}],original,'blue'),/另一台设备/);assert.equal(f.color,'red');assert.deepEqual(f.units,original);
});
test('actual step action rejects a change between its read and conditional write',async()=>{
 const f=fixture(),original=f.baseline;f.concurrent();await assert.rejects(f.actions.updateStepDone('math',0,0,true,original),/另一台设备/);assert.equal(f.units.length,2);assert.equal(f.units[0].steps[0].done,false);
});
