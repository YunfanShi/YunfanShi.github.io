import Sidebar from '@/components/layout/sidebar';
import Topbar from '@/components/layout/topbar';
import LegacyBridge from '@/components/modules/legacy-bridge';
import KeyboardShortcuts from '@/components/layout/keyboard-shortcuts';
import AiChatFab from '@/components/modules/ai-chat-fab';
import { createClient } from '@/lib/supabase/server';

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar user={user} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <LegacyBridge />
      <KeyboardShortcuts />
      <AiChatFab />
    </div>
  );
}
