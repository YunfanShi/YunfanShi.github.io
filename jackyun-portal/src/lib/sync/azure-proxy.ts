import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, requestIdFrom } from '@/lib/api-response';

/** One backend per request: never retry a mutation against a second database. */
export async function forwardAzureSync(request: NextRequest): Promise<NextResponse | null> {
  const endpoint = process.env.AZURE_SYNC_API_URL;
  if (!endpoint) return null;
  const requestId = requestIdFrom(request);
  let target: URL;
  try {
    const base = new URL(endpoint);
    if (base.protocol !== 'https:' || !/^jackyun-sync-9d26b2cc(?:-[a-z0-9]+)?\.(?:[a-z0-9-]+\.)?azurewebsites\.net$/.test(base.hostname)
      || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Invalid endpoint');
    target = new URL(request.nextUrl.pathname + request.nextUrl.search, base);
  } catch {
    return apiError(requestId, 'Sync backend is unavailable', 503, 'SYNC_CONFIGURATION_ERROR');
  }
  const supabase = await createClient();
  // This session only transports a token. Azure verifies its signature, expiry and identity.
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) return apiError(requestId, 'Please sign in', 401, 'UNAUTHORIZED');
  const limit = request.nextUrl.pathname.endsWith('/large') ? 250_000 : 1_000_000;
  if (Number(request.headers.get('content-length') ?? 0) > limit) {
    return apiError(requestId, 'Request body too large', 413, 'PAYLOAD_TOO_LARGE');
  }
  const headers = new Headers({ Authorization: `Bearer ${session.access_token}` });
  const contentType = request.headers.get('content-type');
  const origin = request.headers.get('origin');
  if (contentType) headers.set('Content-Type', contentType);
  if (origin) headers.set('Origin', origin);
  let body: ArrayBuffer | undefined;
  if (request.body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > limit) {
          await reader.cancel();
          return apiError(requestId, 'Request body too large', 413, 'PAYLOAD_TOO_LARGE');
        }
        chunks.push(item.value);
      }
    } catch {
      return apiError(requestId, 'Invalid request body', 400, 'INVALID_BODY');
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = bytes.buffer;
  }
  try {
    const upstream = await fetch(target, { method: request.method, headers, body,
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(45_000) });
    return new NextResponse(upstream.body, { status: upstream.status, headers: {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': upstream.headers.get('x-request-id') ?? requestId,
    } });
  } catch {
    return apiError(requestId, 'Sync backend is temporarily unavailable', 503, 'SYNC_UNAVAILABLE');
  }
}
