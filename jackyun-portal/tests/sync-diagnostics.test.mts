import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {sanitizeSyncDiagnostic,syncDiagnosticError} from '../src/lib/sync/diagnostics.ts';

const report = {version:'3.40.1',phase:'cycle',errorName:'QuotaExceededError',status:null,online:true};
test('diagnostics retain storage exhaustion evidence while excluding private payloads',()=>{
  const result=sanitizeSyncDiagnostic({...report,storageUsage:1234,storageQuota:5678,
    message:'private learning content',stack:'Bearer secret',token:'secret',key:'private key',value:{private:true}});
  assert.deepEqual(result,{...report,storageUsage:1234,storageQuota:5678});
  assert.equal(sanitizeSyncDiagnostic({...report,errorName:'Bearer secret'}),null);
  assert.equal(sanitizeSyncDiagnostic({...report,status:NaN}),null);
  assert.equal(sanitizeSyncDiagnostic({...report,status:1000}),null);
  assert.equal(sanitizeSyncDiagnostic({...report,version:'private content'}),null);
  assert.equal(sanitizeSyncDiagnostic({...report,phase:'private content'}),null);
});
test('DOM errors are reported without serializing their message or stack',()=>{
  assert.deepEqual(syncDiagnosticError(new DOMException('private value','QuotaExceededError')),
    {errorName:'QuotaExceededError',status:null});
  assert.deepEqual(syncDiagnosticError({name:'SyncProtocolError',status:503,message:'private'}),
    {errorName:'SyncProtocolError',status:503});
});

const source=ts.transpileModule(readFileSync(new URL('../src/app/api/sync/diagnostics/route.ts',import.meta.url),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(authenticated=true) {
  const exports:Record<string,unknown>={},logs:string[]=[];
  const modules:Record<string,unknown>={
    'next/server':{NextResponse:Response},
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:authenticated?{id:'test-user'}:null},error:null})}})},
    '@/lib/sync/diagnostics':{sanitizeSyncDiagnostic},
    '@/lib/api-response':{requestIdFrom:()=> 'test-request'},
  };
  vm.runInNewContext(source,{exports,require:(name:string)=>modules[name],TextDecoder,
    console:{warn:(...args:unknown[])=>logs.push(args.join(' '))}});
  const post=exports.POST as (request:Request)=>Promise<Response>;
  return {logs,post:(body:string,headers:Record<string,string>={})=>post(Object.assign(new Request('https://jackyun.top/api/sync/diagnostics',{
    method:'POST',headers:{'Content-Type':'application/json',...headers},body}),{nextUrl:new URL('https://jackyun.top/api/sync/diagnostics')}))};
}
test('report endpoint logs only verified and sanitized evidence and rate limits repeat delivery',async()=>{
  const f=fixture();
  assert.equal((await f.post(JSON.stringify({...report,message:'private payload',token:'secret'}))).status,204);
  assert.equal(f.logs.length,1);
  assert.ok(f.logs[0].includes('QuotaExceededError'));
  assert.ok(!f.logs[0].includes('private payload')&&!f.logs[0].includes('secret'));
  assert.equal((await f.post(JSON.stringify(report))).status,429);
  assert.equal((await fixture(false).post(JSON.stringify(report))).status,401);
});
test('report endpoint bounds a streamed body even without content length and rejects foreign origins',async()=>{
  assert.equal((await fixture().post('x'.repeat(2049))).status,413);
  assert.equal((await fixture().post(JSON.stringify(report),{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await fixture().post('{')).status,400);
});
