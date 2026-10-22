// Loopback-only UI contract fixture. No real Supabase project or credentials.
import { createServer } from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const UI_USERS = {
  user: '10000000-0000-4000-8000-000000000001',
  admin: '10000000-0000-4000-8000-000000000002',
  beta: '10000000-0000-4000-8000-000000000003',
};

export function createUiBackend() {
  const signingKey = randomBytes(32);
  const state = { historyDelay: 0, historyFail: false, dismissDelay: 0, dismissFail: false, logoutFail: false, statsDelay: 0, announcementWriteDelay: 0, announcementWriteFail: false, announcements: [], supportEnabled: false, supportReadDelay: 0, supportReadFail: false, supportWriteDelay: 0, supportWriteFail: false, supportMessages: [], calls: [], read: new Set() };
  const userFor = id => ({ id, aud: 'authenticated', role: 'authenticated', email: `${Object.keys(UI_USERS).find(key => UI_USERS[key] === id)}@example.test`, app_metadata: { provider: 'github', providers: ['github'] }, user_metadata: { full_name: '本机测试用户' }, created_at: '2026-01-01T00:00:00Z' });
  function session(role) {
    const user = userFor(UI_USERS[role] || UI_USERS.user);
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: user.id, aud: user.aud, role: user.role, email: user.email, app_metadata: user.app_metadata, user_metadata: user.user_metadata, exp, iat: exp - 3600 })).toString('base64url');
    const token = `${header}.${payload}.${createHmac('sha256', signingKey).update(`${header}.${payload}`).digest('base64url')}`;
    return { access_token: token, refresh_token: 'local-fixture-refresh', expires_at: exp, expires_in: 3600, token_type: 'bearer', user };
  }
  function identity(request) {
    try {
      const token = (request.headers.authorization || '').replace(/^Bearer /, '');
      const [header, payload, signature] = token.split('.');
      const expected = createHmac('sha256', signingKey).update(`${header}.${payload}`).digest();
      const actual = Buffer.from(signature, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) return null;
      const claims = JSON.parse(Buffer.from(payload, 'base64url'));
      return Object.values(UI_USERS).includes(claims.sub) && claims.exp > Date.now() / 1000 ? userFor(claims.sub) : null;
    } catch { return null; }
  }
  const notification = (user, n) => ({ id: `20000000-0000-4000-8000-00000000000${n}`, title: n === 1 ? '本机通知测试' : '本机历史通知', content: `保留原消息内容 ${n}`, content_type: 'markdown', delivery_type: 'notice', is_read: state.read.has(n), is_active: true, start_time: null, end_time: null, created_by: null, recipient_user_id: user.id, related_ticket_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,HEAD,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    const send = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    let body = {};
    if (['POST', 'PATCH'].includes(req.method)) {
      const parts = []; for await (const chunk of req) parts.push(chunk);
      try { body = JSON.parse(Buffer.concat(parts)); } catch { /* Requests without a JSON body. */ }
    }
    if (url.pathname === '/_test/session') return send(session(url.searchParams.get('role')));
    if (url.pathname === '/_test/control' && req.method === 'POST') {
      for (const key of ['historyDelay', 'historyFail', 'dismissDelay', 'dismissFail', 'logoutFail', 'statsDelay', 'announcementWriteDelay', 'announcementWriteFail', 'supportEnabled', 'supportReadDelay', 'supportReadFail', 'supportWriteDelay', 'supportWriteFail']) if (key in body) state[key] = body[key];
      if (body.reset) { state.calls.length = 0; state.read.clear(); state.announcements.length = 0; state.supportMessages.length = 0; }
      return send({ ok: true });
    }
    if (url.pathname === '/_test/calls') return send(state.calls);
    const user = identity(req);
    // Store paths/counts only. Never retain session tokens, cookies or headers.
    state.calls.push({ path: url.pathname, method: req.method, userId: user?.id ?? null, at: Date.now() });
    if (url.pathname === '/auth/v1/user') return user ? send(user) : send({ message: 'Invalid fixture session', code: 'bad_jwt' }, 401);
    if (url.pathname === '/auth/v1/logout') return state.logoutFail ? send({ message: 'Fixture logout failure' }, 503) : send({});
    if (url.pathname === '/rest/v1/profiles') return send([{ id: user?.id, role: user?.id === UI_USERS.admin ? 'admin' : 'user', account_status: 'active', deleted_at: null, display_name: '本机测试用户' }]);
    if (url.pathname === '/rest/v1/beta_enrollments') return send(user?.id === UI_USERS.beta ? [{ status: 'accepted' }] : []);
    if (state.supportEnabled && url.pathname === '/rest/v1/bug_reports') {
      if (!user) return send({ message: 'Unauthorized' }, 401);
      if (req.method !== 'GET') return send([]);
      if (url.searchParams.has('id')) {
        if (state.supportReadDelay) await new Promise(resolve => setTimeout(resolve, state.supportReadDelay));
        if (state.supportReadFail) return send({ message: 'Fixture conversation unavailable' }, 503);
      }
      return send([{ id: '40000000-0000-4000-8000-000000000001', user_id: user.id, title: '本机客服交互验证', status: 'open', ticket_type: 'usage_help', severity: 'normal', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]);
    }
    if (state.supportEnabled && url.pathname === '/rest/v1/support_replies') {
      if (!user) return send({ message: 'Unauthorized' }, 401);
      if (req.method === 'POST') {
        if (state.supportWriteDelay) await new Promise(resolve => setTimeout(resolve, state.supportWriteDelay));
        if (state.supportWriteFail) return send({ message: 'Fixture message write unavailable' }, 503);
        state.supportMessages.push({ ...body, id: `message-${state.supportMessages.length + 1}`, message_kind: 'message', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        return send([]);
      }
      return send(state.supportMessages);
    }
    if (url.pathname === '/rest/v1/rpc/notification_snapshot') {
      if (!user) return send({ message: 'Unauthorized' }, 401);
      if (body.include_history && state.historyDelay) await new Promise(resolve => setTimeout(resolve, state.historyDelay));
      if (body.include_history && state.historyFail) return send({ message: 'Fixture history unavailable' }, 503);
      const items = body.include_history ? [notification(user, 1), notification(user, 2)] : state.read.has(1) ? [] : [notification(user, 1)];
      return send({ items, unreadCount: state.read.has(1) ? 0 : 1, hasMore: false, nextOffset: items.length });
    }
    if (url.pathname === '/rest/v1/rpc/admin_dashboard_overview') {
      return send({
        metrics: { total_users: 0, new_users: 0, active_notifications: 0, open_reports: 0, restricted_accounts: 0 },
        trends: { users: [], reports: [], focus_minutes: [] },
        todos: { reports: [], accounts: [], notifications: [] },
      });
    }
    if (url.pathname === '/rest/v1/rpc/create_site_notification') {
      if (state.announcementWriteDelay) await new Promise(resolve => setTimeout(resolve, state.announcementWriteDelay));
      if (state.announcementWriteFail) return send({ message: 'Fixture announcement write unavailable' }, 503);
      const now = new Date().toISOString();
      const id = `30000000-0000-4000-8000-${String(state.announcements.length + 1).padStart(12, '0')}`;
      state.announcements.push({ ...body.payload, id, created_by: user?.id ?? null, recipient_user_id: null, related_ticket_id: null, is_read: false, created_at: now, updated_at: now });
      return send(null);
    }
    if (url.pathname === '/rest/v1/rpc/list_site_notifications') return send(state.announcements);
    if (url.pathname === '/rest/v1/rpc/update_site_notification') {
      if (state.announcementWriteDelay) await new Promise(resolve => setTimeout(resolve, state.announcementWriteDelay));
      if (state.announcementWriteFail) return send({ message: 'Fixture announcement write unavailable' }, 503);
      const index = state.announcements.findIndex(item => item.id === body.p_id);
      if (index < 0) return send({ message: 'Announcement not found' }, 404);
      state.announcements[index] = { ...state.announcements[index], ...body.payload, updated_at: new Date().toISOString() };
      return send(null);
    }
    if (url.pathname === '/rest/v1/rpc/delete_site_notification') {
      if (state.announcementWriteDelay) await new Promise(resolve => setTimeout(resolve, state.announcementWriteDelay));
      if (state.announcementWriteFail) return send({ message: 'Fixture announcement write unavailable' }, 503);
      state.announcements = state.announcements.filter(item => item.id !== body.p_id);
      return send(null);
    }
    if (url.pathname === '/rest/v1/site_notifications') return send(user ? [{ id: notification(user, 1).id }] : []);
    if (url.pathname === '/rest/v1/notification_dismissals' && req.method === 'POST') {
      if (state.dismissDelay) await new Promise(resolve => setTimeout(resolve, state.dismissDelay));
      if (state.dismissFail) return send({ message: 'Fixture dismiss failure', code: 'fixture_failure' }, 503);
      for (const row of Array.isArray(body) ? body : [body]) state.read.add(Number(row.notification_id?.slice(-1)));
      return send([]);
    }
    if (state.statsDelay && ['/rest/v1/vocab_words', '/rest/v1/study_tasks'].includes(url.pathname)) await new Promise(resolve => setTimeout(resolve, state.statsDelay));
    if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Range': '*/0' }).end(); return; }
    // All other optional tables are empty. No claim of database/RLS fidelity.
    return send([]);
  });
  return { server, state };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { server } = createUiBackend();
  const port = Number(process.env.JACKYUN_UI_FIXTURE_PORT || 54329);
  server.listen(port, '127.0.0.1', () => console.log(`UI fixture listening on http://127.0.0.1:${port}`));
}
