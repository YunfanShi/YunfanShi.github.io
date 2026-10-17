import type { SupabaseClient } from '@supabase/supabase-js';

/** Verified JWT identity only. Permission checks and RLS remain at their existing boundaries.
 * ES256/RS256 use cached public keys, so ordinary calls do not depend on Auth /user.
 * Never replace this with getSession(), unsigned decoding, or allowExpired.
 */
export async function getVerifiedUser(supabase: Pick<SupabaseClient, 'auth'>) {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims) return { data: { user: null }, error };
  if (!claims.sub || claims.role !== 'authenticated' || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) {
    return { data: { user: null }, error: Object.assign(new Error('Invalid or expired session'), { name: 'AuthInvalidTokenError', status: 401 }) };
  }
  return { data: { user: { id: claims.sub, email: claims.email, app_metadata: claims.app_metadata ?? {}, user_metadata: claims.user_metadata ?? {} } }, error: null };
}
