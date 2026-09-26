export function syncRetryDelay(failures: number): number {
  return Math.min(300_000, 30_000 * 2 ** Math.min(Math.max(failures - 1, 0), 4));
}
export class SyncRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export function shouldPauseSync(error: unknown): boolean {
  return error instanceof Error && 'status' in error && (error.status === 401 || error.status === 403);
}
