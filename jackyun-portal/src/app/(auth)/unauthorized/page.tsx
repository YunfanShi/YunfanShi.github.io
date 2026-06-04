import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function UnauthorizedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  async function handleSignOut() {
    'use server';
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="w-full max-w-sm mx-auto p-8 text-center">
        <span className="material-icons-round text-6xl text-[#EA4335]">
          block
        </span>
        <h1 className="mt-4 text-2xl font-bold text-[var(--foreground)]">
          访问被拒绝
        </h1>
        <p className="mt-2 text-[var(--muted-foreground)]">
          用户{' '}
          <strong>{user?.user_metadata?.user_name ?? '未知用户'}</strong>{' '}
          未获授权访问此系统。
        </p>
        <form action={handleSignOut} className="mt-6">
          <button
            type="submit"
            className="px-6 py-2 rounded-lg bg-[#EA4335] text-white font-medium hover:opacity-90 transition-opacity"
          >
            退出登录
          </button>
        </form>
      </div>
    </div>
  );
}
