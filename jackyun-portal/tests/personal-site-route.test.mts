import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const owner='665c8c30-9f8a-4571-a372-47ccbd6edf22';
const compiled=ts.transpileModule(readFileSync(new URL('../src/app/api/personal-sites/route.ts',import.meta.url),'utf8'),{
  fileName:'route.ts',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function fixture(userId:string|null=owner,readError=false){
  let queries=0,verified=0;
  const rows=[{id:'source-site',name:'Synthetic site',definition:{fixture:true},updated_at:'2026-10-27'}];
  const exports={} as {GET:(request:Request)=>Promise<Response>};
  const supabase={from(table:string){
    queries++;assert.equal(table,'personal_sites');
    return {select(){return {eq(column:string,value:string){
      assert.equal(column,'user_id');assert.equal(value,owner);
      return {order:async()=>({data:rows,error:readError?{message:'private SQL detail'}:null})};
    }}}};
  }};
  runInNewContext(compiled,{exports,require(name:string){
    if(name==='next/server')return {NextResponse:Response};
    if(name==='@/lib/supabase/server')return {createClient:async()=>supabase};
    if(name==='@/lib/supabase/verified-user')return {getVerifiedUser:async(client:unknown)=>{assert.equal(client,supabase);verified++;return {data:{user:userId?{id:userId}:null},error:null};}};
    if(name==='@/lib/personal-site')return {validatePersonalSite(){throw Error('not a read-path operation');}};
    throw Error(`unexpected route dependency: ${name}`);
  },Response,console});
  return {get:exports.GET,counts:()=>({queries,verified})};
}

test('legacy site source GET binds the response to the verified owner and disables caching',async()=>{
  const route=fixture();
  const response=await route.get(new Request('https://portal.invalid/api/personal-sites',{headers:{'X-Sync-Account':owner}}));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await response.json()).ownerId,owner);
  assert.deepEqual(route.counts(),{queries:1,verified:1});
});
test('an account mismatch or unauthenticated source request never queries another owners sites',async()=>{
  const changed=fixture();
  assert.equal((await changed.get(new Request('https://portal.invalid/api/personal-sites',{headers:{'X-Sync-Account':crypto.randomUUID()}}))).status,409);
  assert.equal(changed.counts().queries,0);
  const guest=fixture(null);
  assert.equal((await guest.get(new Request('https://portal.invalid/api/personal-sites'))).status,401);
  assert.equal(guest.counts().queries,0);
});
test('a failed source query does not expose SQL detail or a successful empty migration snapshot',async()=>{
  const route=fixture(owner,true);
  const response=await route.get(new Request('https://portal.invalid/api/personal-sites'));
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'Legacy site backup unavailable');
});
