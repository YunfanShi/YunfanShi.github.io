import assert from 'node:assert/strict';
import test from 'node:test';
import {gzipSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {IDBFactory} from 'fake-indexeddb';
import {device,remote,server,key} from './sync-engine-fixture.mts';
import {threeWayMerge} from '../src/lib/sync/merge.ts';
import {compactSyncOperations} from '../src/lib/sync/batch.ts';
import {reconcileAcknowledgment} from '../src/lib/sync/acknowledgment.ts';
import {splitCompressedSyncBody,decodeSyncPart,joinSyncParts,splitSyncBody} from '../src/lib/sync/transfer.ts';
import {decodeSyncUpload,compressSyncPart} from '../src/lib/sync/compression.ts';
import {createSyncApi} from '../azure/backend/sync-api.mjs';
import type * as Outbox from '../src/lib/sync/outbox.ts';

test('A edits offline while unchanged B syncs first; A additions survive and both converge',async()=>{
  const base=remote({rows:[{id:'a',text:'base'}]}),cloud=server(base),a=device(cloud,base),b=device(cloud,base);
  a.set({rows:[{id:'a',text:'base'},{id:'new',text:'offline A'}]});
  await b.engine.pull();await b.engine.flush();assert.equal(cloud.writes,0);
  await a.restart().pull();await a.restart().flush();await b.engine.pull();
  assert.deepEqual(a.value,b.value);assert.equal((b.value as {rows:unknown[]}).rows.length,2);
});

test('A offline edit merges with B edit uploaded first without asking the user',async()=>{
  const base=remote({a:0,b:0}),cloud=server(base),a=device(cloud,base),b=device(cloud,base);
  a.set({a:1,b:0});b.set({a:0,b:2});await b.engine.flush();await a.restart().pull();await a.restart().flush();await b.engine.pull();
  assert.deepEqual(a.value,{a:1,b:2});assert.deepEqual(b.value,a.value);assert.equal((await a.store.getConflicts()).length,0);
});

test('undo replaces a queued edit instead of uploading the abandoned value',async()=>{
  const base=remote({text:'base'}),cloud=server(base),d=device(cloud,base);
  d.set({text:'abandoned'});await d.engine.capture();d.set(base.value);await d.engine.capture();await d.engine.flush();
  assert.deepEqual(cloud.cloud!.value,base.value);assert.equal((await d.store.getOutbox()).length,0);
});

test('a persisted conflict automatically resolves after local content converges and acknowledges the server',async()=>{
  const base=remote({text:'base'}),cloud=server(base),d=device(cloud,base);
  d.set({text:'local'});cloud.cloud=remote({text:'remote',extra:1},2);await d.engine.pull();
  const conflict=(await d.store.getConflicts())[0];assert.ok(conflict);
  d.set(cloud.cloud.value);await d.restart().pull();assert.equal((await d.store.getConflicts()).length,0);
  assert.equal((await d.store.getOutbox())[0].resolvesOperationId,conflict.operationId);
  await d.engine.flush();assert.equal((await d.store.getOutbox()).length,0);
});

test('cloud rollback never lowers the baseline or overwrites local content',async()=>{
  const base=remote({text:'latest'},5),cloud=server(base),d=device(cloud,base);
  cloud.cloud=remote({text:'old'},2);await assert.rejects(d.engine.pull(),/回退/);
  assert.deepEqual(d.value,base.value);assert.equal((await d.store.getMetadata())[0].revision,5);
});

test('primitive append-only lists merge deterministically while removal stays a conflict',()=>{
  const base=['base'],a=['base','A'],b=['base','B'];
  assert.deepEqual(threeWayMerge(base,a,b),{merged:['base','A','B'],conflicts:[]});
  assert.deepEqual(threeWayMerge(base,b,a),threeWayMerge(base,a,b));
  assert.ok(threeWayMerge(base,[],b).conflicts.length);
});

test('gzip upload compresses Chinese content before base64 and retains raw compatibility',async()=>{
  const body=JSON.stringify({text:'学习📚'.repeat(100000)}),parts=await splitCompressedSyncBody(body);
  const bytes=Buffer.concat(parts.map(part=>Buffer.from(part,'base64')));
  assert.ok(bytes.length<Buffer.byteLength(body)/20);assert.deepEqual(decodeSyncUpload(bytes),JSON.parse(body));
  assert.deepEqual(decodeSyncUpload(Buffer.from(body)),JSON.parse(body));
  assert.ok(parts.length<splitSyncBody(body).length);
  await assert.rejects(splitCompressedSyncBody('x'.repeat(24000001)),/超过/);
});

test('gzip download parts preserve Unicode byte boundaries and hash input',async()=>{
  const value={text:'中📚'.repeat(40000)},parts=splitSyncBody(JSON.stringify(value));
  const restored=[];
  for(const part of parts){const encoded=compressSyncPart(part,true);restored.push(await decodeSyncPart(encoded.data,encoded.encoding));}
  assert.deepEqual(joinSyncParts(restored),value);assert.deepEqual(compressSyncPart(parts[0],false),{data:parts[0]});
  await assert.rejects(decodeSyncPart(parts[0],'unknown'),/压缩/);
});

test('bounded decompression rejects corrupt gzip and oversized expanded uploads or parts',async()=>{
  assert.throws(()=>decodeSyncUpload(Buffer.from([31,139,0,0])));
  assert.throws(()=>decodeSyncUpload(gzipSync(Buffer.alloc(24000001,32))));
  await assert.rejects(decodeSyncPart(gzipSync(Buffer.alloc(120001)).toString('base64'),'gzip'),/超过/);
});

test('the real engine negotiates gzip uploads and falls back to raw on an older server',async()=>{
  for(const supported of [true,false]){
    const cloud=server(),d=device(cloud),value={text:'离线学习📚'.repeat(60000)};
    const uploaded:string[]=[];let bytes=0;
    d.environment.request=async(url,init)=>{
      if(url.includes('/v3'))return Response.json({ok:true,syncProtocol:3,transferEncoding:supported?'gzip':undefined,records:[],next:null});
      if(url.includes('/large') && init?.method==='POST'){
        const part=JSON.parse(String(init.body));
        if(part.complete){const body=decodeSyncUpload(Buffer.concat(uploaded.map(data=>Buffer.from(data,'base64'))));return cloud.request('/api/sync/v2',{method:'POST',body:JSON.stringify(body)});}
        uploaded[part.index]=part.data;bytes+=Buffer.byteLength(part.data);return Response.json({ok:true});
      }
      return cloud.request(url,init);
    };
    d.set(value);await d.engine.pull();await d.engine.flush();
    assert.deepEqual(cloud.cloud!.value,value);assert.equal((await d.store.getOutbox()).length,0);
    assert.equal(uploaded.length===1,supported);assert.equal(bytes<Buffer.byteLength(JSON.stringify(value))/10,supported);
  }
});

test('the real engine downloads negotiated gzip parts and verifies the canonical content hash',async()=>{
  const value={text:'学习📚'.repeat(90000)},row=remote(value,4),cloud=server(row),d=device(cloud);
  const parts=splitSyncBody(JSON.stringify(value));
  d.environment.request=async(url,init)=>{
    if(url.includes('/large')){
      const parsed=new URL(url,'https://test'),part=Number(parsed.searchParams.get('part'));
      assert.equal(parsed.searchParams.get('encoding'),'gzip');
      return Response.json({ok:true,revision:row.revision,part,count:parts.length,...compressSyncPart(parts[part],true)});
    }
    if(url.startsWith('/api/sync/v2?'))return Response.json({ok:true,records:[{...row,value:null,large:true}]});
    return cloud.request(url,init);
  };
  await d.engine.pull();assert.deepEqual(d.value,value);assert.equal((await d.store.getMetadata())[0].revision,4);
});

test('backend accepts compressed uploads and advertises capability with negotiated downloads',async()=>{
  const id='00000000-0000-4000-8000-000000000001',value={text:'学习'.repeat(60000)};
  const operation={id,key:'azure_backend_test_smart',baseRevision:0,baseHash:null,deleted:false,value,clientUpdatedAt:'2026-10-14T00:00:00Z'};
  const upload=JSON.stringify({syncProtocol:3,deviceId:id,operations:[operation]});
  const parts=await splitCompressedSyncBody(upload);let appliedValue:unknown;
  const chunk=splitSyncBody(JSON.stringify(value))[0];
  const api=createSyncApi({withUser:async(_identity:unknown,work:(client:unknown)=>unknown)=>work({query:async(sql:string,args:unknown[])=>{
    if(sql.includes('part_index,part_count,data'))return {rows:parts.map((data,part_index)=>({data,part_index,part_count:parts.length}))};
    if(sql.includes('get_web_sync_record_part'))return {rows:[{chunk:{count:3,data:chunk}}]};
    if(sql.includes('AS count'))return {rows:[{count:0}]};
    if(sql.includes('apply_web_sync_operation')){appliedValue=JSON.parse(String(args[6]));return {rows:[{result:{status:'applied',revision:1,contentHash:'a'.repeat(64)}}]};}
    return {rows:[]};
  }})});
  const identity={sub:id,session_id:id,role:'authenticated'};
  const result=await api('POST',new URL('https://test/api/sync/v2/large'),{uploadId:id,complete:true},identity);
  assert.equal(result.applied.length,1);assert.deepEqual(appliedValue,value);
  const manifest=await api('GET',new URL('https://test/api/sync/v3'),null,identity);assert.equal(manifest.transferEncoding,'gzip');
  for(const encoding of ['','&encoding=gzip']){
    const result=await api('GET',new URL(`https://test/api/sync/v2/large?key=azure_backend_test_smart&revision=1&part=0${encoding}`),null,identity);
    assert.equal(await decodeSyncPart(result.data,result.encoding),chunk);
    assert.equal(Boolean(result.encoding),Boolean(encoding));
  }
});

test('persistent operation numbers survive empty queues and serialize concurrent tabs',async()=>{
  const exports={} as typeof Outbox;
  const require=(name:string)=>name.endsWith('/batch')?{compactSyncOperations}:{reconcileAcknowledgment};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/sync/outbox.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,indexedDB:new IDBFactory(),crypto});
  const op={id:crypto.randomUUID(),key,value:1,baseRevision:0,baseHash:null,baseValue:null,deleted:false,clientUpdatedAt:'2026-10-14T00:00:00Z'};
  await exports.queueOperation(op);const first=(await exports.getOutbox())[0].sequence;await exports.removeOperation(op.id);
  await Promise.all([exports.queueOperation({...op,id:crypto.randomUUID(),key:'one'}),exports.queueOperation({...op,id:crypto.randomUUID(),key:'two'})]);
  const sequences=(await exports.getOutbox()).map((row:{sequence:number})=>row.sequence).sort();
  assert.deepEqual(sequences,[first+1,first+2]);
});
