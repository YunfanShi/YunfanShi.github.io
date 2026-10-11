/* eslint-disable @typescript-eslint/no-explicit-any -- VM fixtures expose dynamically evaluated browser globals. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/sync/remote-record.ts', import.meta.url), 'utf8');
const exports: any = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  exports, require: () => ({ storageValueToString: (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value) }),
});
const isCurrent = exports.remoteRecordIsCurrent;
const value = { notes: '学习'.repeat(500000) };
const base = { key: 'jackyun_schedule_control_v1', revision: 10, contentHash: 'same', value, deleted: false };
const remote = { ...base, value: null, large: true };

test('unchanged large Schedule is downloaded once across repeated syncs', () => {
  let transfers = 0;
  let metadata;
  let current = null;
  for (let tick = 0; tick < 100; tick++) {
    if (!isCurrent(remote, metadata, current)) {
      transfers++;
      metadata = base;
      current = JSON.stringify(value);
    }
  }
  assert.equal(transfers, 1);
});
test('new revisions and missing or edited local data are not skipped', () => {
  assert.equal(isCurrent({ ...remote, revision: 11 }, base, JSON.stringify(value)), false);
  assert.equal(isCurrent({ ...remote, contentHash: 'new' }, base, JSON.stringify(value)), false);
  assert.equal(isCurrent(remote, base, null), false);
  assert.equal(isCurrent(remote, base, '{}'), false);
});
test('deleted and string records are compared without converting their representation', () => {
  const deleted = { ...base, deleted: true };
  assert.equal(isCurrent(deleted, deleted, null), true);
  assert.equal(isCurrent(deleted, deleted, '{}'), false);
  const text = { ...base, value: 'plain text' };
  assert.equal(isCurrent(text, text, 'plain text'), true);
});

// The v3 engine behavior is exercised end-to-end in sync-engine.test.mts:
// 100 manifest pulls, one full-value download, one local notification.
