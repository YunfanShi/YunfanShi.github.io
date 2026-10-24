import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeSyncDiagnostic } from '@/lib/sync/diagnostics';
import { requestIdFrom } from '@/lib/api-response';

const lastReports = new Map<string,number>();
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return new NextResponse(null,{status:403});
  if (!request.headers.get('content-type')?.startsWith('application/json')) return new NextResponse(null,{status:415});
  if (Number(request.headers.get('content-length') ?? 0) > 2048) return new NextResponse(null,{status:413});
  const supabase = await createClient();
  const {data:{user},error} = await supabase.auth.getUser();
  if (error || !user) return new NextResponse(null,{status:401});
  const now = Date.now();
  for (const [id,time] of lastReports) if (now-time >= 60_000) lastReports.delete(id);
  if (lastReports.has(user.id) || lastReports.size >= 1000) return new NextResponse(null,{status:429});
  lastReports.set(user.id,now);
  const reader = request.body?.getReader();
  if (!reader) return new NextResponse(null,{status:400});
  let text = '';
  let size = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 2048) { await reader.cancel(); return new NextResponse(null,{status:413}); }
      text += decoder.decode(part.value,{stream:true});
    }
    text += decoder.decode();
    const report = sanitizeSyncDiagnostic(JSON.parse(text));
    if (!report) return new NextResponse(null,{status:400});
    console.warn('[sync-diagnostic]',JSON.stringify({requestId:requestIdFrom(request),...report}));
    return new NextResponse(null,{status:204,headers:{'Cache-Control':'no-store'}});
  } catch { return new NextResponse(null,{status:400}); }
  finally { reader.releaseLock(); }
}
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;
