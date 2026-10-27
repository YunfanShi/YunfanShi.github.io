import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {handleSyncV5} from '../sync-v5.mjs';
import {createSyncApi} from '../sync-api.mjs';
import {canonicalJson} from '../../../src/lib/sync/hash.ts';
import {legacyWorkspaceRecordId} from '../../../src/lib/sync/resource-model.ts';
import {WRITING_COLLECTIONS,writingItemKey,writingMarkerKey} from '../../../src/lib/sync/writing-resource-model.ts';

const digest=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
export async function verifyStagingWritingCollections(client,subject){
  const aliases=WRITING_COLLECTIONS.map(row=>row.legacyKey),fields=WRITING_COLLECTIONS.map(row=>`${row.field}:%`);
  const inspect=async()=>({
    aliases:(await client.query('SELECT * FROM public.legacy_sync_data WHERE user_id=$1 AND storage_key=ANY($2::text[]) ORDER BY storage_key',[subject,aliases])).rows,
    resources:(await client.query("SELECT * FROM public.sync_v5_records WHERE user_id=$1 AND scope='workspace' AND record_id LIKE ANY($2::text[]) ORDER BY record_id",[subject,fields])).rows,
    heads:(await client.query("SELECT * FROM public.sync_v5_heads WHERE user_id=$1 AND scope='workspace'",[subject])).rows,
  });
  const before=await inspect(),fingerprint=value=>digest(JSON.parse(JSON.stringify(value)));
  const deviceId=randomUUID(),previous=new Map(['SYNC_V4_USERS','SYNC_V5_USERS','SYNC_V5_SCOPES','SYNC_V5_MODE','SYNC_V5_WRITE_PAUSE'].map(key=>[key,process.env[key]]));
  let requestSequence=0,failProjection=false;
  async function atomic(work){
    const name=`writing_request_${++requestSequence}`;
    await client.query(`SAVEPOINT ${name}`);
    try{const result=await work();await client.query(`RELEASE SAVEPOINT ${name}`);return result;}
    catch(error){await client.query(`ROLLBACK TO SAVEPOINT ${name}`);await client.query(`RELEASE SAVEPOINT ${name}`);throw error;}
  }
  const query=(...args)=>{
    if(failProjection&&args[0].includes('INSERT INTO public.legacy_sync_data')){failProjection=false;throw Error('Injected writing projection failure');}
    return client.query(...args);
  };
  const call=(method,path,body)=>atomic(()=>handleSyncV5({query},{sub:subject},method,new URL(`https://staging.invalid/api/sync/v5${path}`),body,['workspace']));
  const legacy=createSyncApi({withUser:(_identity,work)=>atomic(()=>work({query}))});
  const legacyRead=async key=>(await legacy('GET',new URL(`https://staging.invalid/api/sync/v2?key=${encodeURIComponent(key)}`),null,{sub:subject})).records[0];
  const legacyWrite=operation=>legacy('POST',new URL('https://staging.invalid/api/sync/v4'),{syncProtocol:4,deviceId,operations:[operation]},{sub:subject});
  const outcomes=[];
  await client.query('SAVEPOINT writing_collection_acceptance');
  try{
    Object.assign(process.env,{SYNC_V4_USERS:subject,SYNC_V5_USERS:subject,SYNC_V5_SCOPES:'workspace',SYNC_V5_MODE:'test-users',SYNC_V5_WRITE_PAUSE:'false'});
    await client.query("DELETE FROM public.sync_v5_records WHERE user_id=$1 AND scope='workspace' AND record_id LIKE ANY($2::text[])",[subject,fields]);
    for(const collection of WRITING_COLLECTIONS){
      const a=collection.field==='writingArchive'?'archive-'+ 'a'.repeat(56):randomUUID(),b=randomUUID();
      const source=[{[collection.idField]:a,body:'source-a',preserved:{opaque:true}},{[collection.idField]:b,body:'source-b'}];
      const current=await legacyRead(collection.legacyKey);
      const seed={id:randomUUID(),key:collection.legacyKey,baseRevision:current?.revision??0,baseHash:current?.contentHash??null,
        baseValue:current?.value??null,value:source,deleted:false,clientUpdatedAt:new Date().toISOString()};
      assert.equal((await legacyWrite(seed)).applied.length,1);
      // Simulate upgrading an existing workspace: only the aggregate source predates the new namespace.
      await client.query("DELETE FROM public.sync_v5_records WHERE user_id=$1 AND scope='workspace' AND record_id LIKE $2",[subject,`${collection.field}:%`]);
      const manifest=await call('GET',`/manifest?scope=workspace&field=${collection.field}`);
      const keyA=writingItemKey(collection,a),recordA=legacyWorkspaceRecordId(keyA),recordB=legacyWorkspaceRecordId(writingItemKey(collection,b));
      const expectedIds=[recordA,recordB,legacyWorkspaceRecordId(writingMarkerKey(collection))];
      assert.ok(expectedIds.every(id=>manifest.records.some(record=>record.recordId===id)),
        'manifest includes both seeded stable records and the server migration marker without dropping existing records');
      const read=async id=>(await call('GET',`/records?scope=workspace&id=${encodeURIComponent(id)}`)).records[0];
      const baselineA=await read(recordA),baselineB=await read(recordB);
      assert.equal(baselineA.revision,1);assert.equal(baselineA.contentHash,digest(source[0]));
      const initialProjection=await legacyRead(collection.legacyKey);
      const edit={id:randomUUID(),scope:'workspace',recordId:recordA,baseRevision:1,baseHash:baselineA.contentHash,
        value:{...source[0],body:'v5-edited-a'},deleted:false,clientUpdatedAt:new Date().toISOString()};
      const edited=await call('POST','/operations',{scope:'workspace',deviceId,operations:[edit]});
      assert.equal(edited.applied[0].revision,2);
      const projected=await legacyRead(collection.legacyKey);
      assert.equal(projected.contentHash,digest(projected.value));
      assert.equal(projected.value.find(row=>row[collection.idField]===a).body,'v5-edited-a');
      assert.deepEqual(projected.value.find(row=>row[collection.idField]===b),source[1]);
      assert.equal((await read(recordB)).revision,baselineB.revision,'editing one essay must not version another');
      const stale=await legacyWrite({...seed,id:randomUUID(),baseRevision:initialProjection.revision,baseHash:initialProjection.contentHash});
      assert.equal(stale.conflicts.length,1,'old aggregate snapshot must not overwrite the new item');
      const legacyValue=projected.value.map(row=>row[collection.idField]===b?{...row,body:'v4-edited-b'}:row);
      assert.equal((await legacyWrite({...seed,id:randomUUID(),baseRevision:projected.revision,baseHash:projected.contentHash,baseValue:projected.value,value:legacyValue})).applied.length,1);
      const reflectedB=await read(recordB);
      assert.equal(reflectedB.revision,2);assert.equal(reflectedB.value.body,'v4-edited-b');
      assert.equal((await read(recordA)).revision,2);
      const beforeFailure=(await client.query("SELECT sequence FROM public.sync_v5_heads WHERE user_id=$1 AND scope='workspace'",[subject])).rows[0].sequence;
      const failedOperation={...edit,id:randomUUID(),baseRevision:2,baseHash:edited.applied[0].contentHash,value:{...edit.value,body:'retry-after-failure'}};
      failProjection=true;
      await assert.rejects(call('POST','/operations',{scope:'workspace',deviceId,operations:[failedOperation]}),/Injected writing projection failure/);
      assert.equal((await read(recordA)).revision,2);
      assert.equal((await client.query("SELECT sequence FROM public.sync_v5_heads WHERE user_id=$1 AND scope='workspace'",[subject])).rows[0].sequence,beforeFailure);
      const requestHash=digest(failedOperation);
      assert.equal((await call('POST','/receipts',{scope:'workspace',operations:[{id:failedOperation.id,requestHash}]})).receipts[0].state,'unknown');
      const retried=await call('POST','/operations',{scope:'workspace',deviceId,operations:[failedOperation]});
      assert.equal(retried.applied[0].revision,3);
      const replay=await call('POST','/operations',{scope:'workspace',deviceId,operations:[failedOperation]});
      assert.equal(replay.head,retried.head);
      assert.equal((await call('POST','/receipts',{scope:'workspace',operations:[{id:failedOperation.id,requestHash}]})).receipts[0].state,'confirmed');
      const beforeDelete=await legacyRead(collection.legacyKey);
      const deleted=await call('POST','/operations',{scope:'workspace',deviceId,operations:[{...failedOperation,id:randomUUID(),baseRevision:3,baseHash:retried.applied[0].contentHash,deleted:true}]});
      assert.equal(deleted.applied[0].revision,4);
      assert.equal((await legacyRead(collection.legacyKey)).value.length,1);
      const resurrect=await legacyWrite({...seed,id:randomUUID(),baseRevision:beforeDelete.revision,baseHash:beforeDelete.contentHash,baseValue:beforeDelete.value});
      assert.equal(resurrect.conflicts.length,1);
      assert.equal((await read(recordA)).deleted,true);
      process.env.SYNC_V5_MODE='disabled';
      const rollbackView=await legacyRead(collection.legacyKey);
      assert.equal(rollbackView.contentHash,digest(rollbackView.value));
      const rollbackValue=rollbackView.value.map(row=>({...row,body:'accepted-during-safe-rollback'}));
      assert.equal((await legacyWrite({...seed,id:randomUUID(),baseRevision:rollbackView.revision,baseHash:rollbackView.contentHash,baseValue:rollbackView.value,value:rollbackValue})).applied.length,1);
      process.env.SYNC_V5_MODE='test-users';
      assert.equal((await read(recordB)).value.body,'accepted-during-safe-rollback');
      const validProjection=await legacyRead(collection.legacyKey);
      await assert.rejects(legacyWrite({...seed,id:randomUUID(),baseRevision:validProjection.revision,baseHash:validProjection.contentHash,
        baseValue:validProjection.value,value:[source[0],source[0]]}),{code:'INVALID_WRITING_COLLECTION'});
      assert.equal((await legacyRead(collection.legacyKey)).contentHash,validProjection.contentHash,'invalid legacy arrays must roll back before publication');
      await assert.rejects(call('POST','/operations',{scope:'workspace',deviceId,operations:[{...edit,id:randomUUID(),value:{[collection.idField]:'wrong'}}]}),{code:'WRITING_RECORD_ID_MISMATCH'});
      await assert.rejects(call('POST','/operations',{scope:'workspace',deviceId,operations:[{...edit,id:randomUUID(),recordId:legacyWorkspaceRecordId(writingMarkerKey(collection)),deleted:true}]}),{code:'WRITING_BASELINE_READ_ONLY'});
      await assert.rejects(legacyWrite({...seed,id:randomUUID(),key:keyA,value:source[0],baseRevision:0,baseHash:null}),{code:'WRITING_V5_REQUIRED'});
      outcomes.push({field:collection.field,bootstrapStableIds:true,singleItemWritePreservesOtherRevision:true,
        bidirectionalLegacyProjection:true,staleAggregateRejected:true,projectionFailureAtomicallyRolledBack:true,
        retryAndReceiptVerified:true,tombstoneNotResurrected:true,rolloutDisableReadAndWriteVerified:true,
        identityMismatchRejected:true,duplicateLegacyIdentityRejected:true,markerReadOnly:true,unsafeV4DowngradeRejected:true});
    }
  }finally{
    await client.query('ROLLBACK TO SAVEPOINT writing_collection_acceptance');
    await client.query('RELEASE SAVEPOINT writing_collection_acceptance');
    for(const [key,value] of previous){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
  assert.deepEqual(await inspect(),before,'all source arrays, resource rows and heads must return to their starting state');
  return {collections:outcomes,sourceStateRestored:true,startingStateFingerprint:fingerprint(before),
    endingStateFingerprint:fingerprint(await inspect()),authenticatedHttp:false};
}
