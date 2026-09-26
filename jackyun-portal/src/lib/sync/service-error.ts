export class SyncHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SyncHttpError';
    this.status = status;
  }
}

export function isServerUnavailable(error: unknown, online: boolean): boolean {
  return online && ((error instanceof SyncHttpError && error.status >= 500) || error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError'));
}
