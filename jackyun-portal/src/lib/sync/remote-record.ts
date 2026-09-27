import { storageValueToString } from '@/lib/local-workspace';
import type { SyncRecord } from '@/types/sync';

/** A downloaded revision needs no second transfer while its local copy is intact. */
export function remoteRecordIsCurrent(record: SyncRecord, base: SyncRecord | undefined, current: string | null): boolean {
  return Boolean(base && base.revision === record.revision && base.contentHash === record.contentHash
    && base.deleted === record.deleted && !base.large
    && (base.deleted ? current === null : current === storageValueToString(base.value)));
}
