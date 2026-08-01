import LegacyFrame from '@/components/modules/legacy-frame';
import { createClient } from '@/lib/supabase/server';

export default async function ControlPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.user_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    (user?.email?.split('@')[0] as string | undefined) ??
    'User';

  return <LegacyFrame src="/Control.html" title="日程中心" userName={userName} />;
}
