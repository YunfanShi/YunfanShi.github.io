// Defaults to read-only preflight. Never put credentials in command arguments.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectCutover, applyCutover, privateArchive, validateEvidence } from './lib/azure-cutover.mjs';
import { compareManifests } from './compare-azure-migration.mjs';
import { atStage, safeDiagnostic } from './lib/azure-cutover-diagnostics.mjs';

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.some(arg => !['--apply', '--preflight','--accept-azure-baseline'].includes(arg))
      || (args.includes('--apply') && args.includes('--preflight')) || new Set(args).size !== args.length) throw Error('Choose --preflight (default) or --apply; optionally --accept-azure-baseline');
  const acceptAzureBaseline = args.includes('--accept-azure-baseline');
  const root = resolve(import.meta.dirname, '..');
  const { Client } = createRequire(new URL('../azure/backend/package.json', import.meta.url))('pg');
  function connection(side) {
    const source = side === 'SOURCE';
    const password = env[`${side}PGPASSWORD`];
    const caPath = env[`${side}PGSSLROOTCERT`];
    if (!password || !caPath) throw Error('Password and trusted CA must be provided in a protected environment');
    return new Client({ host: source ? 'aws-1-ap-northeast-1.pooler.supabase.com' : 'jackyunasia.postgres.database.azure.com',
      port: 5432, database: source ? 'postgres' : 'jackyun_migration_20261007',
      user: source ? 'postgres.gdcwwlnzylrzrqhaaljq' : 'jackyun_admin', password,
      ssl: { rejectUnauthorized: true, ca: readFileSync(caPath, 'utf8') },
      connectionTimeoutMillis: 10_000, statement_timeout: 120_000, application_name: 'jackyun-sync-cutover' });
  }
  const source = await atStage('source_configuration',()=>connection('SOURCE'));
  const target = await atStage('target_configuration',()=>connection('TARGET'));
  try {
    console.log('步骤 1/4：连接 Supabase 数据库…');
    await atStage('source_connect',()=>source.connect());
    console.log('步骤 2/4：连接 Azure 数据库…');
    await atStage('target_connect',()=>target.connect());
    console.log('步骤 3/4：检查迁移库结构、账号与权限…');
    const report = await inspectCutover(source, target);
    if (!args.includes('--apply')) {
      if (acceptAzureBaseline) {
        const archive = privateArchive(join(root,'.migration-private'));
        const summary = {ok:true,operation:'preflight',mode:'accept-azure-baseline',writesPerformed:false,
          capturedAt:new Date().toISOString(),accountCount:report.target.ids.length,syncTables:5,targetDatabase:report.target.database,
          sourceDataComparisonSkipped:true,discardSourceIncrement:true,archive:archive.directory};
        archive.write('preflight.json',report);archive.write('summary.json',summary);console.log(JSON.stringify(summary));return summary;
      }
      const sql = readFileSync(join(root, 'scripts/azure-migration-manifest.sql'), 'utf8');
      const manifest = async client => {
        const results = await client.query(sql);
        const result = (Array.isArray(results) ? results : [results]).flatMap(item => item.rows)
          .map(row => Object.values(row)[0]).find(value => value?.format === 'jackyun-application-manifest-v2');
        if (!result) throw Error('Application manifest incomplete');
        return result;
      };
      console.log('步骤 4/4：读取并比较两边的应用表指纹…');
      const from = await atStage('source_manifest',()=>manifest(source));
      const to = await atStage('target_manifest',()=>manifest(target));
      const comparison = await atStage('compare_manifest',()=>compareManifests(from,to));
      const archive = await atStage('archive',()=>privateArchive(join(root, '.migration-private')));
      archive.write('source-manifest.json',from); archive.write('target-manifest.json',to);
      // Do not print private IDs, profile data or connection credentials.
      const summary = { ok: true, operation: 'preflight', writesPerformed: false,
        capturedAt: new Date().toISOString(), accountCount: report.source.ids.length,
        sourceApplicationTables: from.tables.length, targetApplicationTables: to.tables.length,
        applicationMatches: comparison.matches, differences: comparison.differences,
        profileStatesMatch: JSON.stringify(report.source.profiles) === JSON.stringify(report.target.profiles),
        legacyBackupGuardsReady: report.source.backupSource?.sync_backend === 'supabase' && report.source.backupSource?.guard_version === 1 && report.source.guardedBackupRPCs === 3,
        syncTables: 5, targetDatabase: report.target.database, archive: archive.directory };
      archive.write('summary.json',summary);
      console.log(JSON.stringify(summary)); return summary;
    }
    const evidence = validateEvidence(env.AZURE_CUTOVER_EVIDENCE, report, Date.now(), {acceptAzureBaseline});
    const archive = privateArchive(join(root, '.migration-private'));
    const result = await applyCutover({ source, target, report, evidence, archive, acceptAzureBaseline });
    console.log(JSON.stringify(result)); return result;
  } finally { await source.end().catch(() => {}); await target.end().catch(() => {}); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const diagnostic = safeDiagnostic(error);
    try {
      const archive = privateArchive(resolve(import.meta.dirname,'../.migration-private'));
      archive.write('diagnostic.json',diagnostic); diagnostic.diagnosticArchive = archive.directory;
    } catch { /* Console diagnosis is still available if the archive is unwritable. */ }
    console.error(JSON.stringify(diagnostic));
    process.exitCode = 1;
  });
}
