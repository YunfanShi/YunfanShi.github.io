import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  // 解析请求体
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: { message: 'Invalid request body' } }, { status: 400 });
  }

  // 提取客户端上传的 API 配置
  const clientBaseUrl = (body.baseUrl as string)?.trim() || '';
  const clientApiKey = (body.apiKey as string)?.trim() || '';
  const clientModel = (body.model as string)?.trim() || '';

  let baseUrl: string;
  let apiKey: string;
  let model: string;

  if (clientBaseUrl && clientApiKey) {
    // 客户端直接传了 API 配置 → 直接使用，无需登录
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
        { error: { message: '请前往 Dashboard 设置 API Key，或在请求中携带 baseUrl/apiKey' } },
        { status: 401 },
      );
    }

    // 从 Supabase user_settings 读取 AI 配置
    const { data: settingRow } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', user.id)
      .eq('key', 'ai_config')
      .maybeSingle();

    const aiConfig = settingRow?.value as
      | { baseUrl?: string; apiKey?: string; model?: string }
      | null;

    baseUrl = (aiConfig?.baseUrl?.trim() || '').replace(/\/+$/, '');
    apiKey = aiConfig?.apiKey?.trim() || '';
    model = aiConfig?.model?.trim() || clientModel || 'deepseek-v4-flash';
  }

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: { message: '请前往主页 Dashboard 配置 API Key，或直接在请求中传入 baseUrl/apiKey。' } },
      { status: 400 },
    );
  }

  // 构建上游请求体（剔除客户端专用字段 baseUrl/apiKey）
  const { baseUrl: _, apiKey: __, ...upstreamFields } = body;
  const upstreamBody: Record<string, unknown> = {
    ...upstreamFields,
    model: (upstreamFields.model as string) || model,
  };

  // 转发到上游 LLM API
  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(upstreamBody),
  });

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