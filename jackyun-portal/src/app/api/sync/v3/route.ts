import {NextRequest} from 'next/server';
import {forwardAzureSync} from '@/lib/sync/azure-proxy';
import {apiError,requestIdFrom} from '@/lib/api-response';

/** Revision manifest contains no private content or client-clock cursor. */
export async function GET(request:NextRequest) {
  return await forwardAzureSync(request) ?? apiError(requestIdFrom(request),'Versioned sync backend is not configured',503,'SYNC_CONFIGURATION_ERROR');
}
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
