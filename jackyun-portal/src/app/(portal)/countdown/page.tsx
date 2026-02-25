import { createClient } from '@/lib/supabase/server';
import AddCountdownForm from '@/components/modules/countdown/add-countdown-form';
import CountdownList from '@/components/modules/countdown/countdown-list';

interface Countdown {
  id: string;
  title: string;
  target_date: string;
  description: string | null;
  color: string;
}

export default async function CountdownPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('countdowns')
    .select('id, title, target_date, description, color')
    .order('target_date', { ascending: true });

  const countdowns: Countdown[] = data ?? [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">倒计时</h1>
        <p className="mt-1 text-[var(--muted-foreground)]">记录重要时刻，倒数每一天</p>
      </div>

      <AddCountdownForm />
      <CountdownList countdowns={countdowns} />
    </div>
  );
}
