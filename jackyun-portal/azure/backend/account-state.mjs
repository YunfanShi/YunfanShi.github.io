import { ApiError } from './errors.mjs';

const CACHE_MS = 5 * 60_000;
const RETRY_MS = 30_000;
const MAX_SESSIONS = 500;

// Until profile provisioning is migrated, Supabase is the account-state authority.
// Query as the verified user, never with service_role or a cross-user cached session.
export function createAccountStateVerifier({ supabaseUrl, publishableKey, fetchImpl = fetch, now = Date.now }) {
  const origin = new URL(supabaseUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash
    || origin.pathname !== '/' || !/^[a-z0-9]+\.supabase\.co$/.test(origin.hostname)) throw Error('Trusted project origin required');
  const sessions = new Map();
  const pending = new Map();
  return async function verifyAccount(identity, token, verified = {}) {
    // Only the authenticator may supply expiry, after signature and claim validation.
    const stamp=now(), expiresAt=Number(verified.expiresAt)*1000;
    const cacheable=Number.isFinite(expiresAt)&&expiresAt>stamp;
    const key=identity.sub+':'+identity.session_id;
    const previous=cacheable?sessions.get(key):undefined;
    const usable=previous&&previous.until>stamp;
    if(usable&&previous.nextCheck>stamp)return;
    try {
      // Coalesce only the same verified session and signed expiry. A cold instance
      // must still obtain an authoritative active profile before allowing access.
      const flightKey = key + ':' + expiresAt;
      let flight = cacheable ? pending.get(flightKey) : undefined;
      if (!flight) {
        if (pending.size >= MAX_SESSIONS) throw new ApiError(503, 'ACCOUNT_STATE_UNAVAILABLE');
        flight = checkWithRecovery(identity, token);
        if (cacheable) pending.set(flightKey, flight);
      }
      try { await flight; }
      finally { if (pending.get(flightKey) === flight) pending.delete(flightKey); }
      if(cacheable){
        for(const [key,value] of sessions)if(value.until<=stamp)sessions.delete(key);
        sessions.delete(key);sessions.set(key,{until:expiresAt,nextCheck:Math.min(expiresAt,stamp+CACHE_MS)});
        while(sessions.size>MAX_SESSIONS)sessions.delete(sessions.keys().next().value);
      }
    }catch(error){
      // A known active session can bridge an outage, never an explicit denial or an expired JWT.
      if(error.status===503&&usable){previous.nextCheck=Math.min(previous.until,stamp+RETRY_MS);return;}
      sessions.delete(key);throw error;
    }
  };
  async function checkWithRecovery(identity, token) {
    if (!publishableKey) throw new ApiError(503, 'ACCOUNT_STATE_UNAVAILABLE');
    try { await checkAccount(identity, token); }
    catch (error) {
      // Only retry this read. Never replay sync writes or retry an explicit denial.
      if (error.status !== 503) throw error;
      await checkAccount(identity, token);
    }
  }
  async function checkAccount(identity, token) {
    if (!publishableKey) throw new ApiError(503, 'ACCOUNT_STATE_UNAVAILABLE');
    const url = new URL('/rest/v1/profiles', origin);
    url.searchParams.set('select','id,account_status,deleted_at');
    url.searchParams.set('id',`eq.${identity.sub}`);
    let response;
    try {
      response = await fetchImpl(url,{ headers:{ apikey:publishableKey,Authorization:`Bearer ${token}` },
        cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8_000) });
    } catch { throw new ApiError(503,'ACCOUNT_STATE_UNAVAILABLE'); }
    if (response.status === 401) throw new ApiError(401,'UNAUTHORIZED');
    if (response.status === 403) throw new ApiError(403,'ACCOUNT_DISABLED');
    if (!response.ok) throw new ApiError(503,'ACCOUNT_STATE_UNAVAILABLE');
    let records;
    try {
      const reader = response.body?.getReader();
      if (!reader) throw Error('Missing response');
      let size = 0; const chunks = [];
      try {
        for (;;) {
          const {done,value} = await reader.read(); if (done) break;
          size += value.byteLength; if (size > 4096) throw Error('Oversize response');
          chunks.push(value);
        }
        records = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } finally { await reader.cancel(); reader.releaseLock(); }
    } catch { throw new ApiError(503,'ACCOUNT_STATE_UNAVAILABLE'); }
    if (!Array.isArray(records) || records.length > 1) throw new ApiError(503,'ACCOUNT_STATE_UNAVAILABLE');
    const profile = records[0];
    if (!profile || profile.id !== identity.sub || profile.account_status !== 'active' || profile.deleted_at !== null) {
      throw new ApiError(403,'ACCOUNT_DISABLED');
    }
  };
}
