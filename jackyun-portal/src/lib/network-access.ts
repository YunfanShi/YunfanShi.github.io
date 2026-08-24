export const NETWORK_RELATIONSHIPS = ['朋友', '同学', '家人', '访客', '其他'] as const;

const MAC_PATTERN = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
const PRIVATE_IPV4_PATTERN = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

export type NetworkRegistrationPayload = {
  claimedName: string;
  relationship?: string;
  deviceLabel?: string;
  clientMac?: string;
  clientIp?: string;
  routerNasId?: string;
  privacyAccepted: boolean;
  website?: string;
};

export function normalizeMac(value?: string | null) {
  const normalized = value?.trim().replaceAll('-', ':').toUpperCase() ?? '';
  return MAC_PATTERN.test(normalized) ? normalized : undefined;
}

export function normalizePrivateIpv4(value?: string | null) {
  const normalized = value?.trim() ?? '';
  if (!PRIVATE_IPV4_PATTERN.test(normalized)) return undefined;
  const octets = normalized.split('.').map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) ? normalized : undefined;
}

export function normalizeOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

export function firstSearchParam(
  params: Record<string, string | string[] | undefined>,
  aliases: string[],
) {
  for (const alias of aliases) {
    const value = params[alias];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value) && value[0]?.trim()) return value[0].trim();
  }
  return undefined;
}
