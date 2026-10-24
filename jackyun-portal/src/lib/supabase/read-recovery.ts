import { fetchWithTimeout } from '@/lib/request-timeout';

/** Recover a transient PostgREST read once; writes and Auth keep their own policy. */
export async function fetchWithReadRecovery(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 8_000): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const recoverable = (method === 'GET' || method === 'HEAD') && url.pathname.startsWith('/rest/v1/');
  if (!recoverable) return fetchWithTimeout(input, init, timeoutMs);
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetchWithTimeout(input, init, timeoutMs, false);
    } catch (error) {
      // A navigation/client cancellation is final, even if it resembles a timeout.
      const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
      if (attempt || callerSignal?.aborted || !['TypeError', 'TimeoutError', 'AbortError'].includes(String(name))) throw error;
      continue;
    }
    if (attempt || callerSignal?.aborted || ![408, 429, 500, 502, 503, 504].includes(response.status)) return response;
    // Respect throttling instead of immediately doubling load on a busy service.
    if (response.status === 429 && response.headers.has('retry-after')) return response;
    await response.body?.cancel();
  }
}
