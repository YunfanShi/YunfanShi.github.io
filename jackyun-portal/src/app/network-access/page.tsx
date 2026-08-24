import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import NetworkAccessForm from '@/components/network/network-access-form';
import { NETWORK_PORTAL_COOKIE, verifyNetworkPortalSession } from '@/lib/network-portal-session';

export const metadata: Metadata = {
  title: '网络接入登记 | JackYun',
  description: 'JackYun Network 访客设备登记',
  robots: { index: false, follow: false },
};

export default async function NetworkAccessPage() {
  const cookieStore = await cookies();
  const session = verifyNetworkPortalSession(
    cookieStore.get(NETWORK_PORTAL_COOKIE)?.value,
    process.env.NETWORK_PORTAL_SESSION_SECRET,
  );

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-950 px-4 py-8 sm:px-8">
      <div className="absolute inset-0 bg-[url('/network-portal-landscape.png')] bg-cover bg-center" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,.22),rgba(2,6,23,.5))]" />
      <div className="relative w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/30 bg-white/10 shadow-[0_30px_100px_rgba(2,6,23,.5)] backdrop-blur-[2px]">
        <header className="flex items-center justify-between border-b border-white/25 bg-slate-950/55 px-5 py-4 text-white sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500 font-bold">JY</div>
            <div>
              <p className="text-sm font-semibold tracking-[.16em]">PRIVATE NETWORK</p>
              <p className="text-xs text-sky-100">安全接入门户</p>
            </div>
          </div>
          <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs text-sky-50">Router Access</span>
        </header>

        <div className="grid min-h-[570px] place-items-center px-4 py-8 sm:px-8 sm:py-12">
          {session ? (
            <NetworkAccessForm hasDeviceIdentity={Boolean(session.clientMac || session.clientIp)} />
          ) : (
            <section className="w-full max-w-lg rounded-2xl border border-white/25 bg-slate-950/65 p-6 text-center text-white shadow-2xl backdrop-blur-xl sm:p-9">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-sky-300/50 bg-sky-400/15 text-2xl" aria-hidden>⌁</div>
              <h1 className="mt-5 text-2xl font-semibold">仅限本地网络访问</h1>
              <p className="mt-2 text-sm font-medium text-sky-100">Local Network Access Only</p>
              <p className="mx-auto mt-5 max-w-sm text-sm leading-6 text-slate-200">请连接指定 Wi-Fi，并等待路由器自动打开本页面。公网直接访问不会显示登记表单。</p>
            </section>
          )}
        </div>

        <footer className="border-t border-white/20 bg-slate-950/60 px-5 py-4 text-center text-xs leading-5 text-slate-200">
          本页面只登记网络识别所需的基础信息，不会索要密码、验证码、付款信息或浏览记录。
        </footer>
      </div>
    </main>
  );
}
