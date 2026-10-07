// Read-only API acceptance with a real Supabase session; never persists credentials.
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { privateArchive } from './lib/azure-cutover.mjs';
import { resolve } from 'node:path';

const project='https://gdcwwlnzylrzrqhaaljq.supabase.co';
const backend='https://jackyun-sync-9d26b2cc.azurewebsites.net';
const lookup=spawnSync('az',['functionapp','config','appsettings','list','--resource-group','JackYun','--name','jackyun-sync-9d26b2cc','--query',"[?name=='SUPABASE_PUBLISHABLE_KEY'].value | [0]",'-o','tsv'],{encoding:'utf8',timeout:30_000});
const key=lookup.status===0?lookup.stdout.trim():'';
if(!key||!process.env.AZURE_TEST_EMAIL||!process.env.AZURE_TEST_PASSWORD){
  console.error('缺少本机 Azure 登录、公开 API 配置或测试账号输入。');process.exit(1);
}
const client=createClient(project,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
let session;
try{
  const login=await client.auth.signInWithPassword({email:process.env.AZURE_TEST_EMAIL,password:process.env.AZURE_TEST_PASSWORD});
  if(login.error||!login.data.session)throw Error('REAL_LOGIN_FAILED');
  session=login.data.session;
  const checks=[];
  for(const path of ['/api/sync/v2','/api/sync/devices','/api/sync/conflicts','/api/legacy-sync']){
    const response=await fetch(backend+path,{headers:{Authorization:`Bearer ${session.access_token}`},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30_000)});
    // Read data only to validate the response; no private payload is printed or saved.
    const data=await response.json();
    if(response.status!==200||data.ok!==true)throw Error(`AZURE_READ_FAILED_${response.status}`);
    checks.push({path,status:response.status});
  }
  const rejected=await fetch(backend+'/api/sync/v2',{headers:{Authorization:'Bearer invalid'},signal:AbortSignal.timeout(30_000)});
  if(rejected.status!==401)throw Error('INVALID_TOKEN_NOT_REJECTED');
  const archive=privateArchive(resolve(import.meta.dirname,'../.migration-private'));
  const report={ok:true,capturedAt:new Date().toISOString(),realLogin:true,azureRead:true,invalidTokenRejected:true,
    checks,writesPerformed:false,twoUserIsolation:false,deviceRevocation:false,accountSuspension:false,productionCutover:false};
  archive.write('real-login-read.json',report);
  console.log(JSON.stringify({...report,archive:archive.directory}));
}catch(error){
  const code=/^(REAL_LOGIN_FAILED|AZURE_READ_FAILED_\d{3}|INVALID_TOKEN_NOT_REJECTED)$/.test(error.message)?error.message:'REAL_LOGIN_CHECK_FAILED';
  console.error(JSON.stringify({ok:false,code,writesPerformed:false,productionCutover:false}));process.exitCode=1;
}finally{
  if(session)await client.auth.signOut({scope:'local'}).catch(()=>{});
}
