import { ApiError } from './errors.mjs';

// Read a narrow source receipt as the authenticated user, never service_role.
export function createBackupCaptureVerifier({ supabaseUrl, publishableKey, fetchImpl = fetch }) {
  const origin = new URL(supabaseUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash
    || origin.pathname !== '/' || !/^[a-z0-9]+\.supabase\.co$/.test(origin.hostname)) throw Error('Trusted project origin required');
  return async function verifyBackupCapture(_identity, token, { page,generation,versionId }) {
    if (!publishableKey || !token) throw new ApiError(503,'BACKUP_CAPTURE_VERIFICATION_UNAVAILABLE');
    let response;
    try {
      response = await fetchImpl(new URL('/rest/v1/rpc/confirm_backup_capture',origin), {
        method:'POST',headers:{ apikey:publishableKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json' },
        body:JSON.stringify({ target_page:page,expected_generation:generation,target_version_id:versionId }),
        cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5_000),
      });
    } catch { throw new ApiError(503,'BACKUP_CAPTURE_VERIFICATION_UNAVAILABLE'); }
    if (response.status === 401) throw new ApiError(401,'UNAUTHORIZED');
    if (!response.ok) throw new ApiError(503,'BACKUP_CAPTURE_VERIFICATION_UNAVAILABLE');
    let confirmed;
    try {
      const reader=response.body?.getReader();if (!reader) throw Error('Missing response');
      const chunks=[];let size=0;
      try {
        for (;;) { const {done,value}=await reader.read();if (done) break;size+=value.byteLength;
          if (size>64) throw Error('Oversize response');chunks.push(value); }
        confirmed=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } finally { await reader.cancel();reader.releaseLock(); }
    } catch { throw new ApiError(503,'BACKUP_CAPTURE_VERIFICATION_UNAVAILABLE'); }
    if (typeof confirmed !== 'boolean') throw new ApiError(503,'BACKUP_CAPTURE_VERIFICATION_UNAVAILABLE');
    if (!confirmed) throw new ApiError(409,'BACKUP_CAPTURE_NOT_SAVED');
  };
}
