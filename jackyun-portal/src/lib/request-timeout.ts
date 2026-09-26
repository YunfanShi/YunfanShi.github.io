/** Bound network waits; combine rather than replace caller cancellation. */
export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 8_000): Promise<Response> {
  const requestSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = requestSignal ? AbortSignal.any([requestSignal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

export const SYNC_REQUEST_TIMEOUT_MS = 45_000;
export const SYNC_DATABASE_TIMEOUT_MS = 30_000;

/** Sync transfers may take longer than ordinary UI requests. */
export function fetchSyncWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetchWithTimeout(input, init, SYNC_REQUEST_TIMEOUT_MS);
}
