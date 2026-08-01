import LegacyFrame from '@/components/modules/legacy-frame';
import { createClient } from '@/lib/supabase/server';

export default async function IGCountdownPage() {
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

  return <LegacyFrame src="/IGCountdown.html" title="考试倒计时" userName={userName} />;
}