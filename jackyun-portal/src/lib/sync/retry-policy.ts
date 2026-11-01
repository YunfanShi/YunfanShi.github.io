export function syncRetryDelay(failures: number): number {
  return Math.min(300_000, 30_000 * 2 ** Math.min(Math.max(failures - 1, 0), 4));
}
export class SyncRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export function shouldPauseSync(error: unknown): boolean {
  if (!(error instanceof Error) || !('status' in error) || typeof error.status !== 'number') return false;
  return error.status === 401 || error.status === 403
    || (error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429);
}
export function retryAfterMilliseconds(value:string|null,now=Date.now()):number {
  if(!value)return 0;const seconds=Number(value);return Math.max(0,Number.isFinite(seconds)?seconds*1000:Date.parse(value)-now)||0;
}
