import type { SyncOperation } from '@/types/sync';

const MAX_BATCH_OPERATIONS = 10;
export const MAX_SYNC_BATCH_BYTES = 250_000;

type DeviceDescription = { name: string; platform: string };

function operationTime(operation: SyncOperation): number {
  const timestamp = Date.parse(operation.clientUpdatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/** Keep the oldest cloud base and the newest local value for each storage key. */
export function compactSyncOperations(operations: SyncOperation[]): SyncOperation[] {
  const compacted = new Map<string, SyncOperation>();
  const chronological = [...operations].sort((left, right) => left.sequence !== undefined || right.sequence !== undefined
    ? (left.sequence ?? 0) - (right.sequence ?? 0) : operationTime(left) - operationTime(right));
  for (const operation of chronological) {
    const existing = compacted.get(operation.key);
    if (!existing) {
      compacted.set(operation.key, operation);
      continue;
    }
    const existingIsOlder = existing.sequence !== undefined || operation.sequence !== undefined
      ? (existing.sequence ?? 0) <= (operation.sequence ?? 0) : operationTime(existing) <= operationTime(operation);
    const oldest = existingIsOlder ? existing : operation;
    const newest = existingIsOlder ? operation : existing;
    compacted.set(operation.key, {
      ...newest,
      id: newest.id,
      baseRevision: oldest.baseRevision,
      baseHash: oldest.baseHash,
      baseValue: oldest.baseValue,
      baseDeleted: oldest.baseDeleted,
    });
  }
  return [...compacted.values()];
}

export function buildSyncRequest(
  deviceId: string,
  device: DeviceDescription,
  operations: SyncOperation[],
): { operations: SyncOperation[]; body: string } {
  const batch: SyncOperation[] = [];
  let body = JSON.stringify({ deviceId, device, operations: batch });
  for (const operation of operations.slice(0, MAX_BATCH_OPERATIONS)) {
    const candidate = [...batch, operation];
    const candidateBody = JSON.stringify({ deviceId, device, operations: candidate });
    if (new TextEncoder().encode(candidateBody).byteLength > MAX_SYNC_BATCH_BYTES) {
      if (!batch.length) {
        batch.push(operation);
        body = candidateBody;
      }
      break;
    }
    batch.push(operation);
    body = candidateBody;
  }
  return { operations: batch, body };
}
