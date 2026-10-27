import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import tls from 'node:tls';
import pg from '../azure/backend/node_modules/pg/lib/index.js';

assert.ok(process.env.V5_PRODUCTION_SCHEMA_PASSWORD,'Administrator password must be supplied by the hidden local wrapper');
const sql=await readFile(new URL('../azure/sync-v5-workspace.sql',import.meta.url),'utf8');
const results=[];
try{
  for(const database of ['jackyun_v5_stage_20261026','jackyun_migration_20261007']){
    const client=new pg.Client({host:'jackyunasia.postgres.database.azure.com',database,user:'jackyun_admin',
      password:process.env.V5_PRODUCTION_SCHEMA_PASSWORD,ssl:{ca:tls.rootCertificates.join('\n'),rejectUnauthorized:true},
      connectionTimeoutMillis:10000,statement_timeout:60000,query_timeout:65000,lock_timeout:5000,
      application_name:'jackyun-v5-workspace-scope-migration'});
    try{
      await client.connect();
      const identity=(await client.query('SELECT current_database() AS database,session_user')).rows[0];
      assert.equal(identity.database,database);assert.equal(identity.session_user,'jackyun_admin');
      const statements=await client.query(sql);
      const audit=statements.find(result=>result.rows?.length===4&&result.rows.every(row=>row.rows_unchanged===true))?.rows;
      assert.ok(audit,'Migration did not return the unchanged-row fingerprints');
      const constraints=(await client.query("SELECT count(*)::int AS count FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname=ANY($1::text[]) AND convalidated AND pg_get_constraintdef(oid) LIKE '%workspace%'",
        [['sync_v5_records_scope_check','sync_v5_heads_scope_check','sync_v5_changes_scope_check','sync_v5_receipts_scope_check']])).rows[0].count;
      assert.equal(constraints,4);
      results.push({database,ok:true,workspaceConstraintsValidated:4,existingRowsUnchanged:true,tableFingerprints:audit});
      console.log(JSON.stringify(results.at(-1)));
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
    finally{await client.end();}
  }
  await writeFile(new URL('../docs/sync-v5-workspace-production-schema-20261027.json',import.meta.url),JSON.stringify({ok:true,appliedAt:new Date().toISOString(),authConfigurationChanged:false,databases:results},null,2)+'\n');
}catch(error){console.error(JSON.stringify({ok:false,code:error.code??'SCHEMA_MIGRATION_FAILED',completedDatabases:results.map(row=>row.database)}));process.exitCode=1;}
