import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { signOut, getLinkedProviders } from '@/actions/auth';
import {
  getSystemInfo,
  getTableStats,
  getWhitelistInfo,
  getWhitelistEmails,
  getWhitelistUsernames,
} from '@/actions/admin';
import AccountLinkingPanel from '@/components/admin/account-linking-panel';
import ChangePasswordPanel from '@/components/admin/change-password-panel';
import {
  WhitelistEmailsPanel,
  WhitelistUsernamesPanel,
  ForceMergePanel,
} from '@/components/admin/whitelist-panels';

const TABLE_ICONS: Record<string, string> = {
  vocab_words: 'menu_book',
  study_plans: 'school',
  study_tasks: 'task_alt',
  poems: 'auto_stories',
  playlists: 'queue_music',
  tracks: 'music_note',
  countdowns: 'timer',
};

const TABLE_LABELS: Record<string, string> = {
  vocab_words: '词汇',
  study_plans: '学习计划',
  study_tasks: '学习任务',
  poems: '诗词',
  playlists: '播放列表',
  tracks: '音乐曲目',
  countdowns: '倒计时',
};

const TABLE_COLORS = ['#4285F4', '#EA4335', '#FBBC05', '#34A853', '#4285F4', '#EA4335', '#FBBC05'];

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="material-icons-round text-[var(--muted-foreground)] text-lg">{icon}</span>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
        {title}
      </h2>
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[var(--card-border)] last:border-0">
      <span className="text-sm text-[var(--muted-foreground)] shrink-0">{label}</span>
      <span className={`text-sm text-right text-[var(--foreground)] break-all ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

const PROVIDER_NAMES: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  email: '邮箱',
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string }>;
}) {
  const params = await searchParams;
  const linkedProvider = params.linked;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [systemInfo, tableStats, whitelistInfo, whitelistEmails, whitelistUsernames] = await Promise.all([
    getSystemInfo(),
    getTableStats(),
    getWhitelistInfo(),
    getWhitelistEmails().catch(() => []),
    getWhitelistUsernames().catch(() => []),
  ]);

  const linkedProviders = user ? await getLinkedProviders(user.id).catch(() => []) : [];

  const provider = user?.app_metadata?.provider as string | undefined;
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    '—';
  const githubUsername = user?.user_metadata?.user_name as string | undefined;
  const email = user?.email ?? '—';
  const userId = user?.id ?? '—';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">管理员</h1>
        <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">系统信息与账户配置</p>
      </div>

      {/* Admin Tools */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="apps" title="管理工具" />
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/update-hub"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[#4285F4]/5 hover:border-[#4285F4]/30 transition-colors"
          >
            <span className="material-icons-round text-base text-[#4285F4]">history</span>
            版本历史
          </Link>
          <Link
            href="/admin/enforcer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[#EA4335]/5 hover:border-[#EA4335]/30 transition-colors"
          >
            <span className="material-icons-round text-base text-[#EA4335]">timer</span>
            专注模式
          </Link>
          <ChangePasswordPanel />
        </div>
      </section>

      {/* 用户信息 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="person" title="用户信息" />
        <div className="flex items-center gap-4 mb-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-14 h-14 rounded-full border border-[var(--card-border)]"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-[#4285F4]/10 flex items-center justify-center">
              <span className="material-icons-round text-2xl text-[#4285F4]">person</span>
            </div>
          )}
          <div>
            <p className="font-semibold text-[var(--foreground)]">{displayName}</p>
            <p className="text-sm text-[var(--muted-foreground)]">{email}</p>
          </div>
        </div>
        <div>
          {githubUsername && (
            <InfoRow
              label="GitHub 用户名"
              value={
                <span className="flex items-center gap-1 justify-end">
                  <span className="material-icons-round text-sm">code</span>
                  {githubUsername}
                </span>
              }
            />
          )}
          <InfoRow
            label="登录方式"
            value={
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: provider === 'github' ? '#24292e20' : '#4285F420',
                  color: provider === 'github' ? '#24292e' : '#4285F4',
                }}
              >
                <span className="material-icons-round text-[11px]">
                  {provider === 'github' ? 'code' : 'email'}
                </span>
                {provider === 'github' ? 'GitHub' : provider ?? 'email'}
              </span>
            }
          />
          <InfoRow label="用户 ID" value={userId} mono />
        </div>
      </section>

      {/* 白名单配置 — 数据库管理 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="verified_user" title="白名单配置" />

        {/* Env-var legacy display */}
        {(whitelistInfo.githubUsers.length > 0 || whitelistInfo.emails.length > 0) && (
          <div className="mb-5">
            <p className="text-xs text-[var(--muted-foreground)] mb-2 font-medium">
              环境变量（只读）
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
                  <span className="material-icons-round text-sm">code</span>
                  GitHub 用户 ({whitelistInfo.githubUsers.length})
                </p>
                <div className="space-y-1">
                  {whitelistInfo.githubUsers.map((u) => (
                    <div
                      key={u}
                      className="flex items-center gap-2 text-sm px-2.5 py-1.5 rounded-lg bg-[#4285F4]/5 text-[var(--foreground)]"
                    >
                      <span className="material-icons-round text-sm text-[#4285F4]">person</span>
                      {u}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
                  <span className="material-icons-round text-sm">email</span>
                  授权邮箱 ({whitelistInfo.emails.length})
                </p>
                <div className="space-y-1">
                  {whitelistInfo.emails.map((e, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm px-2.5 py-1.5 rounded-lg bg-[#34A853]/5 text-[var(--foreground)]"
                    >
                      <span className="material-icons-round text-sm text-[#34A853]">mail</span>
                      {e}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="my-4 h-px bg-[var(--card-border)]" />
          </div>
        )}

        {/* Database whitelist emails */}
        <div className="mb-5">
          <p className="text-xs font-medium text-[var(--muted-foreground)] mb-3 flex items-center gap-1">
            <span className="material-icons-round text-sm">mail</span>
            数据库白名单邮箱
          </p>
          <WhitelistEmailsPanel items={whitelistEmails} />
        </div>

        <div className="h-px bg-[var(--card-border)] mb-5" />

        {/* Database whitelist usernames */}
        <div>
          <p className="text-xs font-medium text-[var(--muted-foreground)] mb-3 flex items-center gap-1">
            <span className="material-icons-round text-sm">person</span>
            数据库白名单用户名
          </p>
          <WhitelistUsernamesPanel items={whitelistUsernames} />
        </div>
      </section>

      {/* 系统信息 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="info" title="系统信息" />
        <InfoRow label="Node.js 版本" value={systemInfo.nodeVersion} mono />
        <InfoRow label="构建时间" value={new Date(systemInfo.buildTime).toLocaleString('zh-CN')} />
      </section>

      {/* 数据统计 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="bar_chart" title="数据统计" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {tableStats.map(({ tableName, count }, idx) => {
            const color = TABLE_COLORS[idx % TABLE_COLORS.length];
            return (
              <div
                key={tableName}
                className="rounded-xl border border-[var(--card-border)] p-3 flex flex-col gap-1"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center mb-1"
                  style={{ backgroundColor: `${color}1A` }}
                >
                  <span className="material-icons-round text-base" style={{ color }}>
                    {TABLE_ICONS[tableName] ?? 'table_chart'}
                  </span>
                </div>
                <span className="text-xl font-bold text-[var(--foreground)]">{count}</span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {TABLE_LABELS[tableName] ?? tableName}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 快速操作 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="bolt" title="快速操作" />

        {/* Account linking */}
        <div className="mb-5">
          <SectionHeader icon="link" title="关联第三方账号" />
          {linkedProvider && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-[#34A853]/10 text-sm text-[#34A853]">
              <span className="material-icons-round text-base">check_circle</span>
              已成功关联 {PROVIDER_NAMES[linkedProvider] ?? linkedProvider} 账号
            </div>
          )}
          <AccountLinkingPanel
            currentProviders={linkedProviders}
            userId={userId}
          />
        </div>

        <div className="h-px bg-[var(--card-border)] mb-5" />

        {/* Force merge */}
        <div className="mb-5">
          <ForceMergePanel />
        </div>

        <div className="h-px bg-[var(--card-border)] mb-5" />

        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#EA4335]/30 text-[#EA4335] text-sm font-medium hover:bg-[#EA4335]/5 transition-colors"
          >
            <span className="material-icons-round text-base">logout</span>
            退出登录
          </button>
        </form>
      </section>
    </div>
  );
}
