import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { explainAiError } from '@/lib/ai-error';
import { decryptSecret, encryptSecret } from '@/lib/secret-crypto';
import { normalizeLlmBaseUrl } from '@/lib/llm-endpoint';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminIdentity } from '@/lib/admin-auth';

// Cloud configuration — only accessible server-side
const CLOUD_API_URL = process.env.CLOUD_LLM_API_URL || '';
const CLOUD_API_KEY = process.env.CLOUD_LLM_API_KEY || '';
const CLOUD_MODEL = process.env.CLOUD_LLM_MODEL || 'deepseek-v4-flash';

function extractClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

/** Estimate token count from request body (rough heuristic: ~4 chars = 1 token) */
function estimateInputTokens(body: Record<string, unknown>): number {
  try {
    const messages = body.messages as Array<{ content?: string | unknown }> | undefined;
    if (!messages) return 0;
    let totalChars = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') totalChars += msg.content.length;
      else if (msg.content) totalChars += JSON.stringify(msg.content).length;
    }
    return Math.max(1, Math.ceil(totalChars / 4));
  } catch {
    return 100; // conservative default
  }
}

/** Server-side audit log (structured console output, can be piped to external logging) */
function auditLog(event: {
  userId?: string;
  ip: string;
  model: string;
  keySource: 'cloud' | 'user' | 'client';
  inputTokens?: number;
  outputTokens?: number;
  status: number;
  durationMs: number;
  error?: string;
}) {
  const logLine = JSON.stringify({
    ts: new Date().toISOString(),
    service: 'llm-proxy',
    ...event,
  });
  // Use process.stdout for serverless-compatible logging
  console.log(logLine);
}

