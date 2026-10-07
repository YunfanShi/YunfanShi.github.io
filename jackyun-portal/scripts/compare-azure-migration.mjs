import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function indexManifest(manifest) {
  const legacy = manifest?.format === 'jackyun-public-manifest-v1' && manifest.scope === 'public';
  const application = manifest?.format === 'jackyun-application-manifest-v2' &&
    JSON.stringify(manifest.scope) === JSON.stringify(['public', 'jackyun_private']);
  if ((!legacy && !application) ||
      manifest.algorithm !== 'md5-sorted-row-jsonb-v1' || !Array.isArray(manifest.tables) || !manifest.tables.length) {
    throw new Error('Unsupported or empty manifest; use azure-migration-manifest.sql.');
  }
  const tables = new Map();
  for (const table of manifest.tables) {
    if (typeof table.name !== 'string' ||
        !(table.name.startsWith('public.') || (application && table.name.startsWith('jackyun_private.'))) || tables.has(table.name) ||
        typeof table.rows !== 'string' || !/^(0|[1-9]\d*)$/.test(table.rows) ||
        typeof table.fingerprint !== 'string' || !/^[a-f0-9]{32}$/.test(table.fingerprint) ||
        !Array.isArray(table.columns) || !table.columns.length || table.columns.some(column =>
          typeof column.name !== 'string' || typeof column.type !== 'string' || typeof column.nullable !== 'boolean')) {
      throw new Error('Malformed or duplicate table entry.');
    }
    tables.set(table.name, table);
  }
  return tables;
}

export function compareManifests(source, target) {
  const sourceTables = indexManifest(source);
  const targetTables = indexManifest(target);
  if (source.format !== target.format || JSON.stringify(source.scope) !== JSON.stringify(target.scope)) {
    throw new Error('Manifest scopes differ; recollect both using the same SQL version.');
  }
  const differences = [];
  for (const [name, expected] of sourceTables) {
    const actual = targetTables.get(name);
    if (!actual) { differences.push({ table: name, reason: 'missing-table' }); continue; }
    if (JSON.stringify(expected.columns) !== JSON.stringify(actual.columns)) {
      differences.push({ table: name, reason: 'column-definition' });
    }
    if (expected.rows !== actual.rows) differences.push({ table: name, reason: 'row-count' });
    if (expected.fingerprint !== actual.fingerprint) differences.push({ table: name, reason: 'row-content' });
  }
  for (const name of targetTables.keys()) {
    if (!sourceTables.has(name)) differences.push({ table: name, reason: 'unexpected-table' });
  }
  return { matches: differences.length === 0, sourceTables: sourceTables.size, targetTables: targetTables.size, differences };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node scripts/compare-azure-migration.mjs source.json target.json');
    const result = compareManifests(...process.argv.slice(2).map(file => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))));
    console.log(JSON.stringify(result, null, 2));
    // A successful comparison only proves the declared schema-table snapshots match.
    // Auth, objects, sequences, permissions, functions and application cutover need separate checks.
    process.exitCode = result.matches ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
