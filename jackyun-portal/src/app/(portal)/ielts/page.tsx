import type { Metadata } from 'next';
import IeltsDashboard from '@/components/modules/ielts/ielts-dashboard';
import { isAdminIdentity } from '@/lib/admin-auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'IELTS 备考 · JackYun',
  description: '设置雅思目标，记录四科练习证据，并根据进度选择下一步训练。',
};

export default async function IeltsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  return <IeltsDashboard personalIeltsPlan={Boolean(user && isAdminIdentity(user, profile?.role))} />;
}
