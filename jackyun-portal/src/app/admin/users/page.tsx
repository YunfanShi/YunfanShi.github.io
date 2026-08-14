import { createClient } from '@/lib/supabase/server';
import { getManagedUsers } from '@/actions/admin';
import UserOperationsPanel from '@/components/admin/user-operations-panel';
import { AdminPageHeader } from '@/components/admin/page-header';
export default async function UsersPage() { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); const users = await getManagedUsers(); return <div className="mx-auto max-w-[1440px] space-y-6 pb-10"><AdminPageHeader title="用户" description="搜索账户、查看数据使用情况，并暂停或恢复普通用户账户。" /><section className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]"><UserOperationsPanel users={users} currentUserId={user?.id ?? ''} /></section></div>; }
