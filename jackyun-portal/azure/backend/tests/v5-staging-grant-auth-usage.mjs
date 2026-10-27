import assert from 'node:assert/strict';
import tls from 'node:tls';
import {Pool} from 'pg';

const database='jackyun_v5_stage_20261026';
const host='jackyunasia.postgres.database.azure.com';
assert.ok(process.env.V5_STAGING_ADMIN_PASSWORD,'Admin password must be supplied by the local hidden-input wrapper');
const pool=new Pool({host,database,user:'jackyun_admin',password:process.env.V5_STAGING_ADMIN_PASSWORD,
  ssl:{ca:tls.rootCertificates.join('\n'),rejectUnauthorized:true,servername:host},
  connectionTimeoutMillis:10000,query_timeout:15000,application_name:'jackyun-staging-auth-usage-repair'});
let client,committed=false;
try{
  client=await pool.connect();
  await client.query('BEGIN');
  const target=(await client.query('SELECT current_database() AS database,session_user')).rows[0];
  assert.equal(target.database,database);
  assert.equal(target.session_user,'jackyun_admin');
  const before=(await client.query(`SELECT
    has_schema_privilege('jackyun_sync_runtime','auth','USAGE') AS auth_usage,
    has_table_privilege('jackyun_sync_runtime','auth.users','SELECT') AS auth_users_read,
    has_function_privilege('jackyun_sync_runtime','auth.uid()','EXECUTE') AS auth_uid_execute`)).rows[0];
  assert.equal(before.auth_users_read,false,'Repair must not normalize unexpected access to auth.users');
  assert.equal(before.auth_uid_execute,true,'Only the diagnosed missing schema usage is repaired');
  await client.query('GRANT USAGE ON SCHEMA auth TO jackyun_sync_runtime');
  const after=(await client.query(`SELECT
    has_schema_privilege('jackyun_sync_runtime','auth','USAGE') AS auth_usage,
    has_table_privilege('jackyun_sync_runtime','auth.users','SELECT') AS auth_users_read`)).rows[0];
  assert.equal(after.auth_usage,true);
  assert.equal(after.auth_users_read,false);
  await client.query('COMMIT');
  committed=true;
  console.log(JSON.stringify({ok:true,database,changed:!before.auth_usage,authSchemaUsageGranted:true,authUsersReadGranted:false}));
}catch(error){
  if(client&&!committed)await client.query('ROLLBACK').catch(()=>{});
  console.error(JSON.stringify({ok:false,database,code:error.code??'STAGING_PERMISSION_REPAIR_FAILED'}));
  process.exitCode=1;
}finally{
  client?.release();
  await pool.end();
}
