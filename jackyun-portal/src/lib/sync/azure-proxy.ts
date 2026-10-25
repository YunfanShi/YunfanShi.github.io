import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, requestIdFrom } from '@/lib/api-response';

/** One backend per request: never retry a mutation against a second database. */
export async function forwardAzureSync(request: NextRequest): Promise<NextResponse | null> {
  const endpoint = process.env.AZURE_SYNC_API_URL;
  const requestId = requestIdFrom(request);
  const origin=request.headers.get('origin');
  if(origin&&origin!==request.nextUrl.origin)return apiError(requestId,'Cross-site sync request denied',403,'ORIGIN_DENIED');
  const started = Date.now();
  const trace = (stage:string,status:number,error?:unknown,upstreamRequestId?:string|null) => {
    const failure = error && typeof error === 'object' ? error as {name?:unknown;cause?:{code?:unknown}} : undefined;
    const causeCode = failure?.cause?.code;
    console.warn('[sync-proxy]',JSON.stringify({requestId,route:request.nextUrl.pathname,method:request.method,
      stage,status,durationMs:Date.now()-started,
      errorName:['TimeoutError','AbortError','TypeError','Error'].includes(String(failure?.name)) ? failure?.name : undefined,
      causeCode:typeof causeCode==='string' && /^E[A-Z_]{1,40}$/.test(causeCode) ? causeCode : undefined,
      upstreamRequestId:upstreamRequestId && /^[a-f0-9-]{36}$/i.test(upstreamRequestId) ? upstreamRequestId : undefined}));
  };
  if (!endpoint) { if(request.nextUrl.pathname==='/api/sync/v3')trace('configuration_missing',503); return null; }
  let target: URL;
  try {
    const base = new URL(endpoint);
    if (base.protocol !== 'https:' || !/^jackyun-sync-9d26b2cc(?:-[a-z0-9]+)?\.(?:[a-z0-9-]+\.)?azurewebsites\.net$/.test(base.hostname)
      || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Invalid endpoint');
    target = new URL(request.nextUrl.pathname + request.nextUrl.search, base);
  } catch {
    trace('configuration_invalid',503);
    return apiError(requestId, 'Sync backend is unavailable', 503, 'SYNC_CONFIGURATION_ERROR');
  }
  const result = await (async()=>{
    try {
      const supabase = await createClient();
      // This session only transports a token. Azure verifies its signature, expiry and identity.
      return await supabase.auth.getSession();
    } catch (error) { trace('session_fetch',500,error); throw error; }
  })();
  const { data: { session }, error } = result;
  if (error || !session?.access_token) { trace('session',401); return apiError(requestId, 'Please sign in', 401, 'UNAUTHORIZED'); }
  const limit = request.nextUrl.pathname.endsWith('/large') ? 250_000 : 1_000_000;
  if (Number(request.headers.get('content-length') ?? 0) > limit) {
    return apiError(requestId, 'Request body too large', 413, 'PAYLOAD_TOO_LARGE');
  }
  const headers = new Headers({ Authorization: `Bearer ${session.access_token}`, 'X-Request-Id':requestId });
  const reason=request.headers.get('x-sync-reason');
  const expectedAccount=request.headers.get('x-sync-account');
  if(expectedAccount&&/^[0-9a-f-]{36}$/i.test(expectedAccount))headers.set('X-Sync-Account',expectedAccount);
  if(reason && ['manual','periodic','edit','online','resume'].includes(reason))headers.set('X-Sync-Reason',reason);
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  // Origin is verified above at the browser-facing boundary. This authenticated
  // server-to-server request must not reuse a deployment's browser CORS origin.
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
    if (!upstream.ok) trace('upstream_response',upstream.status,undefined,upstream.headers.get('x-request-id'));
    return new NextResponse(upstream.body, { status: upstream.status, headers: {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': upstream.headers.get('x-request-id') ?? requestId,
      ...(upstream.headers.get('retry-after') ? {'Retry-After':upstream.headers.get('retry-after')!.slice(0,128)}:{}),
    } });
  } catch (error) {
    trace('upstream_fetch',503,error);
    return apiError(requestId, 'Sync backend is temporarily unavailable', 503, 'SYNC_UNAVAILABLE');
  }
}
