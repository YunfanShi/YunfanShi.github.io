export interface RedirectInfo { url: string; name: string }

// Preserve the historical link format. This obfuscates links; it is not encryption.
const LEGACY_XOR_KEY = 'JackWarden2024XOR';
function xor(value: string): string {
  return Array.from({ length: value.length }, (_, index) => String.fromCharCode(
    value.charCodeAt(index) ^ LEGACY_XOR_KEY.charCodeAt(index % LEGACY_XOR_KEY.length),
  )).join('');
}

export function encodeRedirectToken(info: RedirectInfo): string {
  const bytes = new TextEncoder().encode(xor(JSON.stringify(info)));
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

export function decodeRedirectToken(token: string): RedirectInfo {
  const raw = atob(token);
  let utf8: string;
  try {
    utf8 = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, (character) => character.charCodeAt(0)));
  } catch { utf8 = raw; } // Older plain btoa links can contain Latin-1 bytes.
  // Accept both current plain Base64 and older XOR/UTF-8 links.
  for (const candidate of [utf8, xor(utf8), raw]) {
    try {
      const value = JSON.parse(candidate) as Partial<RedirectInfo> | null;
      if (value && typeof value.url === 'string' && typeof value.name === 'string'
          && ['http:', 'https:'].includes(new URL(value.url).protocol)) return value as RedirectInfo;
    } catch { /* Try the next previously published format. */ }
  }
  throw new Error('无效的跳转参数');
}
