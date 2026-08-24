import type { Metadata } from 'next';
import NetworkAccessForm from '@/components/network/network-access-form';
import { firstSearchParam, normalizeMac, normalizePrivateIpv4 } from '@/lib/network-access';

export const metadata: Metadata = {
  title: '网络接入登记 | JackYun',
  description: 'JackYun Network 访客设备登记',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NetworkAccessPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const clientMac = normalizeMac(firstSearchParam(params, ['client_mac', 'clientmac', 'mac', 'sta_mac']));
  const clientIp = normalizePrivateIpv4(firstSearchParam(params, ['client_ip', 'clientip', 'ip', 'sta_ip']));
  const routerNasId = firstSearchParam(params, ['nas_id', 'nasid', 'router_id'])?.slice(0, 80);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(145deg,#eff6ff_0%,#f8fafc_48%,#ecfdf5_100%)] px-4 py-8 sm:grid sm:place-items-center sm:py-12">
      <div className="pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-blue-300/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-emerald-300/25 blur-3xl" />
      <div className="relative mx-auto w-full max-w-xl">
        <NetworkAccessForm clientMac={clientMac} clientIp={clientIp} routerNasId={routerNasId} />
        <p className="mt-5 text-center text-xs leading-5 text-slate-500">网络管理员不会通过此页面索要 Wi-Fi 密码、验证码或付款信息。</p>
      </div>
    </main>
  );
}
