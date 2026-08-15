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

const DEFAULT_SIDEBAR_PREFS: SidebarPreferences = {
  musicMode: 'player',
  answerSheetMode: 'standard',
};

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
  const { data: settings } = claims
    ? await supabase
        .from('user_settings')
        .select('key, value')
        .eq('user_id', claims.sub)
        .in('key', ['sidebar_preferences', 'language_preference'])
    : { data: null };

  let sidebarPrefs = { ...DEFAULT_SIDEBAR_PREFS };
  let language: Language = 'zh';
  for (const setting of settings ?? []) {
    if (setting.key === 'sidebar_preferences') {
      const value = setting.value as Partial<SidebarPreferences> | null;
      if (value?.musicMode && value?.answerSheetMode) {
        sidebarPrefs = {
          musicMode: value.musicMode,
          answerSheetMode: value.answerSheetMode,
        };
      }
    } else if (setting.key === 'language_preference') {
      const value = setting.value as { language?: string } | null;
      language = value?.language === 'en' ? 'en' : 'zh';
    }
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
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[var(--background)]">
        <Sidebar initialPrefs={sidebarPrefs} />
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
