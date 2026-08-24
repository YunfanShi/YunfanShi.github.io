import { createHmac, timingSafeEqual } from 'node:crypto';

export const NETWORK_PORTAL_COOKIE = 'network_portal_session';
export const NETWORK_PORTAL_SESSION_SECONDS = 15 * 60;

export type NetworkPortalSession = {
  version: 1;
  expiresAt: number;
  clientMac?: string;
  clientIp?: string;
  routerNasId?: string;
};

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function secretsMatch(received: string | null | undefined, expected: string | undefined) {
  if (!received || !expected || expected.length < 32) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function createNetworkPortalSession(
  device: Pick<NetworkPortalSession, 'clientMac' | 'clientIp' | 'routerNasId'>,
  secret: string,
  now = Date.now(),
) {
  if (secret.length < 32 || (!device.clientMac && !device.clientIp)) return undefined;
  const payload: NetworkPortalSession = {
    version: 1,
    expiresAt: now + NETWORK_PORTAL_SESSION_SECONDS * 1000,
    ...device,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyNetworkPortalSession(token: string | undefined, secret: string | undefined, now = Date.now()) {
  if (!token || !secret || secret.length < 32) return undefined;
  const [encoded, receivedSignature, extra] = token.split('.');
  if (!encoded || !receivedSignature || extra) return undefined;

  const expectedSignature = sign(encoded, secret);
  const receivedBuffer = Buffer.from(receivedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return undefined;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as NetworkPortalSession;
    if (parsed.version !== 1 || !Number.isSafeInteger(parsed.expiresAt) || parsed.expiresAt <= now) return undefined;
    if (!parsed.clientMac && !parsed.clientIp) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}
