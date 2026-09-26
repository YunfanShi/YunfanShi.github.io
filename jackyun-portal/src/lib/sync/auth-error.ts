import { apiError } from '@/lib/api-response';

/** An unavailable Auth service must not look like an expired user session. */
export function syncAuthError(requestId: string, error: { status?: number } | null) {
  if (error && error.status !== 401 && error.status !== 403) {
    return apiError(requestId, 'Authentication service temporarily unavailable', 503, 'AUTH_UNAVAILABLE');
  }
  return apiError(requestId, 'Unauthorized', 401, 'UNAUTHORIZED');
}
