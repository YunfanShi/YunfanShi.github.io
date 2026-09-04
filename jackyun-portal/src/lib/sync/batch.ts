import type { SyncOperation } from '@/types/sync';

const MAX_BATCH_OPERATIONS = 100;
const MAX_BATCH_BYTES = 900_000;

type DeviceDescription = { name: string; platform: string };

function operationTime(operation: SyncOperation): number {
  const timestamp = Date.parse(operation.clientUpdatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/** Keep the oldest cloud base and the newest local value for each storage key. */
export function compactSyncOperations(operations: SyncOperation[]): SyncOperation[] {
  const compacted = new Map<string, SyncOperation>();
  const chronological = [...operations].sort((left, right) => operationTime(left) - operationTime(right));
  for (const operation of chronological) {
    const existing = compacted.get(operation.key);
    if (!existing) {
      compacted.set(operation.key, operation);
      continue;
    }
    const existingIsOlder = operationTime(existing) <= operationTime(operation);
    const oldest = existingIsOlder ? existing : operation;
    const newest = existingIsOlder ? operation : existing;
    compacted.set(operation.key, {
      ...newest,
      id: oldest.id,
      baseRevision: oldest.baseRevision,
      baseHash: oldest.baseHash,
      baseValue: oldest.baseValue,
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
    if (new TextEncoder().encode(candidateBody).byteLength > MAX_BATCH_BYTES) {
      if (!batch.length) throw new Error(`同步条目“${operation.key}”过大，无法上传`);
      break;
    }
    batch.push(operation);
    body = candidateBody;
  }
  return { operations: batch, body };
}
