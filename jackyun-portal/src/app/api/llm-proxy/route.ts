import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Cloud configuration — only accessible server-side
const CLOUD_API_URL = process.env.CLOUD_LLM_API_URL || '';
const CLOUD_API_KEY = process.env.CLOUD_LLM_API_KEY || '';
const CLOUD_MODEL = process.env.CLOUD_LLM_MODEL || 'deepseek-v4-flash';

export async function POST(req: NextRequest) {
  // 解析请求体
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: { message: 'Invalid request body' } }, { status: 400 });
  }

  // Check if this is a config-only probe or admin check
  const configOnly = body._get_config_only === true;
  if (configOnly) {
    const checkAdmin = body._check_admin === true;

    if (checkAdmin) {
      // Check if the current user is an admin
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

    // Don't reveal cloud config - just return 200 if cloud is available
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

  if (clientBaseUrl && clientApiKey) {
    // 客户端直接传了 API 配置 → 直接使用，无需登录（用户自定义 API）
    baseUrl = clientBaseUrl.replace(/\/+$/, '');
    apiKey = clientApiKey;
    model = clientModel || 'deepseek-v4-flash';
  } else {
    // 回退到云端配置 → 需要验证用户身份
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: { message: '请登录后使用 AI 功能，或前往设置页面配置自己的 API Key' } },
        { status: 401 },
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
    } else {
      // Fallback to cloud-level API config (server env vars, not in DB)
      baseUrl = CLOUD_API_URL;
      apiKey = CLOUD_API_KEY;
      model = CLOUD_MODEL;
    }
  }

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: { message: 'AI 服务未配置。请前往设置页面配置 API Key，或联系管理员。' } },
      { status: 400 },
    );
  }

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
    return NextResponse.json(
      { error: { message: `连接 LLM API 失败: ${err instanceof Error ? err.message : '网络错误'}` } },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
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
  return NextResponse.json(data);
}
