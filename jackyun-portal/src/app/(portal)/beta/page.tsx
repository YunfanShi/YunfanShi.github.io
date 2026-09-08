import Link from 'next/link';
import { redirect } from 'next/navigation';
import BetaFeedbackForm from '@/components/modules/beta-feedback-form';
import { BETA_AGREEMENT_VERSION, BETA_FEATURES, COMPANION_BETA_VERSION } from '@/lib/beta';
import { createClient } from '@/lib/supabase/server';
import { APP_VERSION } from '@/lib/utils';

export default async function BetaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/beta');
  const [{ data: enrollment }, { data: devices }] = await Promise.all([
    supabase.from('beta_enrollments').select('status, responded_at, agreement_version').eq('user_id', user.id).maybeSingle(),
    supabase.from('companion_devices').select('id, name, extension_version, last_seen_at, revoked_at').eq('user_id', user.id).is('revoked_at', null).order('last_seen_at', { ascending: false }),
  ]);
  if (enrollment?.status !== 'accepted') redirect('/dashboard');
  const currentDevice = devices?.[0];
  const hasCurrentCompanion = devices?.some((device) => device.extension_version === COMPANION_BETA_VERSION) ?? false;

  return <div className="mx-auto max-w-6xl space-y-6 pb-12">
    <header className="overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#24143f,#6941c6_52%,#0e7490)] p-6 text-white shadow-xl shadow-[#6941c6]/15 sm:p-9">
      <div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-3xl"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold tracking-[.14em]">PRIVATE BETA</span><span className="rounded-full bg-[#12b76a] px-3 py-1 text-xs font-bold">资格已生效</span></div><h1 className="mt-5 text-3xl font-bold tracking-[-.04em] sm:text-4xl">JackYun BETA 测试中心</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-[#ece9fe] sm:text-base">这里集中展示当前测试功能、版本、安装包、测试重点和已知问题。BETA 功能可能调整或临时关闭，请把异常直接提交到本页反馈区。</p></div><div className="grid min-w-48 grid-cols-2 gap-2 text-center"><div className="rounded-2xl bg-white/10 p-4"><span className="block text-xs text-[#d6bbfb]">Portal</span><strong className="mt-1 block text-xl">v{APP_VERSION}</strong></div><div className="rounded-2xl bg-white/10 p-4"><span className="block text-xs text-[#d6bbfb]">Companion</span><strong className="mt-1 block text-xl">v{COMPANION_BETA_VERSION}</strong></div></div></div>
      <div className="mt-6 flex flex-wrap gap-3"><a href={`/downloads/jackyun-companion-v${COMPANION_BETA_VERSION}.zip`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[#53389e]"><span className="material-icons-round text-lg">download</span>下载 Companion BETA {COMPANION_BETA_VERSION}</a><Link href="/settings?section=ai" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 px-4 text-sm font-bold"><span className="material-icons-round text-lg">tune</span>打开 AI 设置</Link><a href="#feedback" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 px-4 text-sm font-bold"><span className="material-icons-round text-lg">feedback</span>提交反馈</a></div>
    </header>

    <section className={`rounded-2xl border p-5 ${hasCurrentCompanion ? 'border-[#6ce9a6] bg-[#ecfdf3] text-[#05603a] dark:bg-[#063d2a]' : 'border-[#fec84b] bg-[#fffaeb] text-[#7a2e0e] dark:bg-[#3d2f12]'}`}><div className="flex items-start gap-3"><span className="material-icons-round text-2xl">{hasCurrentCompanion ? 'verified' : 'upgrade'}</span><div><h2 className="font-bold">{hasCurrentCompanion ? `已检测到 Companion ${COMPANION_BETA_VERSION}` : `需要安装或重新加载 Companion ${COMPANION_BETA_VERSION}`}</h2><p className="mt-1 text-sm leading-6">{hasCurrentCompanion ? `最近连接设备：${currentDevice?.name ?? 'Companion'}。可以开始测试自动打开与填写。` : currentDevice ? `最近连接的是 ${currentDevice.name} v${currentDevice.extension_version}，该版本不包含最新自动化代码。下载 ZIP、解压并在扩展管理页重新加载后再测试。` : '当前账号还没有连接扩展。下载安装、登录同一账号并完成一次同步后，设备版本会显示在这里。'}</p></div></div></section>

    <section><div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#7f56d9]">Current experiments</p><h2 className="mt-1 text-2xl font-bold">当前 BETA 功能</h2></div><span className="text-sm text-[var(--muted-foreground)]">共 {BETA_FEATURES.length} 项</span></div><div className="grid gap-4 lg:grid-cols-3">{BETA_FEATURES.map((feature) => <article key={feature.id} className="flex flex-col rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5"><div className="flex items-start justify-between gap-3"><div><span className="text-xs font-bold text-[#7f56d9]">{feature.version}</span><h3 className="mt-1 text-lg font-bold">{feature.name}</h3></div><span className="shrink-0 rounded-full bg-[#f4ebff] px-2.5 py-1 text-[10px] font-bold text-[#6941c6] dark:bg-[#53389e]/35 dark:text-[#d6bbfb]">{feature.status}</span></div><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{feature.description}</p><div className="mt-5"><p className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">建议测试</p><ol className="mt-2 space-y-2 text-sm">{feature.testPoints.map((point, index) => <li key={point} className="flex gap-2"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#f4ebff] text-[10px] font-bold text-[#6941c6]">{index + 1}</span><span>{point}</span></li>)}</ol></div><div className="mt-auto pt-5"><p className="rounded-xl bg-[var(--background)] p-3 text-xs leading-5 text-[var(--muted-foreground)]"><strong className="text-[var(--foreground)]">已知问题：</strong>{feature.knownIssue}</p>{feature.id === 'site-studio' && <Link href="/studio" className="mt-3 inline-flex text-sm font-bold text-[#6941c6]">打开 AI 网站工作室 →</Link>}</div></article>)}</div></section>

    <section className="grid gap-4 md:grid-cols-3"><Info title="测试资格" icon="badge" text={`已同意协议 ${enrollment.agreement_version ?? BETA_AGREEMENT_VERSION}${enrollment.responded_at ? ` · 加入于 ${new Date(enrollment.responded_at).toLocaleDateString('zh-CN')}` : ''}`} /><Info title="数据与隐私" icon="shield" text="自动化只在你明确开启后运行。Prompt 会进入所选第三方 AI；JackYun 的普通 Companion 活动统计不保存页面正文。" /><Info title="回退方式" icon="restart_alt" text="自动化失败时可在同一个窗口复制 Prompt、手动发送并粘贴回复；不会阻断其他 Stable 功能。" /></section>
    <BetaFeedbackForm />
  </div>;
}

function Info({ title, icon, text }: { title: string; icon: string; text: string }) {
  return <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5"><span className="material-icons-round text-[#7f56d9]">{icon}</span><h2 className="mt-3 font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p></article>;
}
