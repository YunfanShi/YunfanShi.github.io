export type NetworkFailureKind = 'recoverable' | 'actionable' | 'cancelled';

const RECOVERABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function classifyHttpFailure(status: number): NetworkFailureKind {
  return RECOVERABLE_STATUSES.has(status) ? 'recoverable' : 'actionable';
}

export function classifyFetchFailure(error: unknown): NetworkFailureKind {
  return error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'recoverable';
}
