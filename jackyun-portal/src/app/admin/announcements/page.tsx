import { NotificationManagerPanel } from '@/components/admin/notification-manager-panel';
import { AdminPageHeader } from '@/components/admin/page-header';
export default function AnnouncementsPage() { return <div className="mx-auto max-w-[1100px] space-y-6 pb-10"><AdminPageHeader title="公告" description="创建、排期、编辑和停用平台通知；用户端会保留已读状态。" /><section className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]"><NotificationManagerPanel /></section></div>; }
