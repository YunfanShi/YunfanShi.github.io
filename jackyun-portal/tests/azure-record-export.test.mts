import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createAzureRecordClient } from '../src/lib/sync/azure-records.ts';
import { canonicalJson } from '../src/lib/sync/hash.ts';
import { splitSyncBody, joinSyncParts } from '../src/lib/sync/transfer.ts';
import { createSyncApi } from '../azure/backend/sync-api.mjs';

const endpoint = 'https://jackyun-sync-9d26b2cc.azurewebsites.net';
const sub = '00000000-0000-4000-8000-000000000001';
const device = '00000000-0000-4000-8000-000000000002';
const token = `signed.${Buffer.from(JSON.stringify({ session_id:device })).toString('base64url')}.by-server`;
const time = '2026-10-08T00:00:00Z';
const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const row = (key: string, value: unknown = { current:true }, revision = 1, large = false) => ({ key,value,revision,large,deleted:false,contentHash:hash(value),updatedAt:time });
const response = (data: unknown, status = 200) => Response.json(data,{status});
const path = (input: RequestInfo | URL) => new URL(String(input));

test('export paginates beyond 500 equal timestamps, skips blocked keys and uses the user context',async()=>{
  const rows = Array.from({length:530},(_,i)=>({storage_key:`azure_backend_export_${String(i).padStart(4,'0')}`,
    storage_value:{index:i},revision:1,content_hash:hash({index:i}),deleted_at:null,updated_at:time,client_updated_at:time,large:false}));
  rows.push(...Array.from({length:30},(_,i)=>({...rows[0],storage_key:`azure_backend_debug_${String(i).padStart(4,'0')}`})));
  rows.sort((a,b)=>Buffer.compare(Buffer.from(a.storage_key),Buffer.from(b.storage_key)));
  let queries=0;
  const identity={sub,session_id:device,role:'authenticated'};
  const database={async withUser(actual: typeof identity, work: (client: object)=>unknown, options: {write:boolean}){
    assert.deepEqual(actual,identity); assert.equal(options.write,false);
    return work({async query(sql: string, args: string[]){
      queries++; assert.match(sql,/WHERE user_id=\$1/);assert.equal(args[0],sub);
      return {rows:rows.filter(r=>Buffer.compare(Buffer.from(r.storage_key),Buffer.from(args[1]))>0).slice(0,21)};
    }});
  }};
  const handle=createSyncApi(database);
  const client=createAzureRecordClient({endpoint,token,fetchImpl:async(input,options)=>{
    assert.equal(new Headers(options?.headers).get('authorization'),`Bearer ${token}`);
    assert.equal(new Headers(options?.headers).get('cookie'),null);
    assert.equal(options?.cache,'no-store');assert.equal(options?.redirect,'error');
    return response(await handle('GET',path(input),null,identity));
  }});
  const records=await client.list();
  assert.equal(records.length,530); assert.equal(new Set(records.map(r=>r.key)).size,530);
  assert.equal(records.at(-1)?.key,'azure_backend_export_0529');assert.ok(queries>26);
});

test('large Unicode export reloads a changed revision and verifies the complete value',async()=>{
  const key='azure_backend_export_large',value={text:'学习📚'.repeat(90000)};
  const parts=splitSyncBody(JSON.stringify(value));let chunks=0;let listings=0;
  const client=createAzureRecordClient({endpoint,token,fetchImpl:async input=>{
    const url=path(input);
    if(url.pathname==='/api/sync/export'){listings++;return response({ok:true,records:[row(key,listings===1?null:value,listings===1?1:2,true)],next:null});}
    if(url.pathname==='/api/sync/v2')return response({ok:true,records:[row(key,value,2,true)]});
    chunks++;
    if(url.searchParams.get('revision')==='1')return response({ok:false},409);
    const part=Number(url.searchParams.get('part'));
    return response({ok:true,revision:2,part,count:parts.length,data:parts[part]});
  }});
  const [actual]=await client.list();
  assert.equal(actual.revision,2);assert.deepEqual(actual.value,value);assert.equal(chunks,parts.length+1);
});

test('count-only and page-filtered reads avoid downloading unrelated large values',async()=>{
  let calls=0;
  const client=createAzureRecordClient({endpoint,token,fetchImpl:async input=>{
    calls++;assert.equal(path(input).pathname,'/api/sync/export');
    return response({ok:true,records:[row('azure_backend_export_large',null,1,true)],next:null});
  }});
  assert.equal((await client.list({values:false})).length,1);
  assert.deepEqual(await client.list({include:()=>false}),[]);assert.equal(calls,3);
});

