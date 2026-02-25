import { createClient } from '@/lib/supabase/server';
import AddPoemForm from '@/components/modules/poem/add-poem-form';
import PoemList from '@/components/modules/poem/poem-list';

interface Poem {
  id: string;
  title: string;
  author: string | null;
  content: string;
  mastery_level: number;
  created_at: string;
}

export default async function PoemPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('poems')
    .select('id, title, author, content, mastery_level, created_at')
    .order('created_at', { ascending: false });

  const poems: Poem[] = data ?? [];

  const total = poems.length;
  const avgMastery =
    total > 0
      ? (poems.reduce((sum, p) => sum + p.mastery_level, 0) / total).toFixed(1)
      : '0.0';
  const fullyMastered = poems.filter((p) => p.mastery_level === 5).length;

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">诗词天地</h1>
        <p className="mt-1 text-[var(--muted-foreground)]">积累诗词，熟读成诵，感受文字之美</p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] px-4 py-3">
          <p className="text-xs text-[var(--muted-foreground)]">诗词总数</p>
          <p className="mt-1 text-2xl font-bold text-[var(--foreground)]">{total}</p>
        </div>
        <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] px-4 py-3">
          <p className="text-xs text-[var(--muted-foreground)]">平均掌握度</p>
          <p className="mt-1 text-2xl font-bold text-[#4285F4]">{avgMastery}</p>
        </div>
        <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] px-4 py-3">
          <p className="text-xs text-[var(--muted-foreground)]">完全掌握</p>
          <p className="mt-1 text-2xl font-bold text-[#34A853]">{fullyMastered}</p>
        </div>
      </div>

      <AddPoemForm />
      <PoemList poems={poems} />
    </div>
  );
}
