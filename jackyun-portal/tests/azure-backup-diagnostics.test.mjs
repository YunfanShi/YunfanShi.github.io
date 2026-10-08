import test from 'node:test';
import assert from 'node:assert/strict';
import {backupFailureCategory,privateBackupDetail} from '../scripts/lib/azure-backup-diagnostics.mjs';
test('backup failure output distinguishes auth, version, permissions and timeout without exposing details',()=>{
 for(const [stderr,expected] of [['password authentication failed for user private-owner','DATABASE_PASSWORD_REJECTED'],['server version: 18; pg_dump version: 17','BACKUP_CLIENT_VERSION_MISMATCH'],['permission denied for table private-data','DATABASE_PERMISSION_DENIED'],['canceling statement due to statement timeout','DATABASE_BACKUP_TIMEOUT']])assert.equal(backupFailureCategory({stderr}),expected);
});
test('even private backup diagnostics redact provided passwords and bound the detail',()=>{
 const result=privateBackupDetail({status:1,stderr:'connection secret-one '+ 'x'.repeat(110000)},['secret-one']);
 assert.ok(!result.detail.includes('secret-one'));assert.ok(result.detail.length<=100000);assert.equal(result.exitCode,1);
});
