import { getAllWords, getTodayStats, getVocabSettings } from '@/actions/vocab';
import VocabApp from '@/components/modules/vocab/vocab-app';
import type { VocabDayStats, VocabSettings } from '@/types/vocab';

export default async function VocabPage() {
  const today = new Date().toISOString().slice(0, 10);
  const defaultStats: VocabDayStats = { today_time: 0, today_learned: 0, today_reviewed: 0, date: today };
  const defaultSettings: VocabSettings = { tts: true, rate: 1.0, theme: 'light' };

  const [words, stats, settings] = await Promise.all([
    getAllWords().catch(() => []),
    getTodayStats().catch(() => defaultStats),
    getVocabSettings().catch(() => defaultSettings),
  ]);

  return (
    // Escape the portal main's p-6 padding so VocabApp fills the viewport area
    <div style={{ margin: '-24px', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <VocabApp initialWords={words} initialStats={stats} initialSettings={settings} />
    </div>
  );
}
