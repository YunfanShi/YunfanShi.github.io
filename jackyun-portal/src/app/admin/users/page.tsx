import { createClient } from '@/lib/supabase/server';
import { getManagedUsers } from '@/actions/admin';
import UserOperationsPanel from '@/components/admin/user-operations-panel';
import { AdminPageHeader } from '@/components/admin/page-header';
import { getAdminBetaEnrollments } from '@/actions/beta';
import { getUserPlans } from '@/actions/ai-admin';
export default async function UsersPage() { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); const [users, betaEnrollments, userPlans] = await Promise.all([getManagedUsers(), getAdminBetaEnrollments(), getUserPlans()]); return <div className="mx-auto max-w-[1440px] space-y-6 pb-10"><AdminPageHeader title="用户" description="管理账户、套餐、BETA 邀请、用户同意状态和当前发布通道。" /><section className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]"><UserOperationsPanel users={users} currentUserId={user?.id ?? ''} betaEnrollments={betaEnrollments} userPlans={userPlans} /></section></div>; }