test('large imports keep one operation ID, use current metadata, and preserve Unicode through chunks',async()=>{
  const key='azure_backend_import_large',value={text:'恢复📚'.repeat(110000)},parts:string[]=[];
  const client=createAzureRecordClient({endpoint,token,fetchImpl:async(input,options)=>{
    const url=path(input);
    if(options?.method==='GET')return response({ok:true,records:[row(key,null,7,true)]});
    const body=JSON.parse(String(options?.body));
    assert.equal(url.pathname,'/api/sync/v2/large');
    if(!body.complete){parts[body.index]=body.data;return response({ok:true});}
    const upload=joinSyncParts(parts) as {deviceId:string;operations:{id:string;key:string;baseRevision:number;baseValue:unknown;value:unknown}[]};
    assert.equal(upload.deviceId,device);assert.equal(upload.operations[0].id,body.uploadId);
    assert.equal(upload.operations[0].baseRevision,7);assert.equal(upload.operations[0].baseValue,null);
    assert.deepEqual(upload.operations[0].value,value);
    return response({ok:true,applied:[{operationId:body.uploadId,key,revision:8,contentHash:hash(value),updatedAt:time}],remote:[],conflicts:[]});
  }});
  const actual=await client.write(key,value);
  assert.equal(actual.revision,8);assert.deepEqual(actual.value,value);assert.ok(parts.length>1);
});

test('unconfirmed writes and unavailable Azure never acknowledge an import or fall back',async()=>{
  const value={keep:true};let mutations=0;
  const client=createAzureRecordClient({endpoint,token,fetchImpl:async(input,options)=>{
    assert.equal(path(input).origin,endpoint);
    if(options?.method==='GET')return response({ok:true,records:[]});
    mutations++;return response({ok:true,applied:[],remote:[row('azure_backend_import')],conflicts:[]});
  }});
  await assert.rejects(client.write('azure_backend_import',value),/导入未确认/);
  assert.deepEqual(value,{keep:true});assert.equal(mutations,1);
  const unavailable=createAzureRecordClient({endpoint,token,fetchImpl:async()=>response({},503)});
  await assert.rejects(unavailable.write('azure_backend_import',value),/503/);
});

test('malformed cursor, chunk hash and an untrusted destination fail closed',async()=>{
  assert.throws(()=>createAzureRecordClient({endpoint:'https://attacker.example',token}),/配置无效/);
  const cursor=createAzureRecordClient({endpoint,token,fetchImpl:async()=>response({ok:true,records:[],next:'stuck'})});
  await assert.rejects(cursor.list(),/游标无效/);
  const corrupt=createAzureRecordClient({endpoint,token,fetchImpl:async input=>path(input).pathname==='/api/sync/export'
    ? response({ok:true,records:[row('azure_backend_export_large',null,1,true)],next:null})
    : response({ok:true,revision:1,part:0,count:1,data:Buffer.from('"bad"').toString('base64')})});
  await assert.rejects(corrupt.list(),/内容校验失败/);
});

 test('a changing export never returns a successful mixed-revision backup',async()=>{
  let revision=0;
  const client=createAzureRecordClient({endpoint,token,fetchImpl:async()=>response({ok:true,records:[row('azure_backend_export_changing',{},++revision)],next:null})});
  await assert.rejects(client.list(),/备份未完成/);assert.equal(revision,6);
});

test('delete acknowledgments preserve tombstones and reject a different content hash',async()=>{
  let corrupt=false;
  const client=createAzureRecordClient({endpoint,token,fetchImpl:async(_input,options)=>{
    if(options?.method==='GET')return response({ok:true,records:[row('azure_backend_import_delete',{},5)]});
    const op=JSON.parse(String(options?.body)).operations[0];assert.equal(op.deleted,true);assert.equal(op.value,null);
    return response({ok:true,applied:[{operationId:op.id,key:op.key,revision:6,contentHash:corrupt?hash('wrong'):createHash('sha256').update('__deleted__').digest('hex'),updatedAt:time}],remote:[],conflicts:[]});
  }});
  const r=await client.write('azure_backend_import_delete',null,true);assert.equal(r.deleted,true);assert.equal(r.value,null);
  corrupt=true;await assert.rejects(client.write('azure_backend_import_delete',null,true),/导入未确认/);
});
