import test from 'node:test';
import assert from 'node:assert/strict';
import { compareManifests } from '../scripts/compare-azure-migration.mjs';

const table = (name = 'public.profiles') => ({ name, rows: '8', fingerprint: 'a'.repeat(32), columns: [{ name: 'id', type: 'uuid', nullable: false }] });
const manifest = tables => ({ format: 'jackyun-public-manifest-v1', scope: 'public', algorithm: 'md5-sorted-row-jsonb-v1', tables });

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
