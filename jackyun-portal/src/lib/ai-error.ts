export type AiErrorInfo = { code: string; reason: string; detail: string };

export function explainAiError(status: number, raw: string): AiErrorInfo {
  let payload: Record<string, unknown> | null = null;
  try { payload = JSON.parse(raw) as Record<string, unknown>; } catch {}
  const error = (payload?.error ?? payload) as Record<string, unknown> | null;
  const detail = String(error?.message ?? raw ?? '未知上游错误').slice(0, 800);
  const providerCode = String(error?.code ?? error?.type ?? 'unknown_error');
  const normalized = `${detail} ${providerCode}`.toLowerCase();
  if (status === 402 || /insufficient.balance|insufficient.*balance|quota.*exceed|余额/.test(normalized)) return { code: providerCode, reason: '余额或额度不足，请充值或更换可用的 API Key。', detail };
  if (status === 401 || /invalid.*api.?key|unauthori[sz]ed|authentication/.test(normalized)) return { code: providerCode, reason: 'API Key 无效、过期或未获授权。', detail };
  if (status === 403 || /permission|forbidden|not allowed/.test(normalized)) return { code: providerCode, reason: '当前 Key 没有使用该模型或接口的权限。', detail };
  if (status === 404 || /model.*not found|not_found/.test(normalized)) return { code: providerCode, reason: '模型名称或 API 地址不正确。', detail };
  if (status === 429 || /rate limit|too many/.test(normalized)) return { code: providerCode, reason: '请求过于频繁，请稍后重试或提高供应商限额。', detail };
  if (status >= 500) return { code: providerCode, reason: '模型供应商服务异常，请稍后重试。', detail };
  return { code: providerCode, reason: `请求失败（HTTP ${status}），请检查模型、接口地址和参数。`, detail };
}
