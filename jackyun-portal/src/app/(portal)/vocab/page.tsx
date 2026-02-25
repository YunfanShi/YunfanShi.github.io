import { createClient } from '@/lib/supabase/server';
import VocabStats from '@/components/modules/vocab/vocab-stats';
import AddWordForm from '@/components/modules/vocab/add-word-form';
import WordList from '@/components/modules/vocab/word-list';

interface VocabWord {
  id: string;
  word: string;
  meaning: string;
  category: string | null;
  mastered: boolean;
  review_count: number;
  created_at: string;
}

export default async function VocabPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('vocab_words')
    .select('id, word, meaning, category, mastered, review_count, created_at')
    .order('created_at', { ascending: false });

  const words: VocabWord[] = data ?? [];

  const total = words.length;
  const mastered = words.filter((w) => w.mastered).length;
  const categories: Record<string, number> = {};
  for (const w of words) {
    if (w.category) categories[w.category] = (categories[w.category] ?? 0) + 1;
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">词汇宝库</h1>
        <p className="mt-1 text-[var(--muted-foreground)]">积累词汇，记录成长，掌握语言的力量</p>
      </div>

      <VocabStats total={total} mastered={mastered} categories={categories} />
      <AddWordForm />
      <WordList words={words} />
    </div>
  );
}
