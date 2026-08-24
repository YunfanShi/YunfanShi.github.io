import { NextRequest, NextResponse } from 'next/server';
import { firstSearchParam, normalizeMac, normalizePrivateIpv4 } from '@/lib/network-access';
import {
  createNetworkPortalSession,
  NETWORK_PORTAL_COOKIE,
  NETWORK_PORTAL_SESSION_SECONDS,
  secretsMatch,
} from '@/lib/network-portal-session';

export const dynamic = 'force-dynamic';

function unavailable() {
  return new NextResponse('Not Found', {
    status: 404,
    headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });
}

export function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const entryKey = firstSearchParam(params, ['portal_key', 'portalKey']);
  if (!secretsMatch(entryKey, process.env.NETWORK_PORTAL_ENTRY_KEY)) return unavailable();

  const clientMac = normalizeMac(firstSearchParam(params, ['client_mac', 'clientmac', 'mac', 'sta_mac']));
  const clientIp = normalizePrivateIpv4(firstSearchParam(params, ['client_ip', 'clientip', 'ip', 'sta_ip']));
  const routerNasId = firstSearchParam(params, ['nas_id', 'nasid', 'router_id'])?.slice(0, 80);
  const session = createNetworkPortalSession(
    { clientMac, clientIp, routerNasId },
    process.env.NETWORK_PORTAL_SESSION_SECRET ?? '',
  );
  if (!session) return unavailable();

  const response = NextResponse.redirect(new URL('/network-access', request.url), 303);
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer');
  response.cookies.set(NETWORK_PORTAL_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: NETWORK_PORTAL_SESSION_SECONDS,
  });
  return response;
}
