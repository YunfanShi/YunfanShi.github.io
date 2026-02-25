'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@/lib/supabase/server';
import type { ChatMessage, RelaxState } from '@/types/relax';

const SYSTEM_PROMPT = `你是Jack的专属AI助手，名叫"Sanctuary AI"。你的角色是一个温暖、理解、支持性的学习伙伴。
你帮助Jack放松、思考问题、解答疑惑。
当用户说"我累了"，提供一个放松建议。
当用户说"帮我看一下这道题"，提供学习帮助。
保持回答简洁、友好、积极。用中英双语回复（中文为主）。`;

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
  if (!process.env.GEMINI_API_KEY) {
    return '抱歉，AI服务暂时不可用。请检查API密钥配置。';
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const chat = model.startChat({
      history: messages.slice(0, -1).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
      systemInstruction: SYSTEM_PROMPT,
    });

    const lastMessage = messages[messages.length - 1];
    const result = await chat.sendMessage(lastMessage.content);
    return result.response.text();
  } catch (e) {
    console.error('Gemini error:', e);
    return '抱歉，AI响应出错了。请稍后重试。';
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
