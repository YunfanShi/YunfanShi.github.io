import { createClient } from '@/lib/supabase/server';
import { randomUUID } from 'node:crypto';

export async function GET(request: Request) {
  const started = performance.now();
  const requestId = randomUUID();
  const url = new URL(request.url);
  const history = url.searchParams.get('history') === '1';
  const offset = Math.max(0, Math.min(100000, Number(url.searchParams.get('offset')) || 0));
  const reason = ['initial', 'interval', 'resume', 'mutation', 'history'].includes(url.searchParams.get('reason') ?? '')
    ? url.searchParams.get('reason') : 'initial';
  let backendCalls = 0, databaseCalls = 0, status = 500;
  const headers = { 'Cache-Control': 'private, no-store', 'X-Request-ID': requestId };
  try {
    const supabase = await createClient();
    backendCalls++;
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { status = 401; return Response.json({ error: 'Unauthorized' }, { status, headers }); }
    // Fresh account state remains authoritative on every request.
    backendCalls++; databaseCalls++;
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('account_status, deleted_at').eq('id', user.id).maybeSingle();
    if (profileError) throw new Error('Authorization unavailable');
    if (!profile || profile.account_status !== 'active' || profile.deleted_at) {
      status = 403; return Response.json({ error: 'Account unavailable' }, { status, headers });
    }
    backendCalls++; databaseCalls++;
    const { data, error } = await supabase.rpc('notification_snapshot', { include_history: history, page_offset: Math.floor(offset) });
    if (error) throw new Error('Snapshot unavailable');
    status = 200;
    return Response.json({ ...data, userId: user.id }, { headers });
  } catch {
    status = 503;
    return Response.json({ error: 'Notifications temporarily unavailable' }, { status, headers });
  } finally {
    // Counts are top-level database calls; RLS/internal function work is not misreported as measured SQL.
    console.info('[notification-snapshot]', JSON.stringify({ requestId, reason, status, backendCalls, databaseCalls, durationMs: Math.round(performance.now() - started) }));
  }
}
