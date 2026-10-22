import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose';
import { ApiError } from './errors.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createAuthenticator({ supabaseUrl, publishableKey, keyResolver, fetchImpl = fetch, verifyAccount }) {
  const origin = new URL(supabaseUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash
      || origin.pathname !== '/' || !/^[a-z0-9]+\.supabase\.co$/.test(origin.hostname)) {
    throw new Error('A trusted Supabase project origin is required');
  }
  const issuer = `${origin.origin}/auth/v1`;
  const jwks = keyResolver ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
    cacheMaxAge: 600_000, cooldownDuration: 30_000, timeoutDuration: 5_000,
  });
  return async function authenticate(authorization) {
    const match = typeof authorization === 'string' && /^Bearer ([A-Za-z0-9_.-]{1,8192})$/.exec(authorization);
    if (!match) throw new ApiError(401, 'UNAUTHORIZED');
    const token = match[1];
    let claims;
    let header;
    try { header = decodeProtectedHeader(token); claims = decodeJwt(token); }
    catch { throw new ApiError(401, 'UNAUTHORIZED'); }
    if (header.alg === 'HS256') {
      // Legacy signatures are verified by Auth, never by distributing its signing secret.
      if (!publishableKey) throw new ApiError(503, 'AUTH_UNAVAILABLE');
      let response;
      try {
        response = await fetchImpl(`${issuer}/user`, {
          headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5_000), redirect: 'error',
        });
      } catch { throw new ApiError(503, 'AUTH_UNAVAILABLE'); }
      if ([400, 401, 403].includes(response.status)) throw new ApiError(401, 'UNAUTHORIZED');
      if (!response.ok) throw new ApiError(503, 'AUTH_UNAVAILABLE');
      let user;
      try {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Missing Auth response');
        const chunks = [];
        let size = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 262_144) throw new Error('Auth response too large');
            chunks.push(value);
          }
          user = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } finally { await reader.cancel(); reader.releaseLock(); }
      } catch { throw new ApiError(503, 'AUTH_UNAVAILABLE'); }
      if (user.id !== claims.sub || user.is_anonymous === true) throw new ApiError(401, 'UNAUTHORIZED');
      if (user.banned_until && Date.parse(user.banned_until) > Date.now()) throw new ApiError(403, 'ACCOUNT_DISABLED');
    } else if (['ES256', 'RS256'].includes(header.alg)) {
      try {
        ({ payload: claims } = await jwtVerify(token, jwks, {
          issuer, audience: 'authenticated', algorithms: ['ES256', 'RS256'],
          requiredClaims: ['sub', 'exp', 'iat', 'session_id'], clockTolerance: 5,
        }));
      } catch (error) {
        if (['ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID'].includes(error.code) || !error.code) {
          throw new ApiError(503, 'AUTH_UNAVAILABLE');
        }
        throw new ApiError(401, 'UNAUTHORIZED');
      }
    } else { throw new ApiError(401, 'UNAUTHORIZED'); }
    const now = Date.now() / 1000;
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== issuer || !audience.includes('authenticated') || claims.role !== 'authenticated'
        || !UUID.test(claims.sub ?? '') || !UUID.test(claims.session_id ?? '') || claims.is_anonymous === true
        || !Number.isFinite(claims.exp) || claims.exp <= now - 5
        || !Number.isFinite(claims.iat) || claims.iat > now + 5
        || (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 5))) {
      throw new ApiError(401, 'UNAUTHORIZED');
    }
    // Never pass editable user metadata, a client user_id or arbitrary DB roles to SQL.
    const identity = { sub: claims.sub, session_id: claims.session_id, role: 'authenticated' };
    if (verifyAccount) await verifyAccount(identity,token,{expiresAt:claims.exp});
    return identity;
  };
}
