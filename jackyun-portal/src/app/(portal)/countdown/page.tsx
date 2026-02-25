import { createClient } from '@/lib/supabase/server';
import CountdownApp from '@/components/modules/countdown/countdown-app';
import { CountdownEvent } from '@/types/countdown';

export default async function CountdownPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('countdowns')
    .select('id, user_id, title, target_date, description, color, sort_order, created_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  const countdowns: CountdownEvent[] = data ?? [];

  return <CountdownApp initialCountdowns={countdowns} />;
}

