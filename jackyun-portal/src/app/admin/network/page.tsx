import { getNetworkDevices, type NetworkDevice } from '@/actions/admin';
import { AdminPageHeader } from '@/components/admin/page-header';
import NetworkDeviceManager from '@/components/admin/network-device-manager';

export default async function NetworkAdminPage() {
  let devices: NetworkDevice[] = [];
  let loadError = '';
  try {
    devices = await getNetworkDevices();
  } catch (error) {
    loadError = error instanceof Error ? error.message : '未知错误';
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 pb-10">
        <AdminPageHeader title="网络设备" description="审核访客登记并准备 TR3000 联动。" />
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-900">
          <p className="font-semibold">网络登记数据库尚未就绪</p>
          <p className="mt-1">请先应用最新 Supabase migration，再刷新此页面。（{loadError}）</p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <AdminPageHeader title="网络设备" description="审核访客登记，生成 TR3000 QoS 备注与待应用的限速、解除限速或阻断动作。" />
      <NetworkDeviceManager devices={devices} />
    </div>
  );
}
