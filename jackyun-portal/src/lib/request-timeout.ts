/** Bound network waits; combine rather than replace caller cancellation. */
export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 8_000): Promise<Response> {
  const requestSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = requestSignal ? AbortSignal.any([requestSignal, timeout]) : timeout;
  try {
    const response = await fetch(input, { ...init, signal });
    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      const error = Object.assign(new Error(response.status === 429 ? 'Request rate limited' : response.status === 408 ? 'Request timed out' : 'Service temporarily unavailable'), { name: 'ServiceUnavailableError', status: response.status });
      const url = new URL(input instanceof Request ? input.url : String(input), 'https://localhost');
      // auth-js clears sessions for non-retryable failures, including HTTP 500.
      // A thrown transport error is handled by its supported retryable path.
      if (url.pathname.startsWith('/auth/v1/')) throw error;
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('jackyun-service-error', { detail: error }));
    }
    return response;
  } catch (error) {
    if (typeof window !== 'undefined' && !requestSignal?.aborted) window.dispatchEvent(new CustomEvent('jackyun-service-error', { detail: error }));
    throw error;
  }
}

export const SYNC_REQUEST_TIMEOUT_MS = 45_000;
export const SYNC_DATABASE_TIMEOUT_MS = 30_000;

/** Sync transfers may take longer than ordinary UI requests. */
export function fetchSyncWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetchWithTimeout(input, init, SYNC_REQUEST_TIMEOUT_MS);
}
