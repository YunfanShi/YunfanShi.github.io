import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  // Authenticate user
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Read AI config from user_settings
  const { data: settingRow } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', user.id)
    .eq('key', 'ai_config')
    .maybeSingle();

  const aiConfig = settingRow?.value as { baseUrl?: string; apiKey?: string } | null;
  const baseUrl = aiConfig?.baseUrl?.trim() || 'https://api.openai.com/v1';
  const apiKey = aiConfig?.apiKey?.trim() || '';

  if (!apiKey) {
    return NextResponse.json(
      { error: '请先在设置页面配置 AI API Key' },
      { status: 400 },
    );
  }

  // Parse request body
  let messages: { role: string; content: string }[];
  try {
    const body = await req.json() as { messages?: { role: string; content: string }[] };
    messages = body.messages ?? [];
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!messages.length) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
  }

  // Proxy to LLM API (OpenAI-compatible)
  const model = (aiConfig as { baseUrl?: string; apiKey?: string; model?: string } | null)?.model?.trim() || 'gpt-3.5-turbo';
  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return NextResponse.json(
      { error: `LLM API error: ${upstream.status} ${text.slice(0, 200)}` },
      { status: upstream.status },
    );
  }

  // Stream the response back to the client
  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
