// Protected, restoreable application/auth archives. Never changes database data.
import { spawnSync } from 'node:child_process';
import { readFileSync,chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve,join } from 'node:path';
import { privateArchive } from './lib/azure-cutover.mjs';
import { backupFailureCategory,privateBackupDetail } from './lib/azure-backup-diagnostics.mjs';

function runBackup(){
const bin=process.env.PG_BACKUP_BIN||'/opt/homebrew/opt/postgresql@17/bin';
const version=spawnSync(join(bin,'pg_dump'),['--version'],{encoding:'utf8'});
if(version.status!==0||!/PostgreSQL\) 17\./.test(version.stdout))throw Error('PostgreSQL 17 backup client required');
const archive=privateArchive(resolve(import.meta.dirname,'../.migration-private'));
const files=[];
for(const [side,host,user,database] of [
  ['SOURCE','aws-1-ap-northeast-1.pooler.supabase.com','postgres.gdcwwlnzylrzrqhaaljq','postgres'],
  ['TARGET','jackyunasia.postgres.database.azure.com','jackyun_admin','jackyun_migration_20261007'],
]){
  const path=join(archive.directory,`${side.toLowerCase()}.dump`);
  console.log(`备份 ${side==='SOURCE'?'Supabase':'Azure'} 应用和身份结构…`);
  const env={...process.env,PGHOST:host,PGPORT:'5432',PGUSER:user,PGDATABASE:database,
    PGPASSWORD:process.env[`${side}PGPASSWORD`],PGSSLMODE:'verify-full',PGSSLROOTCERT:process.env[`${side}PGSSLROOTCERT`],PGCONNECT_TIMEOUT:'10',PGAPPNAME:'jackyun-cutover-backup'};
  delete env.SOURCEPGPASSWORD;delete env.TARGETPGPASSWORD;
  if(!env.PGPASSWORD||!env.PGSSLROOTCERT)throw Error('Protected password and CA required');
  const dump=spawnSync(join(bin,'pg_dump'),['--format=custom','--schema=public','--schema=auth','--schema=jackyun_private','--file',path,'--no-password'],{env,encoding:'utf8',timeout:600_000});
  // Keep object details locally and redact passwords even in that private log.
  if(dump.status!==0){
    const category=backupFailureCategory(dump);
    archive.write(`${side.toLowerCase()}-backup-error.json`,{stage:'pg_dump',category,...privateBackupDetail(dump,[env.PGPASSWORD])});
    const error=Error(`${side}_BACKUP_FAILED`);error.category=category;error.archive=archive.directory;throw error;
  }
  chmodSync(path,0o600);
  const verify=spawnSync(join(bin,'pg_restore'),['--list',path],{encoding:'utf8',timeout:30_000});
  if(verify.status!==0)throw Error(`${side}_BACKUP_DIRECTORY_INVALID`);
  const bytes=readFileSync(path);
  files.push({side,file:path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),archiveDirectoryReadable:true,restoreDrillPassed:false});
}
const report={ok:true,capturedAt:new Date().toISOString(),schemas:['public','auth','jackyun_private'],files,writesPerformed:false,restoreDrillPassed:false,productionCutover:false};
archive.write('backup-report.json',report);console.log(JSON.stringify({...report,archive:archive.directory}));
}
try{runBackup();}catch(error){
 console.error(JSON.stringify({ok:false,code:error.message?.match(/^(SOURCE|TARGET)_BACKUP_FAILED$/)?error.message:'BACKUP_FAILED',category:error.category??'BACKUP_CONFIGURATION_OR_VERIFY_FAILED',archive:error.archive??null,writesPerformed:false,productionCutover:false,message:'备份未完成；详细原因保存在本机私有报告中，未修改或切换数据库。'}));
 process.exitCode=1;
}
