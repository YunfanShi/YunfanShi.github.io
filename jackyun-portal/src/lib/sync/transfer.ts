export const SYNC_PART_BYTES = 60_000;
export const MAX_SYNC_PARTS = 200;
// Preserve compatibility with old clients and the existing 200-part database cap.
export const MAX_SYNC_UPLOAD_PART_BYTES = 120_000;
export const MAX_LARGE_SYNC_BYTES = 24_000_000;

export function splitSyncBody(body: string): string[] {
  const bytes = new TextEncoder().encode(body);
  if (bytes.length > MAX_LARGE_SYNC_BYTES) throw new Error('同步数据超过单条传输上限');
  const partBytes = Math.max(SYNC_PART_BYTES, Math.ceil(bytes.length / MAX_SYNC_PARTS));
  const parts: string[] = [];
  for (let start = 0; start < bytes.length; start += partBytes) {
    const part = bytes.subarray(start, start + partBytes);
    let binary = '';
    for (let offset = 0; offset < part.length; offset += 8_192) {
      binary += String.fromCharCode(...part.subarray(offset, offset + 8_192));
    }
    parts.push(btoa(binary));
  }
  return parts;
}

export function joinSyncParts(parts: string[]): unknown {
  const chunks = parts.map((part) => Uint8Array.from(atob(part), (character) => character.charCodeAt(0)));
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (bytes.length > MAX_LARGE_SYNC_BYTES) throw new Error('同步数据超过单条传输上限');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
