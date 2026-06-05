import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  // 验证用户身份
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { message: '未登录，请先登录' } }, { status: 401 });
  }

  // 从 user_settings 读取 AI 配置
  const { data: settingRow } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', user.id)
    .eq('key', 'ai_config')
    .maybeSingle();

  const aiConfig = settingRow?.value as
    | { baseUrl?: string; apiKey?: string; model?: string }
    | null;

  const baseUrl = (aiConfig?.baseUrl?.trim() || '').replace(/\/+$/, '');
  const apiKey = aiConfig?.apiKey?.trim() || '';
  const model = aiConfig?.model?.trim() || 'deepseek-v4-flash';

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: { message: '请前往主页 Dashboard 配置 API Key，一次配置全局生效。' } },
      { status: 400 }
    );
  }

  // 解析请求体
  let upstreamBody: Record<string, unknown>;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    // 允许客户端不传 model，使用默认值
    upstreamBody = {
      ...body,
      model: (body.model as string) || model,
    };
  } catch {
    return NextResponse.json({ error: { message: 'Invalid request body' } }, { status: 400 });
  }

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
      { status: upstream.status }
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