import LegacyFrame from '@/components/modules/legacy-frame';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '专注执行 · JackYun Portal' };

export default async function FocusControlPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.user_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    (user?.email?.split('@')[0] as string | undefined) ??
    'User';

  return <LegacyFrame src="/Control.html" title="专注执行" userName={userName} />;
}
