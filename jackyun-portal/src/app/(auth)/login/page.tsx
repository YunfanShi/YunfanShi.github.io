import LoginButton from '@/components/auth/login-button';
import GoogleLoginButton from '@/components/auth/google-login-button';
import EmailLoginForm from '@/components/auth/email-login-form';
import AppleLoginButton from '@/components/auth/apple-login-button';
import Link from 'next/link';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const requested = (await searchParams).next;
  const guestTarget = requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard';
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-5">
      <div className="w-full max-w-sm py-10">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-lg bg-[var(--brand)] text-lg font-medium text-white dark:text-[#202124]">J</div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">JackYun Workspace</p>
          <h1 className="mt-2 text-3xl font-medium tracking-[-0.04em] text-[var(--foreground)]">欢迎回来</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            登录以继续使用
          </p>
        </div>

        {/* Card */}
        <div
          className="space-y-6 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-7 shadow-[var(--surface-shadow)] sm:p-8"
        >
          {/* Email / Password login */}
          <EmailLoginForm />

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--card-border)]" />
            <span className="text-xs text-[var(--muted-foreground)]">或</span>
            <div className="flex-1 h-px bg-[var(--card-border)]" />
          </div>

          {/* Google & GitHub OAuth */}
          <div className="space-y-3">
            <GoogleLoginButton />
            <LoginButton />
            <AppleLoginButton />
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--card-border)]" />
            <span className="text-xs text-[var(--muted-foreground)]">无需账号</span>
            <div className="h-px flex-1 bg-[var(--card-border)]" />
          </div>
          <Link href={guestTarget} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-sm font-semibold text-[var(--foreground)] transition-colors hover:border-[#1a73e8] hover:text-[#1a73e8]">
            <span className="material-icons-round text-lg">person_outline</span>
            游客登录
          </Link>
          <p className="text-center text-xs leading-5 text-[var(--muted-foreground)]">游客数据只保存在当前设备；之后登录会自动合并并开启云同步。</p>
        </div>

        <p className="mt-5 text-center text-xs text-[var(--muted-foreground)]">
          登录用户可跨设备同步，游客可直接使用全部本地功能
        </p>
      </div>
    </div>
  );
}
