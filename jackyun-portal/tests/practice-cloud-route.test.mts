import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { getVerifiedUser } from '../src/lib/supabase/verified-user.ts';
import { validateSession, validateConfig } from '../src/lib/learning/practice-timer.ts';
/* eslint-disable @typescript-eslint/no-explicit-any -- Route fixture stubs the Supabase RPC boundary dynamically. */
const require=createRequire(import.meta.url),ts=require('typescript');
function harness(signedIn=true,authError?:{name:string;status?:number}){let rpcName='',calls=0,conflict=false,fail=false;const output:any={};const client={auth:{getClaims:async()=>({data:signedIn?{claims:{sub:'owner',role:'authenticated',exp:Date.now()/1000+3600}}:null,error:authError})},rpc:async(_name:string,args:any)=>{rpcName=_name;calls++;return fail?{error:{message:'internal secret'},data:null}:{error:null,data:conflict?{conflict:'LOST_CONTROL'}:{revision:1,...args}};}};const code=ts.transpileModule(readFileSync('src/app/api/practice-timer/live/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)((name:string)=>name.includes('supabase/server')?{createClient:async()=>client}:{validateSession,validateConfig,getVerifiedUser},output);return{output,rpcName:()=>rpcName,calls:()=>calls,conflict:()=>{conflict=true;},fail:()=>{fail=true;}};}
const id='11111111-1111-4111-8111-111111111111';
const request=(body:any,origin='http://timer.test')=>new Request('http://timer.test/api/practice-timer/live',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)});
test('cloud timer requires sign in and never trusts client user identifiers',async()=>{const h=harness(false);assert.equal((await h.output.GET()).status,401);assert.equal(h.calls(),0);});
test('claims require a valid owner and session reference',async()=>{const h=harness();assert.equal((await h.output.POST(request({action:'claim',owner:'bad',sessionId:'session'}))).status,400);assert.equal(h.calls(),0);const result=await h.output.POST(request({action:'claim',owner:id,sessionId:'session',userId:'other'}));assert.equal(result.status,200);assert.equal((await result.json()).p_owner,id);assert.equal(h.calls(),1);});
test('cross origin mutations and malformed saves cannot reach the database',async()=>{const h=harness();assert.equal((await h.output.POST(request({action:'claim',owner:id,sessionId:'s'},'https://other.test'))).status,403);assert.equal((await h.output.POST(request({action:'save',owner:id,token:id,revision:0,payload:{}}))).status,400);assert.equal(h.calls(),0);});
test('server conflicts are explicit and service errors never expose raw database details',async()=>{const h=harness();h.conflict();const conflict=await h.output.POST(request({action:'touch',owner:id,token:id}));assert.equal(conflict.status,409);assert.deepEqual(await conflict.json(),{conflict:'LOST_CONTROL',code:'JY-2103',message:'另一设备已接管，本设备已退出计时。',handled:true});h.fail();const response=await h.output.GET();assert.equal(response.status,503);assert.equal(JSON.stringify(await response.json()).includes('internal secret'),false);assert.equal(response.headers.get('cache-control'),'private, no-store');});

test('authentication outages never downgrade a signed-in timer to guest mode',async()=>{const h=harness(false,{name:'AuthRetryableFetchError',status:0});assert.equal((await h.output.GET()).status,503);assert.equal(h.calls(),0);const guest=harness(false,{name:'AuthSessionMissingError',status:400});assert.equal((await guest.output.GET()).status,401);});

test('ownership polling selects metadata only, while mutations use compact database responses',async()=>{
 const h=harness();await h.output.GET(new Request('http://timer.test/api/practice-timer/live?status=1'));
 assert.equal(h.rpcName(),'practice_timer_status');await h.output.GET();assert.equal(h.rpcName(),'practice_timer_control_compact');
});
