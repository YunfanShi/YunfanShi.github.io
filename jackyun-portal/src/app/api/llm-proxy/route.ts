import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Cloud configuration — only accessible server-side
const CLOUD_API_URL = process.env.CLOUD_LLM_API_URL || '';
const CLOUD_API_KEY = process.env.CLOUD_LLM_API_KEY || '';
const CLOUD_MODEL = process.env.CLOUD_LLM_MODEL || 'deepseek-v4-flash';

// ──────────────────────────────────────────────
//  Rate Limiting & Token Quota (in-memory)
//  Note: Resets on cold start (Vercel serverless).
//  For production, use Redis/Upstash or a DB table.
// ──────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface QuotaEntry {
  tokensUsed: number;
  resetAt: number; // midnight UTC+8 timestamp
}

// Per-user rate limiting: max requests per minute
const RATE_LIMIT_MAX = Number(process.env.LLM_RATE_LIMIT_RPM) || 30; // 30 req/min per user
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

// Per-user daily token quota (input + output combined)
const DAILY_TOKEN_QUOTA = Number(process.env.LLM_DAILY_TOKEN_QUOTA) || 500_000; // 500k tokens/day
const QUOTA_RESET_HOUR_UTC8 = 0; // reset at midnight Asia/Shanghai

const rateLimitMap = new Map<string, RateLimitEntry>();
const quotaMap = new Map<string, QuotaEntry>();

// Cleanup stale entries every 10 minutes
const CLEANUP_INTERVAL_MS = 600_000;
let lastCleanup = Date.now();

function getUserIdKey(userId: string): string {
  return `user:${userId}`;
}

function getIpKey(ip: string): string {
  return `ip:${ip}`;
}

function getNextMidnightUTC8(): number {
  const now = new Date();
  // Asia/Shanghai midnight = UTC+8 00:00 = UTC 16:00 previous day
  const shanghaiNow = new Date(now.getTime() + 8 * 3600_000);
  const midnight = new Date(
    shanghaiNow.getFullYear(),
    shanghaiNow.getMonth(),
    shanghaiNow.getDate() + 1,
    QUOTA_RESET_HOUR_UTC8,
    0,
    0,
    0,
  );
  return midnight.getTime() - 8 * 3600_000; // back to UTC
}

function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
  for (const [key, entry] of quotaMap) {
    if (now > entry.resetAt) quotaMap.delete(key);
  }
}

function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetAt: number } {
  cleanupStaleEntries();
  const now = Date.now();
  let entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(key, entry);
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt: entry.resetAt };
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count, resetAt: entry.resetAt };
}

function checkTokenQuota(userKey: string, tokenCount: number): { allowed: boolean; tokensUsed: number } {
  cleanupStaleEntries();
  const now = Date.now();
  const nextMidnight = getNextMidnightUTC8();
  let entry = quotaMap.get(userKey);

  if (!entry || now > entry.resetAt) {
    entry = { tokensUsed: tokenCount, resetAt: nextMidnight };
    quotaMap.set(userKey, entry);
    return { allowed: tokenCount <= DAILY_TOKEN_QUOTA, tokensUsed: tokenCount };
  }

  entry.tokensUsed += tokenCount;
  if (entry.tokensUsed > DAILY_TOKEN_QUOTA) {
    return { allowed: false, tokensUsed: entry.tokensUsed };
  }

  return { allowed: true, tokensUsed: entry.tokensUsed };
}

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
  rateLimited?: boolean;
  quotaExceeded?: boolean;
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

    // ── Rate Limiting (only for cloud key usage) ──
    const userKey = getUserIdKey(userId);
    const ipKey = getIpKey(clientIp);

    // Check per-user rate limit
    const userRateLimit = checkRateLimit(userKey);
    if (!userRateLimit.allowed) {
      const retryAfter = Math.ceil((userRateLimit.resetAt - Date.now()) / 1000);
      auditLog({ userId, ip: clientIp, model: clientModel || CLOUD_MODEL, keySource: 'cloud', status: 429, durationMs: Date.now() - startTime, rateLimited: true });
      return NextResponse.json(
        {
          error: {
            message: `请求过于频繁，请在 ${retryAfter} 秒后重试。每分钟最多 ${RATE_LIMIT_MAX} 次请求。`,
            retryAfter,
          },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfter) },
        },
      );
    }

    // Check per-IP rate limit (as a secondary defense)
    const ipRateLimit = checkRateLimit(ipKey);
    if (!ipRateLimit.allowed) {
      const retryAfter = Math.ceil((ipRateLimit.resetAt - Date.now()) / 1000);
      auditLog({ userId, ip: clientIp, model: clientModel || CLOUD_MODEL, keySource: 'cloud', status: 429, durationMs: Date.now() - startTime, rateLimited: true });
      return NextResponse.json(
        {
          error: {
            message: `请求过于频繁，请在 ${retryAfter} 秒后重试。每分钟最多 ${RATE_LIMIT_MAX} 次请求。`,
            retryAfter,
          },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfter) },
        },
      );
    }

    // ── Token Quota (only for cloud key usage) ──
    const estimatedInput = estimateInputTokens(body);
    const tokenQuota = checkTokenQuota(userKey, estimatedInput);

    if (!tokenQuota.allowed) {
      auditLog({ userId, ip: clientIp, model: clientModel || CLOUD_MODEL, keySource: 'cloud', status: 429, durationMs: Date.now() - startTime, quotaExceeded: true, inputTokens: estimatedInput });
      return NextResponse.json(
        {
          error: {
            message: `您今日的 AI Token 配额已用尽（${DAILY_TOKEN_QUOTA.toLocaleString()} tokens/天）。请明天再试，或前往设置页面配置自己的 API Key。`,
            dailyQuota: DAILY_TOKEN_QUOTA,
            tokensUsed: tokenQuota.tokensUsed,
          },
        },
        { status: 429 },
      );
    }

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
        'X-RateLimit-Remaining': keySource === 'cloud' && userId
          ? String(checkRateLimit(getUserIdKey(userId)).remaining)
          : 'unlimited',
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

  const response = NextResponse.json(data);

  // Add rate limit headers
  if (keySource === 'cloud' && userId) {
    const rl = checkRateLimit(getUserIdKey(userId));
    response.headers.set('X-RateLimit-Remaining', String(rl.remaining));
    response.headers.set('X-RateLimit-Reset', new Date(rl.resetAt).toISOString());
  }

  return response;
}
