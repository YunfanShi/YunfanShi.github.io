export type SyncFailurePhase = 'initialization' | 'cycle';
const names = ['QuotaExceededError','AbortError','TimeoutError','TypeError','SyncProtocolError','Error','Unknown'] as const;
export type SyncDiagnostic = {
  version: string; phase: SyncFailurePhase; errorName: typeof names[number];
  status: number | null; online: boolean; storageUsage?: number; storageQuota?: number;
};

/** An allowlist deliberately excludes messages, stacks, URLs, keys and values. */
export function sanitizeSyncDiagnostic(value: unknown): SyncDiagnostic | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.version !== 'string' || !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(row.version)
    || !['initialization','cycle'].includes(String(row.phase))
    || !names.includes(row.errorName as typeof names[number]) || typeof row.online !== 'boolean'
    || !(row.status === null || typeof row.status === 'number' && Number.isInteger(row.status) && row.status >= 0 && row.status <= 599)) return null;
  const result: SyncDiagnostic = {version:row.version,phase:row.phase as SyncFailurePhase,
    errorName:row.errorName as SyncDiagnostic['errorName'],status:row.status as number|null,online:row.online};
  for (const key of ['storageUsage','storageQuota'] as const) {
    const bytes = row[key];
    if (typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes >= 0) result[key] = bytes;
  }
  return result;
}

export function syncDiagnosticError(error: unknown): Pick<SyncDiagnostic,'errorName'|'status'> {
  const row = error && typeof error === 'object' ? error as {name?:unknown;status?:unknown} : {};
  return {errorName:names.includes(row.name as typeof names[number]) ? row.name as SyncDiagnostic['errorName'] : 'Unknown',
    status:typeof row.status === 'number' && Number.isInteger(row.status) && row.status >= 0 && row.status <= 599 ? row.status : null};
}
