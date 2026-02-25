import { User } from '@supabase/supabase-js';
import UserAvatar from '@/components/auth/user-avatar';
import { signOut } from '@/actions/auth';

interface TopbarProps {
  user: User | null;
}

export default function Topbar({ user }: TopbarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--sidebar-border)] bg-[var(--card)] px-6">
      <div className="text-base font-medium text-[var(--foreground)]">
        JackYun Portal
      </div>
      <div className="flex items-center gap-4">
        {user && (
          <>
            <UserAvatar user={user} />
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="material-icons-round text-lg">logout</span>
                <span className="hidden sm:inline">退出</span>
              </button>
            </form>
          </>
        )}
      </div>
    </header>
  );
}
