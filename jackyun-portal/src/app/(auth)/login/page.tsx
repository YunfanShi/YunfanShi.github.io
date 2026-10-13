import SessionRecovery from '@/components/auth/session-recovery';
import LoginButton from '@/components/auth/login-button';
import GoogleLoginButton from '@/components/auth/google-login-button';
import EmailLoginForm from '@/components/auth/email-login-form';
import AppleLoginButton from '@/components/auth/apple-login-button';
import BrandLogo from '@/components/brand-logo';
import Link from 'next/link';
import styles from './login.module.css';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const requested = (await searchParams).next;
  const guestTarget = requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard';
  return (
    <div className={styles.page}><div className={styles.layout}>
      <aside className={styles.story}>
        <div className={styles.brand}><BrandLogo size={36} priority /><span>JackYun Workspace</span></div>
        <h2>专注于今天，<br />积累每一步。</h2>
        <p>把计划、练习和复习留在同一个工作区。<br />从一个清晰的小目标开始。</p>
        <div className={styles.scene} aria-hidden="true"><div className={styles.sceneHeader}><span>YOUR NEXT CHAPTER</span><span>◷</span></div><div className={styles.orbit}><div className={styles.ring}>✓</div><div className={styles.lines}><span /><span /><span /></div></div><div className={styles.chips}><span>计划</span><span>独立练习</span><span>新题验证</span></div></div>
      </aside>
      <div className={styles.form}>
        {/* Logo / Title */}
        <div className={styles.intro}>
          <div className={styles.mobileBrand}><BrandLogo size={42} className="mx-auto" priority /></div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">JackYun Workspace</p>
          <h1 className="mt-2 text-3xl font-medium tracking-[-0.04em] text-[var(--foreground)]">欢迎回来</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            继续你的学习与生活工作区
          </p>
        </div>

        {/* Card */}
        <div
          className={`${styles.card} space-y-5`}
        >
          {/* Email / Password login */}
          <SessionRecovery loginPage />
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

        <p className={styles.footer}>
          登录用户可跨设备同步，游客可直接使用全部本地功能
        </p>
      </div>
    </div></div>
  );
}
