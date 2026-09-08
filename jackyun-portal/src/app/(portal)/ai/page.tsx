import type { Metadata } from 'next';
import AiWorkspace from '@/components/ai/ai-workspace';
import { getAvailableAiModels } from '@/lib/ai-model-catalog';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'JackYun AI',
  description: '聊天与 Agent 模式分离的 JackYun AI 工作台。',
};

export default async function AiPage({ searchParams }: { searchParams: Promise<{ mode?: string; prompt?: string }> }) {
  const [{ mode, prompt }, supabase] = await Promise.all([searchParams, createClient()]);
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims.sub === 'string' ? claimsData.claims.sub : null;
  const { models, planCode } = await getAvailableAiModels(userId);
  return <AiWorkspace models={models} planCode={planCode} initialMode={mode === 'agent' ? 'agent' : 'chat'} initialPrompt={typeof prompt === 'string' ? prompt.slice(0, 4000) : ''} />;
}
