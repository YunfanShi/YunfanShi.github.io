import { gzipSync, gunzipSync } from 'node:zlib';
import { MAX_LARGE_SYNC_BYTES, MAX_SYNC_UPLOAD_PART_BYTES } from './transfer.ts';

/** Raw JSON cannot start with gzip's magic bytes, so legacy uploads are unambiguous. */
export function decodeSyncUpload(bytes: Uint8Array): unknown {
  if (bytes.length > MAX_LARGE_SYNC_BYTES) throw Error('Sync upload too large');
  const decoded = bytes[0]===0x1f && bytes[1]===0x8b
    ? gunzipSync(bytes,{maxOutputLength:MAX_LARGE_SYNC_BYTES}) : bytes;
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded));
}

export function compressSyncPart(data: string, requested: boolean): {data:string;encoding?:'gzip'} {
  if (!requested) return {data};
  const bytes=Buffer.from(data,'base64');
  if (bytes.length>MAX_SYNC_UPLOAD_PART_BYTES) throw Error('Sync part too large');
  const compressed=gzipSync(bytes);
  return compressed.length<bytes.length ? {data:compressed.toString('base64'),encoding:'gzip'} : {data};
}
