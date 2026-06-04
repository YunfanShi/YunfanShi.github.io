'use server';

import { createClient } from '@/lib/supabase/server';
import type { ChatMessage, RelaxState } from '@/types/relax';

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return { supabase, user };
}

export async function chatWithAI(messages: ChatMessage[]): Promise<string> {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    // Read AI config from user_settings
    const { data: settingRow } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', user.id)
      .eq('key', 'ai_config')
      .maybeSingle();

    const aiConfig = settingRow?.value as { baseUrl?: string; apiKey?: string; model?: string } | null;
    const baseUrl = (aiConfig?.baseUrl?.trim() || '').replace(/\/+$/, '');
    const apiKey = aiConfig?.apiKey?.trim() || '';
    const model = aiConfig?.model?.trim() || 'gpt-3.5-turbo';

    if (!baseUrl || !apiKey) {
      return '请前往主页 Dashboard 配置 API Key 后再使用 AI 功能。';
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return `AI 响应出错: ${res.status} ${errText.slice(0, 200)}`;
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? '（AI 返回了空内容）';
  } catch (e) {
    console.error('Chat error:', e);
    return 'AI 响应出错了。请检查 API 配置是否正确，然后重试。';
  }
}

export async function getChatHistory(): Promise<ChatMessage[]> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const { data, error } = await supabase
      .from('relax_chat')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as ChatMessage[];
  } catch {
    return [];
  }
}

export async function saveChatMessage(
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    await supabase.from('relax_chat').insert({ user_id: user.id, role, content });
  } catch {
    // Silently fail — chat still works without persistence
  }
}

export async function clearChatHistory(): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  await supabase.from('relax_chat').delete().eq('user_id', user.id);
}

export async function getRelaxState(): Promise<RelaxState> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const { data } = await supabase
      .from('relax_state')
      .select('*')
      .eq('user_id', user.id)
      .single();
    if (!data) return { water_count: 0, water_date: null, theme: 'default' };
    return {
      water_count: data.water_count ?? 0,
      water_date: data.water_date ?? null,
      theme: (data.theme ?? 'default') as RelaxState['theme'],
    };
  } catch {
    return { water_count: 0, water_date: null, theme: 'default' };
  }
}

export async function saveRelaxState(state: Partial<RelaxState>): Promise<void> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    await supabase.from('relax_state').upsert(
      { user_id: user.id, ...state, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  } catch {
    // Silently fail
  }
}
