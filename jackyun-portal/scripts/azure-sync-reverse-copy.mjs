// Defaults to read-only preflight. Never put credentials in command arguments.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { privateArchive } from './lib/azure-cutover.mjs';
import { inspectReverseCopy,applyReverseCopy,validateReverseEvidence } from './lib/azure-reverse-copy.mjs';
import { atStage, safeDiagnostic } from './lib/azure-cutover-diagnostics.mjs';

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.some(arg => !['--apply', '--preflight'].includes(arg)) || new Set(args).size > 1) throw Error('Choose --preflight (default) or --apply');
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
      connectionTimeoutMillis: 10_000, statement_timeout: 120_000, application_name: 'jackyun-sync-reverse-copy' });
  }
  const source = await atStage('source_configuration',()=>connection('SOURCE'));
  const target = await atStage('target_configuration',()=>connection('TARGET'));
  try {
    console.log('步骤 1/4：连接 Supabase 数据库…');
    await atStage('source_connect',()=>source.connect());
    console.log('步骤 2/4：连接 Azure 数据库…');
    await atStage('target_connect',()=>target.connect());
    console.log('步骤 3/4：检查迁移库结构、账号与权限…');
    const report = await inspectReverseCopy(source, target);
    if (!args.includes('--apply')) {
      const archive=privateArchive(join(root,'.migration-private'));
      archive.write('reverse-preflight.json',report);
      const summary={ok:true,operation:'reverse-preflight',writesPerformed:false,
        accountCount:report.source.ids.length,syncTables:5,targetDatabase:report.target.database,archive:archive.directory};
      archive.write('summary.json',summary);console.log(JSON.stringify(summary));return summary;
    }
    const evidence = validateReverseEvidence(env.AZURE_REVERSE_EVIDENCE, report);
    const archive = privateArchive(join(root, '.migration-private'));
    const result = await applyReverseCopy({ source, target, report, evidence, archive });
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
