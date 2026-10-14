export const SYNC_PART_BYTES = 60_000;
export const MAX_SYNC_PARTS = 200;
// Preserve compatibility with old clients and the existing 200-part database cap.
export const MAX_SYNC_UPLOAD_PART_BYTES = 120_000;
export const MAX_LARGE_SYNC_BYTES = 24_000_000;

export function splitSyncBody(body: string): string[] {
  const bytes = new TextEncoder().encode(body);
  return splitBytes(bytes);
}

function splitBytes(bytes: Uint8Array): string[] {
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

/** Compress only after the server advertises support; old clients stay valid. */
export async function splitCompressedSyncBody(body: string): Promise<string[]> {
  const bytes = new TextEncoder().encode(body);
  if (bytes.length > MAX_LARGE_SYNC_BYTES) throw new Error('同步数据超过单条传输上限');
  if (typeof CompressionStream !== 'function') return splitBytes(bytes);
  const compressed = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  return splitBytes(compressed.length < bytes.length ? compressed : bytes);
}

/** Each download part is compressed independently, before the JSON is joined. */
export async function decodeSyncPart(data: string, encoding: unknown): Promise<string> {
  if (encoding === undefined || encoding === 'identity') return data;
  if (encoding !== 'gzip' || typeof DecompressionStream !== 'function') throw Error('不支持的同步压缩格式');
  const bytes = Uint8Array.from(atob(data), c=>c.charCodeAt(0));
  if (bytes.length > MAX_SYNC_UPLOAD_PART_BYTES) throw Error('同步分片超过上限');
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks: Uint8Array[]=[]; let total=0;
  try {
    for (;;) {
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.length;
      if(total>MAX_SYNC_UPLOAD_PART_BYTES) { await reader.cancel(); throw Error('同步解压分片超过上限'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
  let binary='';
  for(let start=0;start<result.length;start+=8192)binary+=String.fromCharCode(...result.subarray(start,start+8192));
  return btoa(binary);
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
