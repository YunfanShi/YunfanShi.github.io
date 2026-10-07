import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createAuthenticator } from './auth.mjs';
import { createAccountStateVerifier } from './account-state.mjs';
import { createDatabase } from './database.mjs';
import { createSyncApi } from './sync-api.mjs';
import { ApiError } from './errors.mjs';

async function readBody(request, limit) {
  if (Number(request.headers['content-length'] ?? 0) > limit) {
    request.resume(); throw new ApiError(413, 'PAYLOAD_TOO_LARGE');
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const cleanup = () => {
      request.off('data', data); request.off('end', end);
      request.off('error', error); request.off('aborted', aborted);
    };
    const error = () => { cleanup(); reject(new ApiError(400, 'INVALID_BODY')); };
    const aborted = error;
    const data = chunk => {
      size += chunk.length;
      if (size > limit) {
        cleanup(); request.resume(); reject(new ApiError(413, 'PAYLOAD_TOO_LARGE'));
      } else chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new ApiError(400, 'INVALID_BODY')); }
    };
    request.on('data', data); request.once('end', end);
    request.once('error', error); request.once('aborted', aborted);
  });
}

export function createApiHandler({ authenticate, handle, allowedOrigins = ['https://jackyun.top'], logger = console }) {
  const paths = new Set(['/api/sync/v2', '/api/sync/v2/large', '/api/sync/devices', '/api/sync/conflicts', '/api/legacy-sync']);
  return async (request, response) => {
    const requestId = randomUUID();
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Request-Id', requestId);
    const send = (status, value) => { response.writeHead(status); response.end(JSON.stringify({ ...value, requestId })); };
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/health/live' && request.method === 'GET') { send(200, { ok: true }); return; }
      if (!paths.has(url.pathname)) throw new ApiError(404, 'NOT_FOUND');
      const origin = request.headers.origin;
      if (origin && !allowedOrigins.includes(origin)) throw new ApiError(403, 'ORIGIN_DENIED');
      if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); }
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
        response.writeHead(204); response.end(); return;
      }
      const identity = await authenticate(request.headers.authorization);
      let body = null;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw new ApiError(415, 'JSON_REQUIRED');
        body = await readBody(request, url.pathname.endsWith('/large') ? 250_000 : 1_000_000);
      }
      const result = await handle(request.method, url, body, identity);
      send(200, result);
    } catch (error) {
      const expected = error instanceof ApiError;
      const status = expected ? error.status : error.code === '42501' ? 403 : 503;
      const code = expected ? error.code : error.code === '42501' ? 'SYNC_FORBIDDEN' : 'SYNC_UNAVAILABLE';
      // Database messages/details can contain payloads, IDs or credentials. Never log them.
      if (status >= 500) logger.error(JSON.stringify({ service: 'azure-sync-api', requestId, code }));
      request.resume();
      if (!response.headersSent) send(status, { ok: false, error: code, code });
      else response.end();
    }
  };
}

export function createApiServer(options) {
  const server = createServer(createApiHandler(options));
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const database = createDatabase({ host: process.env.PGHOST, database: process.env.PGDATABASE,
    user: process.env.PGUSER, password: process.env.PGPASSWORD, caPath: process.env.PGSSLROOTCERT });
  const authenticate = createAuthenticator({ supabaseUrl: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    verifyAccount: createAccountStateVerifier({ supabaseUrl: process.env.SUPABASE_URL,
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY }) });
  const server = createApiServer({ authenticate, handle: createSyncApi(database) });
  server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0', () => console.log('Azure sync API listening'));
  const stop = () => {
    server.close(() => { void database.close(); });
    setTimeout(() => { server.closeAllConnections(); void database.close(); }, 10_000).unref();
  };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
