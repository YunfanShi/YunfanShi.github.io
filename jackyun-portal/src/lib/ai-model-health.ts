import type { SupabaseClient } from '@supabase/supabase-js';

export type AiModelFailureKind = 'billing' | 'authentication' | 'permission' | 'model_unavailable';

export function classifyAiModelFailure(status: number, detail: string): AiModelFailureKind | null {
  const text = detail.toLowerCase();
  const billing = /insufficient[_ -]?(?:balance|funds|credit)|credit balance|payment required|billing|欠费|余额不足|额度不足|充值/.test(text);
  const quotaWithoutRateLimit = /(?:quota|credits?) (?:has been )?(?:exceeded|exhausted)|out of credits|no credits|配额耗尽/.test(text)
    && !/rate.?limit|too many requests|频率|限流/.test(text);
  if (status === 402 || billing || quotaWithoutRateLimit) return 'billing';
  if (status === 401 || /invalid api.?key|authentication failed|unauthorized|鉴权失败|密钥无效/.test(text)) return 'authentication';
  if (status === 403 || /permission denied|forbidden|not allowed to use|no access to model|无权访问|没有权限/.test(text)) return 'permission';
  if (status === 404 || /model (?:does not exist|not found|is unavailable|has been deprecated|has been decommissioned)|unknown model|模型不存在|模型已下线/.test(text)) return 'model_unavailable';
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

async function emailPrimaryModelFailure(modelId: number, modelName: string, failureCount: number, detail: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('[ai-model-health] Primary model was disabled, but RESEND_API_KEY is not configured');
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'User-Agent': 'JackYun-Portal/3.12',
      'Idempotency-Key': `ai-primary-model-disabled-${modelId}-${failureCount}`,
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? 'JackYun Portal <onboarding@resend.dev>',
      to: [process.env.BUG_REPORT_RECIPIENT_EMAIL ?? 'w.jack2025a@gmail.com'],
      subject: `主 AI 模型已自动下架：${modelName}`,
      html: `<h2>主 AI 模型已自动下架</h2><p><b>模型：</b>${escapeHtml(modelName)}</p><p><b>连续确认故障：</b>${failureCount} 次</p><p><b>最后错误：</b>${escapeHtml(detail)}</p><p>请进入 ADMIN → AI 与配额重新检查连接，确认恢复后手动上架。</p>`,
    }),
  });
  if (!response.ok) console.error('[ai-model-health] Unable to send primary-model email', response.status, (await response.text()).slice(0, 300));
}

export async function recordAiModelResult(
  admin: SupabaseClient,
  modelId: number | null,
  result: { success: true } | { success: false; status: number; detail: string },
): Promise<void> {
  if (!modelId) return;
  const failureKind = result.success ? null : classifyAiModelFailure(result.status, result.detail);
  if (!result.success && !failureKind) return;
  const detail = result.success ? '' : result.detail.slice(0, 800);
  const { data, error } = await admin.rpc('record_ai_model_result', {
    p_model_id: modelId,
    p_success: result.success,
    p_failure_kind: failureKind,
    p_failure_detail: detail,
  }).single();
  if (error) {
    console.error('[ai-model-health] Unable to record model result', error.message);
    return;
  }
  const row = data as { newly_disabled?: boolean; model_name?: string; failure_count?: number; is_primary?: boolean } | null;
  if (!row?.newly_disabled) return;

  const modelName = row.model_name ?? `#${modelId}`;
  const failureCount = Number(row.failure_count) || 0;
  const { data: admins, error: adminError } = await admin.from('profiles').select('id').eq('role', 'admin');
  if (adminError) {
    console.error('[ai-model-health] Unable to find administrators', adminError.message);
  } else {
    const recipients = (admins as Array<{ id: string }> | null) ?? [];
    if (recipients.length) {
      const { error: notificationError } = await admin.from('site_notifications').insert(recipients.map(({ id }) => ({
        title: `AI 模型已自动下架：${modelName}`,
        content: `模型因连续 **${failureCount}** 次确定的上游故障被自动下架。\n\n最后错误：${detail}\n\n请进入 ADMIN → AI 与配额检查连接；确认恢复后可手动重新上架。`,
        content_type: 'markdown',
        delivery_type: 'message',
        recipient_user_id: id,
        created_by: null,
      })));
      if (notificationError) console.error('[ai-model-health] Unable to create administrator notifications', notificationError.message);
    }
  }
  if (row.is_primary) await emailPrimaryModelFailure(modelId, modelName, failureCount, detail);
}
