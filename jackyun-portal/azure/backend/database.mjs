import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { ApiError } from './errors.mjs';

export function createDatabase(config) {
  if (!config.host || !config.user || !config.database || !config.password || !config.caPath) {
    throw new Error('Explicit database host, user, database, password and trusted CA are required');
  }
  const pool = new Pool({
    host: config.host, user: config.user, database: config.database, password: config.password,
    port: config.port ?? 5432, ssl: { ca: readFileSync(config.caPath, 'utf8'), rejectUnauthorized: true, servername: config.servername ?? config.host },
    max: 4, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000,
    statement_timeout: 15_000, query_timeout: 20_000,
    application_name: 'jackyun-azure-sync-api',
  });
  pool.on('error', () => { /* Failed idle connections are removed without logging credentials. */ });
  return {
    async withUser(identity, work, { write = false, onMetrics } = {}) {
      const started=performance.now();
      const client = await pool.connect();
      const poolWaitMs=performance.now()-started;let sqlCount=0;
      const query=(...args)=>{sqlCount++;return client.query(...args);};
      let broken = false;
      try {
        await query('BEGIN');
        const role = (await query(`SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole,
          rolreplication FROM pg_roles WHERE rolname = session_user`)).rows[0];
        if (!role || Object.values(role).some(Boolean)) throw new ApiError(503, 'UNSAFE_DATABASE_LOGIN');
        await query('SET LOCAL ROLE jackyun_sync_runtime');
        await query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true), set_config('lock_timeout','5s',true), set_config('idle_in_transaction_session_timeout','30s',true)",
          [identity.sub, JSON.stringify(identity)]);
        const allowed = (await query('SELECT public.sync_identity_allowed() AS allowed')).rows[0]?.allowed;
        if (!allowed) throw new ApiError(403, 'ACCOUNT_DISABLED');
        // Serialize mutations across connections/replicas, including rate counts and first inserts.
        if (write) await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [identity.sub]);
        const result = await work({query});
        await query('COMMIT');
        return result;
      } catch (error) {
        try { await query('ROLLBACK'); } catch { broken = true; }
        throw error;
      } finally { client.release(broken);onMetrics?.({sqlCount,poolWaitMs:Math.round(poolWaitMs),databaseMs:Math.round(performance.now()-started)}); }
    },
    close: () => pool.end(),
  };
}
