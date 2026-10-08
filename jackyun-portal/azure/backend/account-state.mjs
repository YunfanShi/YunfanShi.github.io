import { ApiError } from './errors.mjs';

// Until profile provisioning is migrated, Supabase is the account-state authority.
// Query as the verified user, never with service_role or a cross-user cached session.
export function createAccountStateVerifier({ supabaseUrl, publishableKey, fetchImpl = fetch }) {
  const origin = new URL(supabaseUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash
    || origin.pathname !== '/' || !/^[a-z0-9]+\.supabase\.co$/.test(origin.hostname)) throw Error('Trusted project origin required');
  return async function verifyAccount(identity, token) {
    if (!publishableKey) throw new ApiError(503, 'ACCOUNT_STATE_UNAVAILABLE');
    const url = new URL('/rest/v1/profiles', origin);
    url.searchParams.set('select','id,account_status,deleted_at');
    url.searchParams.set('id',`eq.${identity.sub}`);
    let response;
    try {
      response = await fetchImpl(url,{ headers:{ apikey:publishableKey,Authorization:`Bearer ${token}` },
        cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5_000) });
    } catch { throw new ApiError(503,'ACCOUNT_STATE_UNAVAILABLE'); }
    if (response.status === 401) throw new ApiError(401,'UNAUTHORIZED');
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
