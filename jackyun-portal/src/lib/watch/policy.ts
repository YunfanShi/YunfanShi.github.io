import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
export const WATCH_API_VERSION = 1;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const secret = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function sameHash(value: string, expected: string) {
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(digest(value), 'hex'), Buffer.from(expected, 'hex'));
}
export function seal(value: unknown, master: string): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(digest('watch-pair-v1:' + master), 'hex'), iv);
  cipher.setAAD(Buffer.from('watch-pair-v1'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return [iv, encrypted, cipher.getAuthTag()].map(item=>item.toString('base64url')).join('.');
}
export function unseal(value: string, master: string): unknown {
  const [iv, payload, tag, extra] = value.split('.');
  if (extra || !iv || !payload || !tag) throw Error('Invalid envelope');
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(digest('watch-pair-v1:' + master),'hex'), Buffer.from(iv,'base64url'));
  cipher.setAAD(Buffer.from('watch-pair-v1')); cipher.setAuthTag(Buffer.from(tag,'base64url'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(payload,'base64url')),cipher.final()]).toString('utf8'));
}
export function validateOperation(value: Record<string, unknown>) {
  const details = value.details as Record<string, unknown> | null;
  if (!UUID.test(String(value.operationId)) || !['task','notification','focus'].includes(String(value.kind)) || !details || typeof details!=='object' || Array.isArray(details)) throw Error('INVALID_OPERATION');
  if (value.kind!=='focus' && !UUID.test(String(value.targetId))) throw Error('INVALID_OPERATION');
  if (value.kind==='task' && (typeof details.completed!=='boolean' || !Number.isFinite(Date.parse(String(value.version))))) throw Error('INVALID_OPERATION');
  if (value.kind==='focus') {
    const duration = Number(details.durationSeconds), planned = Number(details.plannedSeconds), started=Number(details.startedAt), finished=Number(details.completedAt);
    if (!Number.isInteger(duration)||duration<60||duration>21600||!Number.isInteger(planned)||planned<60||planned>21600||!Number.isFinite(started)||!Number.isFinite(finished)||finished-started<duration*1000||finished>Date.now()+300000||duration>planned) throw Error('INVALID_OPERATION');
  }
  return details;
}
