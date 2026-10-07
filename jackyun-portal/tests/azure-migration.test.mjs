import test from 'node:test';
import assert from 'node:assert/strict';
import { compareManifests } from '../scripts/compare-azure-migration.mjs';

const table = (name = 'public.profiles') => ({ name, rows: '8', fingerprint: 'a'.repeat(32), columns: [{ name: 'id', type: 'uuid', nullable: false }] });
const manifest = tables => ({ format: 'jackyun-public-manifest-v1', scope: 'public', algorithm: 'md5-sorted-row-jsonb-v1', tables });
const applicationManifest = tables => ({ ...manifest(tables), format: 'jackyun-application-manifest-v2', scope: ['public', 'jackyun_private'] });

test('table ordering does not affect comparison', () => {
  assert.equal(compareManifests(manifest([table(), table('public.study_plans')]), manifest([table('public.study_plans'), table()])).matches, true);
});
test('same count with changed content cannot pass', () => {
  const result = compareManifests(manifest([table()]), manifest([{ ...table(), fingerprint: 'b'.repeat(32) }]));
  assert.deepEqual(result.differences, [{ table: 'public.profiles', reason: 'row-content' }]);
});
test('missing, additional and altered tables are all reported', () => {
  const result = compareManifests(manifest([table(), table('public.study_plans')]), manifest([{ ...table(), rows: '7', columns: [{ name: 'id', type: 'text', nullable: true }] }, table('public.extra')]));
  assert.deepEqual(result.differences.map(item => item.reason), ['column-definition', 'row-count', 'missing-table', 'unexpected-table']);
});
test('malformed, duplicate and empty manifests fail closed', () => {
  for (const tables of [[], [table(), table()], [{ ...table(), fingerprint: null }], [{ ...table(), rows: '-1' }], [{ ...table(), columns: [] }]]) {
    assert.throws(() => compareManifests(manifest(tables), manifest([table()])));
  }
});
test('counts above JavaScript integer precision retain their exact value', () => {
  assert.equal(compareManifests(manifest([{ ...table(), rows: '9007199254740992' }]), manifest([{ ...table(), rows: '9007199254740993' }])).matches, false);
});

test('private backup queue omissions and altered rows prevent migration acceptance', () => {
  const privateTable = table('jackyun_private.backup_dirty_pages');
  const source = applicationManifest([table(), privateTable]);
  assert.equal(compareManifests(source, applicationManifest([privateTable, table()])).matches, true);
  assert.deepEqual(compareManifests(source, applicationManifest([table()])).differences,
    [{ table: privateTable.name, reason: 'missing-table' }]);
  assert.equal(compareManifests(source, applicationManifest([table(), { ...privateTable, rows: '0' }])).matches, false);
});

test('legacy public-only manifests cannot be compared as full application snapshots', () => {
  assert.throws(() => compareManifests(applicationManifest([table()]), manifest([table()])), /scopes differ/);
  assert.throws(() => compareManifests({ ...applicationManifest([table()]), scope: ['public'] }, applicationManifest([table()])));
  assert.throws(() => compareManifests(manifest([table('jackyun_private.backup_dirty_pages')]), manifest([table()])));
  assert.throws(() => compareManifests(applicationManifest([table('auth.users')]), applicationManifest([table()])));
});