function withLanguageInstruction(messages: unknown, language: unknown): unknown {
  if (!Array.isArray(messages)) return messages;
  const instruction = language === 'en'
    ? 'Respond in English. Keep any user-provided proper nouns, code, formulas, and quoted text unchanged unless the user asks for translation.'
    : '请使用简体中文回答。除非用户要求翻译，否则保留用户提供的专有名词、代码、公式和引用文本。';
  return [{ role: 'system', content: instruction }, ...messages];
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const clientIp = extractClientIp(req);

  const declaredLength = Number(req.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 1_000_000) {
    return NextResponse.json({ error: { message: '请求内容过大' } }, { status: 413 });
  }

  // 解析请求体
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    auditLog({ ip: clientIp, model: 'unknown', keySource: 'client', status: 400, durationMs: Date.now() - startTime, error: 'Invalid JSON' });
    return NextResponse.json({ error: { message: 'Invalid request body' } }, { status: 400 });
  }
  if (JSON.stringify(body).length > 1_000_000) {
    return NextResponse.json({ error: { message: '请求内容过大' } }, { status: 413 });
  }

  // Check if this is a config-save request
  if (body._save_ai_config === true) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }
    const requestedBaseUrl = typeof body.baseUrl === 'string' ? body.baseUrl : '';
    const baseUrl = requestedBaseUrl ? normalizeLlmBaseUrl(requestedBaseUrl) : '';
    const model = typeof body.model === 'string' ? body.model.trim().slice(0, 160) : '';
    const providerMode = body.providerMode === 'cloud' ? 'cloud' : 'personal';
    if (requestedBaseUrl && !baseUrl) return NextResponse.json({ error: 'AI 服务地址不在服务器允许列表中' }, { status: 400 });
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (apiKey && apiKey !== '__stored__') {
      let encryptedValue: string;
      try { encryptedValue = encryptSecret(apiKey); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '密钥加密失败' }, { status: 503 }); }
      const { error: secretError } = await supabase.from('user_secrets').upsert({ user_id: user.id, key: 'ai_api_key', encrypted_value: encryptedValue, key_version: 1, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
      if (secretError) return NextResponse.json({ error: secretError.message }, { status: 500 });
    }
    const { data: storedSecret } = await supabase.from('user_secrets').select('key').eq('user_id', user.id).eq('key', 'ai_api_key').maybeSingle();
    const { error } = await supabase.from('user_settings').upsert(
      {
        user_id: user.id,
        key: 'ai_config',
        value: { baseUrl, model, providerMode, hasApiKey: Boolean(storedSecret) },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,key' },
    );
    if (error) {
      auditLog({ ip: clientIp, model: 'unknown', keySource: 'cloud', status: 500, durationMs: Date.now() - startTime, error: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Check if this is a config-only probe or admin check
  const configOnly = body._get_config_only === true;
  if (configOnly) {
    const checkAdmin = body._check_admin === true;

    if (checkAdmin) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ available: false, isAdmin: false });
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      return NextResponse.json({ available: true, isAdmin: isAdminIdentity(user, profile?.role) });
    }

    const configAdmin = createAdminClient();
    const { data: managedProvider } = configAdmin
      ? await configAdmin.from('ai_provider_configs').select('id').eq('enabled', true).limit(1).maybeSingle()
      : { data: null };
    if (managedProvider || (configAdmin && CLOUD_API_URL && CLOUD_API_KEY)) {
      return NextResponse.json({ available: true });
    }
    return NextResponse.json({ available: false }, { status: 400 });
  }

  // 提取客户端上传的 API 配置（用户自定义 API）
  const requestedClientBaseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
  const clientBaseUrl = requestedClientBaseUrl ? normalizeLlmBaseUrl(requestedClientBaseUrl) : '';
  const clientApiKey = (body.apiKey as string)?.trim() || '';
  const clientModel = typeof body.model === 'string' ? body.model.trim().slice(0, 160) : '';
  if (requestedClientBaseUrl && !clientBaseUrl) {
    return NextResponse.json({ error: { message: 'AI 服务地址不在服务器允许列表中' } }, { status: 400 });
  }

  let baseUrl: string;
  let apiKey: string;
  let model: string;
  let keySource: 'client' | 'user' | 'cloud' = 'client';
  let userId: string | undefined;
  let inputCostPerMillion = 0;
  let outputCostPerMillion = 0;
  let reservationId: string | undefined;
  const adminClient = createAdminClient();

  if (clientBaseUrl && clientApiKey) {
    // 客户端直接传了 API 配置 → 使用用户自己的 Key（不限速，不消耗 Cloud 配额）
    baseUrl = clientBaseUrl.replace(/\/+$/, '');
    apiKey = clientApiKey;
    model = clientModel || 'deepseek-v4-flash';
    keySource = 'client';
  } else {
    // 回退到云端配置 → 需要验证用户身份
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      auditLog({ ip: clientIp, model: 'unknown', keySource: 'cloud', status: 401, durationMs: Date.now() - startTime, error: 'Unauthenticated' });
      return NextResponse.json(
        { error: { message: '请登录后使用 AI 功能，或前往设置页面配置自己的 API Key' } },
        { status: 401 },
      );
    }

    userId = user.id;

    // First check: does user have their own API config saved in user_settings?
    const [{ data: settingRow }, { data: secretRow }] = await Promise.all([
      supabase.from('user_settings').select('value').eq('user_id', user.id).eq('key', 'ai_config').maybeSingle(),
      supabase.from('user_secrets').select('encrypted_value').eq('user_id', user.id).eq('key', 'ai_api_key').maybeSingle(),
    ]);

    const aiConfig = settingRow?.value as
      | { baseUrl?: string; apiKey?: string; model?: string; providerMode?: string; hasApiKey?: boolean }
      | null;

    let encryptedApiKey = '';
    if (secretRow?.encrypted_value) {
      try { encryptedApiKey = decryptSecret(secretRow.encrypted_value); } catch (error) { console.error('[llm-proxy] Unable to decrypt user API key', error); }
    }

    // Use user's own API config if they have set one
    const forceCloud = body.providerMode === 'cloud' || aiConfig?.providerMode === 'cloud';
    if (!forceCloud && (encryptedApiKey || aiConfig?.apiKey?.trim())) {
      const savedConfig = aiConfig ?? {};
      const savedBaseUrl = savedConfig.baseUrl?.trim() || '';
      const normalizedSavedBaseUrl = normalizeLlmBaseUrl(savedBaseUrl);
      if (!normalizedSavedBaseUrl) {
        return NextResponse.json({ error: { message: '已保存的 AI 服务地址不再被服务器允许，请前往设置更新。' } }, { status: 400 });
      }
      baseUrl = normalizedSavedBaseUrl;
      apiKey = encryptedApiKey || savedConfig.apiKey!.trim();
      model = savedConfig.model?.trim() || clientModel || 'deepseek-v4-flash';
      keySource = 'user';
      // One-time migration for configurations saved before encrypted secrets existed.
      if (!encryptedApiKey && savedConfig.apiKey?.trim()) {
        try {
          const encryptedValue = encryptSecret(savedConfig.apiKey.trim());
          await Promise.all([
            supabase.from('user_secrets').upsert({ user_id: user.id, key: 'ai_api_key', encrypted_value: encryptedValue, key_version: 1, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' }),
            supabase.from('user_settings').upsert({ user_id: user.id, key: 'ai_config', value: { baseUrl, model, providerMode: 'personal', hasApiKey: true }, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' }),
          ]);
        } catch (error) { console.error('[llm-proxy] Legacy API key migration failed', error); }
      }
    } else {
      // Quotas and concurrency limits are server-enforced. Never fall back to
      // an unmetered managed key when the service-role client is unavailable.
      if (!adminClient) {
        return NextResponse.json({ error: { message: '平台云端 AI 尚未完成服务端配额配置，请联系管理员。' } }, { status: 503 });
      }
      // Prefer the administrator-managed encrypted provider. Environment
      // variables remain an emergency fallback for existing deployments.
      const { data: managedProvider } = adminClient
        ? await adminClient.from('ai_provider_configs').select('*').eq('enabled', true).order('is_default', { ascending: false }).order('created_at').limit(1).maybeSingle()
        : { data: null };
      if (managedProvider?.encrypted_api_key) {
        baseUrl = managedProvider.base_url;
        try { apiKey = decryptSecret(managedProvider.encrypted_api_key); } catch { apiKey = ''; }
        const feature = typeof body.feature === 'string' ? body.feature : 'chat';
        model = feature === 'personal_site' && managedProvider.site_model
          ? managedProvider.site_model
          : feature === 'reasoning' && managedProvider.reasoning_model
            ? managedProvider.reasoning_model
            : managedProvider.chat_model;
        inputCostPerMillion = Number(managedProvider.input_cost_per_million) || 0;
        outputCostPerMillion = Number(managedProvider.output_cost_per_million) || 0;
      } else {
        baseUrl = CLOUD_API_URL;
        apiKey = CLOUD_API_KEY;
        model = CLOUD_MODEL;
      }
      keySource = 'cloud';
    }
  }

  if (!baseUrl || !apiKey) {
    auditLog({ userId, ip: clientIp, model, keySource, status: 400, durationMs: Date.now() - startTime, error: 'No API config' });
    return NextResponse.json(
      { error: { message: 'AI 服务未配置。请前往设置页面配置 API Key，或联系管理员。' } },
      { status: 400 },
    );
  }
  if (!/^https:\/\//i.test(baseUrl)) {
    return NextResponse.json({ error: { message: 'AI 服务地址必须使用 HTTPS' } }, { status: 503 });
  }

  // ── Audit: request received ──
  const estimatedInputTokens = estimateInputTokens(body);
  if (estimatedInputTokens > 50_000) {
    return NextResponse.json({ error: { message: '输入内容过长，请缩短对话后重试。' } }, { status: 413 });
  }
  auditLog({
    userId,
    ip: clientIp,
    model,
    keySource,
    inputTokens: estimatedInputTokens,
    status: 0, // pending
    durationMs: Date.now() - startTime,
  });

  // 构建上游请求体（剔除客户端专用字段和内部字段）
  const upstreamFields = { ...body };
  const interfaceLanguage = upstreamFields.interfaceLanguage;
  delete upstreamFields.baseUrl;
  delete upstreamFields.apiKey;
  delete upstreamFields._get_config_only;
  delete upstreamFields._save_ai_config;
  delete upstreamFields.feature;
  delete upstreamFields.providerMode;
  if (keySource === 'cloud' && userId && adminClient) {
    const requestedOutput = Math.max(1, Math.min(Number(upstreamFields.max_tokens) || 2000, 100000));
    const feature = typeof body.feature === 'string' ? body.feature.slice(0, 64) : 'chat';
    const { data: reservation, error: reserveError } = await adminClient.rpc('reserve_ai_usage', {
      p_user_id: userId,
      p_feature: feature,
      p_input_tokens: estimatedInputTokens,
      p_requested_output: requestedOutput,
      p_model: model,
    }).single();
    if (reserveError || !reservation) {
      const monthly = reserveError?.message.includes('MONTHLY_QUOTA_EXCEEDED');
      const daily = reserveError?.message.includes('DAILY_QUOTA_EXCEEDED');
      const site = reserveError?.message.includes('SITE_GENERATION_QUOTA_EXCEEDED');
      const rate = reserveError?.message.includes('RATE_LIMIT_EXCEEDED') || reserveError?.message.includes('CONCURRENT_LIMIT_EXCEEDED');
      return NextResponse.json({ error: { code: 'quota_exceeded', message: site ? '本月个性化网站生成次数已用完。' : monthly ? '本月 AI Token 额度已用完。' : daily ? '今日 AI Token 额度已用完。' : rate ? '请求过于频繁，请稍后再试。' : '暂时无法预留 AI 使用额度。' } }, { status: 429 });
    }
    const reservationRow = reservation as { reservation_id: string; allowed_output_tokens: number };
    reservationId = reservationRow.reservation_id;
    upstreamFields.max_tokens = reservationRow.allowed_output_tokens;
  }
  const upstreamBody: Record<string, unknown> = {
    ...upstreamFields,
    // Managed plans always use the administrator-selected model. Personal
    // API users may still choose their own compatible model identifier.
    model: keySource === 'cloud' ? model : (upstreamFields.model as string) || model,
    messages: withLanguageInstruction(upstreamFields.messages, interfaceLanguage),
  };

  // 转发到上游 LLM API
  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : '网络错误';
    auditLog({
      userId,
      ip: clientIp,
      model,
      keySource,
      inputTokens: estimatedInputTokens,
      status: 502,
      durationMs: Date.now() - startTime,
      error: errorMsg,
    });
    if (reservationId && adminClient) await adminClient.rpc('finalize_ai_usage', { p_reservation_id: reservationId, p_input_tokens: estimatedInputTokens, p_output_tokens: 0, p_success: false, p_estimated_cost: 0 });
    return NextResponse.json(
      { error: { message: `连接 LLM API 失败: ${errorMsg}` } },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    const explained = explainAiError(upstream.status, text);
    auditLog({
      userId,
      ip: clientIp,
      model,
      keySource,
      inputTokens: estimatedInputTokens,
      status: upstream.status,
      durationMs: Date.now() - startTime,
      error: text.slice(0, 200),
    });
    if (reservationId && adminClient) await adminClient.rpc('finalize_ai_usage', { p_reservation_id: reservationId, p_input_tokens: estimatedInputTokens, p_output_tokens: 0, p_success: false, p_estimated_cost: 0 });
    return NextResponse.json(
      { error: { message: explained.reason, code: explained.code, upstream_status: upstream.status, detail: explained.detail } },
      { status: upstream.status },
    );
  }

  // 判断是否流式响应
  const isStream =
    (upstreamBody.stream as boolean) === true ||
    upstream.headers.get('content-type')?.includes('text/event-stream');

  if (isStream) {
    auditLog({
      userId,
      ip: clientIp,
      model,
      keySource,
      inputTokens: estimatedInputTokens,
      status: 200,
      durationMs: Date.now() - startTime,
    });
    if (!reservationId || !adminClient || !upstream.body) return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let transcript = '';
    let streamedBytes = 0;
    const reservation = reservationId;
    const meteredStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          const usageMatches = [...transcript.matchAll(/"usage"\s*:\s*\{([^{}]+)\}/g)];
          const lastUsage = usageMatches.at(-1)?.[1] ?? '';
          const input = Number(lastUsage.match(/"(?:prompt_tokens|input_tokens)"\s*:\s*(\d+)/)?.[1]) || estimatedInputTokens;
          // Some compatible providers omit usage from streaming responses.
          // Fall back to a conservative byte-based estimate instead of
          // silently billing zero output tokens.
          const output = Number(lastUsage.match(/"(?:completion_tokens|output_tokens)"\s*:\s*(\d+)/)?.[1]) || Math.max(1, Math.ceil(streamedBytes / 8));
          const cost = input / 1_000_000 * inputCostPerMillion + output / 1_000_000 * outputCostPerMillion;
          await adminClient.rpc('finalize_ai_usage', { p_reservation_id: reservation, p_input_tokens: input, p_output_tokens: output, p_success: true, p_estimated_cost: cost });
          controller.close(); return;
        }
        streamedBytes += value.byteLength;
        transcript = (transcript + decoder.decode(value, { stream: true })).slice(-300000);
        controller.enqueue(value);
      },
      async cancel(reason) {
        await reader.cancel(reason);
        await adminClient.rpc('finalize_ai_usage', { p_reservation_id: reservation, p_input_tokens: estimatedInputTokens, p_output_tokens: 0, p_success: true, p_estimated_cost: estimatedInputTokens / 1_000_000 * inputCostPerMillion });
      },
    });
    return new NextResponse(meteredStream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
  }

  // 非流式 - 直接透传 JSON
  const data = await upstream.json();

  // Extract output token count for audit
  const usage = (data as Record<string, unknown>)?.usage as Record<string, number> | undefined;
  const actualInputTokens = usage?.prompt_tokens ?? usage?.input_tokens ?? estimatedInputTokens;
  const actualOutputTokens = usage?.completion_tokens ?? usage?.output_tokens ?? 0;
  const outputTokens = usage?.total_tokens ?? actualInputTokens + actualOutputTokens;
  if (reservationId && adminClient) {
    const cost = actualInputTokens / 1_000_000 * inputCostPerMillion + actualOutputTokens / 1_000_000 * outputCostPerMillion;
    await adminClient.rpc('finalize_ai_usage', { p_reservation_id: reservationId, p_input_tokens: actualInputTokens, p_output_tokens: actualOutputTokens, p_success: true, p_estimated_cost: cost });
  }

  auditLog({
    userId,
    ip: clientIp,
    model,
    keySource,
    inputTokens: estimatedInputTokens,
    outputTokens,
    status: 200,
    durationMs: Date.now() - startTime,
  });

  return NextResponse.json(data);
}
