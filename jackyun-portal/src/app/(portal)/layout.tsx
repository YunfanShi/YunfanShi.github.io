import Sidebar from '@/components/layout/sidebar';
import Topbar from '@/components/layout/topbar';
import LegacyBridge from '@/components/modules/legacy-bridge';
import KeyboardShortcuts from '@/components/layout/keyboard-shortcuts';
import AiChatFab from '@/components/modules/ai-chat-fab';
import MiniPlayer from '@/components/modules/mini-player';
import FlyingTimer from '@/components/modules/floating-timer';
import SiteNotificationModal from '@/components/modules/site-notification-modal';
import LanguageProvider from '@/components/language-provider';
import ClientLoggerBoot from '@/components/layout/client-logger-boot';
import { createClient } from '@/lib/supabase/server';
import { getSidebarPreferences } from '@/actions/settings';

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sidebarPrefs = await getSidebarPreferences();

  return (
    <LanguageProvider>
      <ClientLoggerBoot />
      <div className="flex h-screen overflow-hidden bg-[var(--background)]">
        <Sidebar initialPrefs={sidebarPrefs} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar user={user} />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
        <LegacyBridge />
        <KeyboardShortcuts />
        <AiChatFab />
        <MiniPlayer />
        <FlyingTimer />
        <SiteNotificationModal />
      </div>
    </LanguageProvider>
  );
}
