import LoginButton from '@/components/auth/login-button';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="w-full max-w-sm mx-auto p-8">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center gap-1 mb-4">
            <span className="text-4xl font-bold text-[#4285F4]">J</span>
            <span className="text-4xl font-bold text-[#EA4335]">a</span>
            <span className="text-4xl font-bold text-[#FBBC05]">c</span>
            <span className="text-4xl font-bold text-[#34A853]">k</span>
            <span className="text-4xl font-bold text-[#4285F4]">Y</span>
            <span className="text-4xl font-bold text-[#EA4335]">u</span>
            <span className="text-4xl font-bold text-[#FBBC05]">n</span>
          </div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">
            Personal Portal
          </h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            登录以继续使用
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-8 shadow-sm"
        >
          <LoginButton />
        </div>

        <p className="mt-6 text-center text-xs text-[var(--muted-foreground)]">
          仅限授权用户访问
        </p>
      </div>
    </div>
  );
}
