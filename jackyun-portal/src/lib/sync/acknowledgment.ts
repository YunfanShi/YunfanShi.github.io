import { canonicalJson } from './hash.ts';
import type { SyncOperation, SyncRecord } from '../../types/sync.ts';

export function operationMatchesStorage(operation: SyncOperation, current: string | null): boolean {
  if (operation.deleted) return current === null;
  if (current === null) return false;
  let value: unknown;
  try { value = JSON.parse(current); } catch { value = current; }
  return canonicalJson(value) === canonicalJson(operation.value);
}

/** A second tab may compact a newer edit into the same operation ID during upload. */
export function reconcileAcknowledgment(
  current: SyncOperation, sent: SyncOperation, cloud: SyncRecord, newId: string,
  resolvesOperationId?: string,
): SyncOperation | null {
  // baseValue can be omitted from oversized requests without changing the edit.
  if (current.key === sent.key && current.deleted === sent.deleted
      && current.clientUpdatedAt === sent.clientUpdatedAt
      && canonicalJson(current.value) === canonicalJson(sent.value)) return null;
  return {
    ...current, id: newId, baseRevision: cloud.revision, baseHash: cloud.contentHash,
    baseValue: cloud.deleted ? null : cloud.value, resolvesOperationId,
  };
}
