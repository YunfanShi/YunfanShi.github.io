/** Bound network waits; combine rather than replace caller cancellation. */
export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const requestSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const timeout = AbortSignal.timeout(8_000);
  const signal = requestSignal ? AbortSignal.any([requestSignal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}
