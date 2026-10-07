import { Readable } from 'node:stream';
import { createApiHandler } from './server.mjs';

// Reuse the native HTTP contract, including bounded body parsing and error redaction.
export function createFunctionHandler(options) {
  const handle = createApiHandler(options);
  return async function functionHandler(request) {
    const input = request.body ? Readable.fromWeb(request.body) : Readable.from([]);
    input.method = request.method.toUpperCase();
    input.url = request.url;
    input.headers = Object.fromEntries(request.headers.entries());
    // Cancelling an unused/oversized upstream body must not create an unhandled error.
    input.on('error', () => {});
    const output = { status: 200, headers: {}, body: '' };
    const response = {
      headersSent: false,
      setHeader: (name, value) => { output.headers[name] = value; },
      writeHead(status) { output.status = status; this.headersSent = true; },
      end: (body = '') => { output.body = body; },
    };
    try { await handle(input, response); return output; }
    finally { input.destroy(); }
  };
}

export function registerFunctions(app, handler) {
  app.setup({ enableHttpStream: true });
  app.http('sync', {
    route: 'api/sync/{*path}', methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    authLevel: 'anonymous', handler,
  });
  app.http('liveness', { route: 'health/live', methods: ['GET'], authLevel: 'anonymous', handler });
  app.http('legacySync', { route: 'api/legacy-sync', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], authLevel: 'anonymous', handler });
}
