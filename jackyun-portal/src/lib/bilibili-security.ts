const BVID = /^BV[1-9A-HJ-NP-Za-km-z]{10}$/;
const DIGITS = /^\d{1,20}$/;
const CDN_SUFFIXES = ['.bilivideo.com'];
const ALLOWED_QN = new Set(['16', '32', '64', '74', '80', '112', '116', '120', '125', '126', '127']);
const ALLOWED_FNVAL = new Set(['1', '16', '64', '128', '256', '512', '1024', '2048', '4048']);

export function isValidBvid(value: string | null): value is string {
  return Boolean(value && BVID.test(value));
}

export function isValidNumericId(value: string | null): value is string {
  return Boolean(value && DIGITS.test(value));
}

export function normalizeQn(value: string | null): string {
  return value && ALLOWED_QN.has(value) ? value : '80';
}

export function normalizeFnval(value: string | null): string {
  return value && ALLOWED_FNVAL.has(value) ? value : '4048';
}

export function validateBilibiliCdnUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || (url.port && url.port !== '443')) return null;
    if (url.username || url.password || !CDN_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return null;
    return url;
  } catch {
    return null;
  }
}

export function boundedByteRange(header: string | null, maxBytes = 8 * 1024 * 1024): string {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header ?? '');
  const start = match ? Number(match[1]) : 0;
  const requestedEnd = match?.[2] ? Number(match[2]) : start + maxBytes - 1;
  const end = Number.isSafeInteger(requestedEnd) ? Math.min(requestedEnd, start + maxBytes - 1) : start + maxBytes - 1;
  return `bytes=${Math.max(0, start)}-${Math.max(0, end)}`;
}
