import Sidebar from '@/components/layout/sidebar';
import Topbar from '@/components/layout/topbar';
import LegacyBridge from '@/components/modules/legacy-bridge';
import KeyboardShortcuts from '@/components/layout/keyboard-shortcuts';
import DeferredAiChat from '@/components/modules/deferred-ai-chat';
import MiniPlayer from '@/components/modules/mini-player';
import FlyingTimer from '@/components/modules/floating-timer';
import SiteNotificationModal from '@/components/modules/site-notification-modal';
import LanguageProvider from '@/components/language-provider';
import ClientLoggerBoot from '@/components/layout/client-logger-boot';
import AdminDebugConsole from '@/components/admin/admin-debug-console';
import { createClient } from '@/lib/supabase/server';
import type { SidebarPreferences } from '@/actions/settings';
import type { Language } from '@/lib/i18n';
import { coerceNavigationPreferences, DEFAULT_NAVIGATION_PREFERENCES } from '@/lib/companion';
import CloudSettingsHydrator from '@/components/layout/cloud-settings-hydrator';

const DEFAULT_SIDEBAR_PREFS: SidebarPreferences = DEFAULT_NAVIGATION_PREFERENCES;

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  // Load both shell preferences in one query. The previous implementation
  // repeated auth verification and issued one query per preference.
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const [{ data: settings }, { data: navigationUsage }] = claims
    ? await Promise.all([supabase
        .from('user_settings')
        .select('key, value')
        .eq('user_id', claims.sub)
        .in('key', ['sidebar_preferences', 'language_preference', 'appearance_preferences']), supabase
        .from('navigation_usage_daily')
        .select('activity_date, nav_item_id, opens')
        .eq('user_id', claims.sub)
        .gte('activity_date', thirtyDaysAgo.toISOString().slice(0, 10))])
    : [{ data: null }, { data: null }];

  let sidebarPrefs = { ...DEFAULT_SIDEBAR_PREFS };
  let language: Language = 'zh';
  let appearancePreferences: Record<string, unknown> = {};
  for (const setting of settings ?? []) {
    if (setting.key === 'sidebar_preferences') {
      sidebarPrefs = coerceNavigationPreferences(setting.value);
    } else if (setting.key === 'language_preference') {
      const value = setting.value as { language?: string } | null;
      language = value?.language === 'en' ? 'en' : 'zh';
    } else if (setting.key === 'appearance_preferences') {
      appearancePreferences = setting.value as Record<string, unknown>;
    }
  }
  const adaptiveScores: Record<string, number> = {};
  const sevenDayKey = sevenDaysAgo.toISOString().slice(0, 10);
  for (const row of navigationUsage ?? []) {
    const opens = Number(row.opens || 0);
    adaptiveScores[row.nav_item_id] = (adaptiveScores[row.nav_item_id] ?? 0) + opens + (row.activity_date >= sevenDayKey ? opens * 3 : 0);
  }

  const user = claims
    ? {
        id: claims.sub,
        email: claims.email,
        user_metadata: claims.user_metadata ?? {},
      }
    : null;

  return (
    <LanguageProvider initialLanguage={language}>
      <ClientLoggerBoot />
      <CloudSettingsHydrator appearance={appearancePreferences} />
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[var(--background)]">
        <Sidebar initialPrefs={sidebarPrefs} adaptiveScores={adaptiveScores} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar user={user} />
          <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-6 lg:p-8">{children}</main>
        </div>
        <LegacyBridge />
        <KeyboardShortcuts />
        <DeferredAiChat />
        <MiniPlayer />
        <FlyingTimer />
        <SiteNotificationModal />
        <AdminDebugConsole />
      </div>
    </LanguageProvider>
  );
}
