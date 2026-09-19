import ScheduleControl from '@/components/modules/schedule/schedule-control';
import { isAdminIdentity } from '@/lib/admin-auth';
import { createClient } from '@/lib/supabase/server';

export const metadata = {
  title: '学习日程 · JackYun Portal',
  description: '课表、待办、预习与间隔复习的个人学习控制台。',
};

export default async function ControlPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  return <ScheduleControl personalIeltsPlan={Boolean(user && isAdminIdentity(user, profile?.role))} />;
}
