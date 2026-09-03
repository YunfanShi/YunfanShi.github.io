import { checkHasPassword } from '@/actions/auth';
import { getAiConfig, getSidebarPreferences } from '@/actions/settings';
import { createClient } from '@/lib/supabase/server';
import SettingsContent from '@/components/settings/settings-content';
import type { CompanionDeviceView } from '@/components/settings/companion-settings-panel';
import { DEFAULT_NAVIGATION_PREFERENCES } from '@/lib/companion';
import type { AiQuotaSummary } from '@/components/settings/ai-quota-card';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  // Wrap ALL async calls in try/catch to prevent page crash
  let hasPassword = false;
  let aiConfig: { baseUrl: string; apiKey: string; model: string; providerMode: 'cloud' | 'personal' } = { baseUrl: '', apiKey: '', model: '', providerMode: 'cloud' };
  let displayName = '';
  let avatarUrl = '';
  let userId = '';
  let sidebarPrefs = DEFAULT_NAVIGATION_PREFERENCES;
  let cloudSettings: Record<string, Record<string, unknown>> = {};
  let companionDevices: CompanionDeviceView[] = [];
  let section: string | undefined;
  let aiQuota: AiQuotaSummary = { plan: 'free', dailyLimit: 5000, monthlyLimit: 50000, dailyUsed: 0, monthlyUsed: 0, maxOutput: 1000, siteGenerations: 0, siteGenerationLimit: 0 };

  const [searchResult, passwordResult, aiResult, sidebarResult] = await Promise.allSettled([
    searchParams,
    checkHasPassword(),
    getAiConfig(),
    getSidebarPreferences(),
  ]);
  if (searchResult.status === 'fulfilled') section = searchResult.value.section;
  if (passwordResult.status === 'fulfilled') hasPassword = passwordResult.value;
  if (aiResult.status === 'fulfilled') aiConfig = aiResult.value;
  if (sidebarResult.status === 'fulfilled') sidebarPrefs = sidebarResult.value;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const [{ data: profile }, { data: settingRows }, { data: devices }, { data: entitlement }, { data: plans }, { data: usage }] = user ? await Promise.all([
      supabase.from('profiles').select('display_name, avatar_url').eq('id', user.id).maybeSingle(),
      supabase.from('user_settings').select('key, value').eq('user_id', user.id),
      supabase.from('companion_devices').select('id, name, platform, extension_version, last_seen_at, revoked_at').eq('user_id', user.id).order('last_seen_at', { ascending: false }),
      supabase.from('user_entitlements').select('plan_code, bonus_tokens').eq('user_id', user.id).maybeSingle(),
      supabase.from('subscription_plans').select('*'),
      supabase.from('ai_usage_ledger').select('feature, status, billed_tokens, reserved_tokens, created_at').eq('user_id', user.id).gte('created_at', monthStart.toISOString()),
    ]) : [{ data: null }, { data: [] }, { data: [] }, { data: null }, { data: [] }, { data: [] }];
    displayName = profile?.display_name ?? user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '';
    avatarUrl = profile?.avatar_url ?? user?.user_metadata?.avatar_url ?? '';
    userId = user?.id ?? '';
    cloudSettings = Object.fromEntries((settingRows ?? []).map((row) => [row.key, row.value as Record<string, unknown>]));
    companionDevices = (devices ?? []) as CompanionDeviceView[];
    const planCode = entitlement?.plan_code ?? 'free'; const plan = (plans ?? []).find((item) => item.code === planCode);
    if (plan) { const rows = usage ?? []; const billed = (row: typeof rows[number]) => Number(row.status === 'reserved' ? row.reserved_tokens : row.billed_tokens); aiQuota = { plan: planCode, dailyLimit: Number(plan.daily_token_limit), monthlyLimit: Number(plan.monthly_token_limit) + Number(entitlement?.bonus_tokens ?? 0), dailyUsed: rows.filter((row) => row.created_at >= dayStart.toISOString()).reduce((n, row) => n + billed(row), 0), monthlyUsed: rows.reduce((n, row) => n + billed(row), 0), maxOutput: Number(plan.max_output_tokens), siteGenerations: rows.filter((row) => row.feature === 'personal_site' && row.status !== 'failed').length, siteGenerationLimit: Number(plan.monthly_site_generations) }; }
  } catch { /* fallback: not authenticated, show empty profile */ }

  return (
    <SettingsContent
      hasPassword={hasPassword}
      aiConfig={aiConfig}
      displayName={displayName}
      avatarUrl={avatarUrl}
      userId={userId}
      sidebarPrefs={sidebarPrefs}
      cloudSettings={cloudSettings}
      companionDevices={companionDevices}
      initialSection={section}
      aiQuota={aiQuota}
    />
  );
}
