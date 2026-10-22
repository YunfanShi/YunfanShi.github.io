import { getVerifiedUser } from '@/lib/supabase/verified-user';
import { createClient } from '@/lib/supabase/server';
import { validateSession, validateConfig } from '@/lib/learning/practice-timer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) { return control(undefined, request ? new URL(request.url).searchParams.get('status') === '1' : false); }
export async function POST(request: Request) {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: '来源无效。' }, { status: 403, headers });
  if (Number(request.headers.get('content-length')) > 1048576) return Response.json({ error: '记录过大。' }, { status: 413, headers });
  try { const text = await request.text(); if (text.length > 1048576) return Response.json({ error: '记录过大。' }, { status: 413, headers }); return control(JSON.parse(text)); }
  catch { return Response.json({ error: '计时同步请求格式无效。' }, { status: 400, headers }); }
}
async function control(value?: Record<string, unknown>, statusOnly = false) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await getVerifiedUser(supabase);
  if (authError && authError.name !== 'AuthSessionMissingError' && authError.status !== 401) return Response.json({ error: '暂时无法验证登录状态，请恢复连接后重试。' }, { status: 503, headers });
  if (!user) return Response.json({ error: '未登录，仅在本机记录。' }, { status: 401, headers });
  const action = value?.action ?? 'read';
  if (!['read','claim','save','touch','release'].includes(String(action)) || (action !== 'read' && (!uuid.test(String(value?.owner)) || (action !== 'claim' && !uuid.test(String(value?.token)))))) return Response.json({ error: '计时控制参数无效。' }, { status: 400, headers });
  let payload;
  try {
    if (action === 'claim' && (typeof value?.sessionId !== 'string' || !value.sessionId || value.sessionId.length > 150)) throw Error('练习编号无效。');
    if (action === 'save') {
      if (!Number.isSafeInteger(value?.revision) || Number(value?.revision) < 0) throw Error('计时版本无效。');
      const raw = value?.payload as Record<string, unknown>;
      const session = validateSession(raw?.session), config = validateConfig(raw?.config);
      // Checkpoints are settled at their send time. Anchor the live segment to server time.
      for (const [i,q] of session.questions.entries()) if (q.startedAt !== null) { if (i !== session.index || session.finished) throw Error('只能有一道题正在计时。'); q.startedAt = Date.now(); }
      session.updatedAt = Date.now(); payload = { session, config };
    }
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '计时记录无效。' }, { status: 400, headers }); }
  const { data, error } = statusOnly ? await supabase.rpc('practice_timer_status') : await supabase.rpc('practice_timer_control_compact', { p_action: action, p_owner: value?.owner ?? null, p_token: value?.token ?? null, p_revision: value?.revision ?? null, p_payload: payload ?? null, p_session: value?.sessionId ?? null });
  if (error) return Response.json({ error: '云端计时暂不可用，请保留本机记录后重试。' }, { status: 503, headers });
  if (data?.conflict) {
    const messages: Record<string, string> = {
      ACTIVE_SESSION: '已有云端练习，新练习继续在本机保存。',
      STALE_REVISION: '计时记录版本已更新，正在重新同步。',
      LOST_CONTROL: '另一设备已接管，本设备已退出计时。',
    };
    const message = messages[data.conflict];
    // Known conflicts are handled by the timer, without returning the large draft.
    return Response.json({ conflict: data.conflict, code: 'JY-2103', message: message ?? '计时同步发生冲突。', handled: Boolean(message) }, { status: 409, headers });
  }
  return Response.json(data, { headers });
}
