'use client';

import { useRouter } from 'next/navigation';

export default function GuestLoginButton() {
  const router = useRouter();

  const handleGuestLogin = () => {
    // Set a cookie to indicate guest mode
    document.cookie = 'guest=1; path=/; max-age=86400'; // 24 hours expiry
    router.push('/dashboard');
  };

  return (
    <button
      onClick={handleGuestLogin}
      className="w-full flex items-center justify-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      <span className="material-icons-round text-lg text-[var(--muted-foreground)]">visibility</span>
      以游客身份继续
    </button>
  );
}