import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackupCaptureVerifier } from '../backup-capture.mjs';
import { createSyncApi } from '../sync-api.mjs';
const supabaseUrl='https://gdcwwlnzylrzrqhaaljq.supabase.co';
const capture={page:'schedule',generation:'00000000-0000-4000-8000-000000000003',versionId:42};
const identity={sub:'00000000-0000-4000-8000-000000000001',role:'authenticated'};
test('capture proof uses the verified user token, a committed own-source receipt and no cache',async()=>{
  const verify=createBackupCaptureVerifier({supabaseUrl,publishableKey:'public-test',fetchImpl:async(url,options)=>{
    assert.equal(String(url),supabaseUrl+'/rest/v1/rpc/confirm_backup_capture');
    assert.equal(options.headers.Authorization,'Bearer verified-user');assert.equal(options.headers.apikey,'public-test');
    assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');
    assert.deepEqual(JSON.parse(options.body),{target_page:'schedule',expected_generation:capture.generation,target_version_id:42});
    return Response.json(true);
  }});
  await verify(identity,'verified-user',capture);
  assert.throws(()=>createBackupCaptureVerifier({supabaseUrl:'https://attacker.test',publishableKey:'public-test'}),/Trusted project/);
});
test('missing, unavailable, malformed and unsaved capture proof fail closed without raw diagnostics',async()=>{
  for(const [reply,code] of [[Response.json(false),'BACKUP_CAPTURE_NOT_SAVED'],[Response.json({private:'secret'}),'BACKUP_CAPTURE_VERIFICATION_UNAVAILABLE'],
    [new Response('private-password',{status:503}),'BACKUP_CAPTURE_VERIFICATION_UNAVAILABLE'],[new Response('true'.repeat(30)),'BACKUP_CAPTURE_VERIFICATION_UNAVAILABLE'],
    [new Response('',{status:401}),'UNAUTHORIZED']]){
    const verify=createBackupCaptureVerifier({supabaseUrl,publishableKey:'public-test',fetchImpl:async()=>reply});
    await assert.rejects(verify(identity,'verified-user',capture),error=>error.code===code&&!error.message.includes('secret')&&!error.message.includes('password'));
  }
  const offline=createBackupCaptureVerifier({supabaseUrl,publishableKey:'public-test',fetchImpl:async()=>{throw Error('private-password');}});
  await assert.rejects(offline(identity,'verified-user',capture),{code:'BACKUP_CAPTURE_VERIFICATION_UNAVAILABLE'});
  const missing=createBackupCaptureVerifier({supabaseUrl});
  await assert.rejects(missing(identity,'verified-user',capture),{code:'BACKUP_CAPTURE_VERIFICATION_UNAVAILABLE'});
});
test('unproven acknowledgments never open an Azure transaction or delete a marker',async()=>{
  let opened=0;
  const database={async withUser(){opened++;throw Error('No database operation permitted');}};
  const url=new URL('https://example.test/api/sync/backup-markers');
  await assert.rejects(createSyncApi(database)('POST',url,capture,identity,'verified-user'),{code:'BACKUP_CAPTURE_VERIFICATION_UNAVAILABLE'});
  await assert.rejects(createSyncApi(database,{verifyBackupCapture:async()=>{throw Error('Proof unavailable');}})('POST',url,capture,identity,'verified-user'),/Proof unavailable/);
  await assert.rejects(createSyncApi(database)('POST',url,{...capture,versionId:'42'},identity,'verified-user'),{code:'INVALID_BACKUP_MARKER'});
  assert.equal(opened,0);
});
