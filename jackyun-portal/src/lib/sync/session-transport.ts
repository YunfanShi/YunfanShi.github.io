'use client';
import {fetchSyncWithTimeout} from '../request-timeout.ts';
let refresh:Promise<boolean>|undefined,lastAttempt=0;
/** Only a definitive 401 can replay the unchanged request after SDK reauthentication. */
export async function fetchAuthenticatedSync(input:RequestInfo|URL,init?:RequestInit,reportError=false):Promise<Response>{
  const deadline=AbortSignal.timeout(60_000);
  init={...init,signal:init?.signal?AbortSignal.any([init.signal,deadline]):deadline};
  const response=await fetchSyncWithTimeout(input,init,reportError);
  if(response.status!==401||init?.signal?.aborted)return response;
  if(!refresh&&Date.now()-lastAttempt>=30_000){
    lastAttempt=Date.now();
    refresh=import('../supabase/client').then(async({createClient})=>{
      const {data,error}=await createClient().auth.refreshSession();return !error&&Boolean(data.session);
    }).catch(()=>false).finally(()=>{refresh=undefined;});
  }
  if(!refresh||!await refresh)return response;
  await response.body?.cancel();
  window.dispatchEvent(new Event('jackyun-auth-recovered'));
  return fetchSyncWithTimeout(input,init,reportError);
}
