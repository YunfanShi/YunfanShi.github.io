import { checkHasPassword } from '@/actions/auth';
import { getAiConfig, getSidebarPreferences } from '@/actions/settings';
import { createClient } from '@/lib/supabase/server';
import SettingsContent from '@/components/settings/settings-content';

export default async function SettingsPage() {
  // Wrap ALL async calls in try/catch to prevent page crash
  let hasPassword = false;
  let aiConfig = { baseUrl: '', apiKey: '', model: '' };
  let displayName = '';
  let avatarUrl = '';
  let userId = '';
  let sidebarPrefs: { musicMode: 'player' | 'sync'; answerSheetMode: 'standard' | 'sync' } = { musicMode: 'player', answerSheetMode: 'standard' };

  try {
    hasPassword = await checkHasPassword();
  } catch { /* fallback: no password set */ }

  try {
    aiConfig = await getAiConfig();
  } catch { /* fallback: empty config */ }

  try {
    sidebarPrefs = await getSidebarPreferences();
  } catch { /* fallback: default */ }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = user ? await supabase.from('profiles').select('display_name, avatar_url').eq('id', user.id).maybeSingle() : { data: null };
    displayName = profile?.display_name ?? user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '';
    avatarUrl = profile?.avatar_url ?? user?.user_metadata?.avatar_url ?? '';
    userId = user?.id ?? '';
  } catch { /* fallback: not authenticated, show empty profile */ }

  return (
    <SettingsContent
      hasPassword={hasPassword}
      aiConfig={aiConfig}
      displayName={displayName}
      avatarUrl={avatarUrl}
      userId={userId}
      sidebarPrefs={sidebarPrefs}
    />
  );
}

