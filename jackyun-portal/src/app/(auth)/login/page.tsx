import LoginButton from '@/components/auth/login-button';
import GoogleLoginButton from '@/components/auth/google-login-button';
import EmailLoginForm from '@/components/auth/email-login-form';
import AppleLoginButton from '@/components/auth/apple-login-button';

export default function LoginPage() {
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
        </div>

        <p className="mt-5 text-center text-xs text-[var(--muted-foreground)]">
          仅限授权用户访问
        </p>
      </div>
    </div>
  );
}
