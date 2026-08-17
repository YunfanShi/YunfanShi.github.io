import { checkHasPassword } from '@/actions/auth';
import { getAiConfig, getSidebarPreferences } from '@/actions/settings';
import { createClient } from '@/lib/supabase/server';
import SettingsContent from '@/components/settings/settings-content';
import type { CompanionDeviceView } from '@/components/settings/companion-settings-panel';
import { DEFAULT_NAVIGATION_PREFERENCES } from '@/lib/companion';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  // Wrap ALL async calls in try/catch to prevent page crash
  let hasPassword = false;
  let aiConfig = { baseUrl: '', apiKey: '', model: '' };
  let displayName = '';
  let avatarUrl = '';
  let userId = '';
  let sidebarPrefs = DEFAULT_NAVIGATION_PREFERENCES;
  let cloudSettings: Record<string, Record<string, unknown>> = {};
  let companionDevices: CompanionDeviceView[] = [];
  let section: string | undefined;

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
    const [{ data: profile }, { data: settingRows }, { data: devices }] = user ? await Promise.all([
      supabase.from('profiles').select('display_name, avatar_url').eq('id', user.id).maybeSingle(),
      supabase.from('user_settings').select('key, value').eq('user_id', user.id),
      supabase.from('companion_devices').select('id, name, platform, extension_version, last_seen_at, revoked_at').eq('user_id', user.id).order('last_seen_at', { ascending: false }),
    ]) : [{ data: null }, { data: [] }, { data: [] }];
    displayName = profile?.display_name ?? user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '';
    avatarUrl = profile?.avatar_url ?? user?.user_metadata?.avatar_url ?? '';
    userId = user?.id ?? '';
    cloudSettings = Object.fromEntries((settingRows ?? []).map((row) => [row.key, row.value as Record<string, unknown>]));
    companionDevices = (devices ?? []) as CompanionDeviceView[];
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
    />
  );
}
