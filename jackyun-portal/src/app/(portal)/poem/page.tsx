import { createClient } from '@/lib/supabase/server';
import PoemApp from '@/components/modules/poem/poem-app';
import type { PoemRecord } from '@/types/poem';

export default async function PoemPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('poems')
    .select(
      'id, user_id, title, author, content, mastery_level, best_time, completion_count, last_progress, created_at, updated_at',
    )
    .order('created_at', { ascending: false });

  const poems: PoemRecord[] = (data ?? []).map((p) => ({
    ...p,
    best_time: p.best_time ?? null,
    completion_count: p.completion_count ?? 0,
    last_progress: p.last_progress ?? 0,
  }));

  return <PoemApp initialPoems={poems} />;
}
