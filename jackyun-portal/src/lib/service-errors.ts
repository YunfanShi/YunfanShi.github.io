export const SERVICE_ERROR_EVENT = 'jackyun-service-error';
type ErrorInfo = { name?: string; code?: string; status?: number; message?: string };
function info(error: unknown): ErrorInfo { return error && typeof error === 'object' ? error as ErrorInfo : {}; }
export function isTemporaryServiceError(error: unknown) {
  const e = info(error);
  return e.status === 0 || e.status === 408 || e.status === 429 || (e.status !== undefined && e.status >= 500)
    || ['AuthRetryableFetchError', 'TimeoutError', 'AbortError', 'TypeError', 'ServiceUnavailableError'].includes(e.name ?? '')
    || ['request_timeout', 'unexpected_failure', '57014', '53300', '57P01'].includes(e.code ?? '')
    || Boolean(e.code?.startsWith('08'));
}
export function isDefinitiveSessionError(error: unknown) {
  const e = info(error);
  return !isTemporaryServiceError(error) && (['AuthSessionMissingError', 'AuthInvalidJwtError'].includes(e.name ?? '')
    || ['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired', 'bad_jwt', 'invalid_jwt'].includes(e.code ?? ''));
}
/** Safe public descriptions: never display SQL, tokens, or internal exception text. */
export function serviceErrorMessage(error: unknown, service = '服务'): string {
  const e = info(error);
  if (e.message === 'Request rate limited' || e.status === 429 || e.code?.startsWith('over_')) return '请求过于频繁，请稍后重试。（RATE_LIMITED）';
  if (e.message === 'Request timed out' || e.name === 'TimeoutError' || e.status === 408 || ['request_timeout', '57014'].includes(e.code ?? '')) return `${service}响应超时，请稍后重试。（REQUEST_TIMEOUT）`;
  if (isTemporaryServiceError(error)) return `${service}暂时无法连接，请稍后重试。（SERVICE_UNAVAILABLE）`;
  if (isDefinitiveSessionError(error)) return '登录会话已失效，请重新登录。（SESSION_EXPIRED）';
  if (e.code === 'email_not_confirmed') return '邮箱尚未验证，请检查验证邮件。（EMAIL_NOT_CONFIRMED）';
  if (e.code === 'invalid_credentials' || e.message?.toLowerCase() === 'invalid login credentials') return '账号或密码错误。（INVALID_CREDENTIALS）';
  if (e.code === 'weak_password') return '密码强度不足，请使用更长的密码。（WEAK_PASSWORD）';
  if (e.code === 'same_password') return '新密码不能与原密码相同。（SAME_PASSWORD）';
  if (e.code === 'user_already_exists' || e.code === 'email_exists') return '该邮箱已注册，请直接登录。（ACCOUNT_EXISTS）';
  return `${service}暂未完成请求，请重试。（REQUEST_FAILED）`;
}
