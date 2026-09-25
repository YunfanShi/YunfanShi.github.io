import assert from 'node:assert/strict';
import test from 'node:test';
import { BACKUP_CHANGE_BYTES, BACKUP_MAX_WAIT_MS, backupIsDue, recordBackupChange } from '../src/lib/backup/cadence.ts';

test('changed volume or elapsed time triggers one checkpoint, then both counters restart', () => {
  const start = 1_000_000;
  assert.equal(backupIsDue(undefined, start + BACKUP_MAX_WAIT_MS), false);
  let pending = recordBackupChange(undefined, BACKUP_CHANGE_BYTES / 4, start);
  assert.equal(backupIsDue(pending, start + 1000), false);
  for (let index = 0; index < 3; index += 1) {
    pending = recordBackupChange(pending, BACKUP_CHANGE_BYTES / 4, start + 1000);
  }
  assert.equal(backupIsDue(pending, start + 1000), true);

  pending = recordBackupChange(undefined, 1, start + 1000);
  assert.equal(backupIsDue(pending, start + 1000), false);
  assert.equal(backupIsDue(pending, start + 1000 + BACKUP_MAX_WAIT_MS), true);

  pending = recordBackupChange(undefined, 1, start + 1000 + BACKUP_MAX_WAIT_MS);
  assert.equal(backupIsDue(pending, start + 1000 + BACKUP_MAX_WAIT_MS), false);
});
