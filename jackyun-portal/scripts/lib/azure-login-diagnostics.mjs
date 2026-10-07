// Never render arbitrary provider error messages, URLs, identifiers or tokens.
export function loginDiagnostic(error) {
  if (error?.code === 'invalid_credentials') return 'REAL_LOGIN_INVALID_CREDENTIALS';
  if (error?.code === 'email_not_confirmed') return 'REAL_LOGIN_EMAIL_UNCONFIRMED';
  if (error?.code === 'over_request_rate_limit' || error?.status === 429) return 'REAL_LOGIN_RATE_LIMITED';
  if (['AuthRetryableFetchError','AbortError','TimeoutError'].includes(error?.name)
    || [0,502,503,504].includes(error?.status)) return 'REAL_LOGIN_NETWORK_FAILED';
  return 'REAL_LOGIN_REJECTED';
}
export const LOGIN_HINTS = {
  REAL_LOGIN_INVALID_CREDENTIALS: '登录服务拒绝邮箱密码组合；请核对网站登录方式，不是数据库密码。',
  REAL_LOGIN_EMAIL_UNCONFIRMED: '此账号尚未完成邮箱确认。',
  REAL_LOGIN_RATE_LIMITED: '登录服务限流，请等待后再试。',
  REAL_LOGIN_NETWORK_FAILED: '无法稳定连接登录服务；请检查本机网络和代理后再试。',
  REAL_LOGIN_REJECTED: '登录服务拒绝请求；请核对公开 API 配置和账号登录方式。',
};
