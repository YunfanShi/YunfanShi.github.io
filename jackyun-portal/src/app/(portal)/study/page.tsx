import LegacyFrame from '@/components/modules/legacy-frame';
import { createClient } from '@/lib/supabase/server';

export default async function StudyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.user_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email?.split('@')[0] ??
    'User';

  return <LegacyFrame src="/Studyplan.html" title="学习计划" userName={userName} />;
}
