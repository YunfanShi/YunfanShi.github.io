import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const clientIp = extractClientIp(req);

  // 解析请求体
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    auditLog({ ip: clientIp, model: 'unknown', keySource: 'client', status: 400, durationMs: Date.now() - startTime, error: 'Invalid JSON' });
    return NextResponse.json({ error: { message: 'Invalid request body' } }, { status: 400 });
  }

  // Check if this is a config-save request
  if (body._save_ai_config === true) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }
    const { error } = await supabase.from('user_settings').upsert(
      {
        user_id: user.id,
        key: 'ai_config',
        value: { baseUrl: body.baseUrl, apiKey: body.apiKey, model: body.model },
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
      const adminUsers = (process.env.ADMIN_USERS ?? process.env.AUTHORIZED_GITHUB_USERS ?? '')
        .split(',')
        .map((u) => u.trim().toLowerCase())
        .filter(Boolean);
      const githubUsername = (user.user_metadata?.user_name as string | undefined)?.toLowerCase();
      const isEnvAdmin = githubUsername ? adminUsers.includes(githubUsername) : false;
      if (isEnvAdmin) {
        return NextResponse.json({ available: true, isAdmin: true });
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      return NextResponse.json({ available: true, isAdmin: profile?.role === 'admin' });
    }

    if (CLOUD_API_URL && CLOUD_API_KEY) {
      return NextResponse.json({ available: true });
    }
    return NextResponse.json({ available: false }, { status: 400 });
  }

  // 提取客户端上传的 API 配置（用户自定义 API）
  const clientBaseUrl = (body.baseUrl as string)?.trim() || '';
  const clientApiKey = (body.apiKey as string)?.trim() || '';
  const clientModel = (body.model as string)?.trim() || '';

  let baseUrl: string;
  let apiKey: string;
  let model: string;
  let keySource: 'client' | 'user' | 'cloud' = 'client';
  let userId: string | undefined;

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
    const { data: settingRow } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', user.id)
      .eq('key', 'ai_config')
      .maybeSingle();

    const aiConfig = settingRow?.value as
      | { baseUrl?: string; apiKey?: string; model?: string }
      | null;

    // Use user's own API config if they have set one
    if (aiConfig?.apiKey?.trim()) {
      baseUrl = (aiConfig.baseUrl?.trim() || '').replace(/\/+$/, '');
      apiKey = aiConfig.apiKey.trim();
      model = aiConfig.model?.trim() || clientModel || 'deepseek-v4-flash';
      keySource = 'user';
    } else {
      // Fallback to cloud-level API config (server env vars)
      baseUrl = CLOUD_API_URL;
      apiKey = CLOUD_API_KEY;
      model = CLOUD_MODEL;
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

  // ── Audit: request received ──
  const estimatedInputTokens = estimateInputTokens(body);
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
  const { baseUrl: _, apiKey: __, _get_config_only: ___, ...upstreamFields } = body;
  const upstreamBody: Record<string, unknown> = {
    ...upstreamFields,
    model: (upstreamFields.model as string) || model,
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
    return NextResponse.json(
      { error: { message: `连接 LLM API 失败: ${errorMsg}` } },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
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
    return NextResponse.json(
      { error: { message: `LLM API 错误 (${upstream.status}): ${text.slice(0, 300)}` } },
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
    return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  // 非流式 - 直接透传 JSON
  const data = await upstream.json();

  // Extract output token count for audit
  const outputTokens = (data as Record<string, unknown>)?.usage
    ? ((data as Record<string, unknown>).usage as Record<string, number>)?.total_tokens ?? undefined
    : undefined;

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