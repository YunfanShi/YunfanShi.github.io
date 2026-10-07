import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { ApiError } from './errors.mjs';

export function createDatabase(config) {
  if (!config.host || !config.user || !config.database || !config.password || !config.caPath) {
    throw new Error('Explicit database host, user, database, password and trusted CA are required');
  }
  const pool = new Pool({
    host: config.host, user: config.user, database: config.database, password: config.password,
    port: 5432, ssl: { ca: readFileSync(config.caPath, 'utf8'), rejectUnauthorized: true },
    max: 4, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000,
    statement_timeout: 15_000, query_timeout: 20_000,
    application_name: 'jackyun-azure-sync-api',
  });
  pool.on('error', () => { /* Failed idle connections are removed without logging credentials. */ });
  return {
    async withUser(identity, work, { write = false } = {}) {
      const client = await pool.connect();
      let broken = false;
      try {
        await client.query('BEGIN');
        const role = (await client.query(`SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole,
          rolreplication FROM pg_roles WHERE rolname = session_user`)).rows[0];
        if (!role || Object.values(role).some(Boolean)) throw new ApiError(503, 'UNSAFE_DATABASE_LOGIN');
        await client.query('SET LOCAL ROLE jackyun_sync_runtime');
        await client.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
          [identity.sub, JSON.stringify(identity)]);
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");
        const allowed = (await client.query('SELECT public.sync_identity_allowed() AS allowed')).rows[0]?.allowed;
        if (!allowed) throw new ApiError(403, 'ACCOUNT_DISABLED');
        // Serialize mutations across connections/replicas, including rate counts and first inserts.
        if (write) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [identity.sub]);
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { broken = true; }
        throw error;
      } finally { client.release(broken); }
    },
    close: () => pool.end(),
  };
}
