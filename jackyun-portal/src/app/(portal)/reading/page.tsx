import type { Metadata } from 'next';
import ReadingWorkbench from '@/components/modules/ielts/reading-workbench';

export const metadata: Metadata = {
  title: 'Reading · JackYun',
  description: 'Read Chinese and English books, create level-controlled English articles, look up words in context, and keep precise reading progress.',
};

export default function ReadingPage() {
  return <ReadingWorkbench />;
}
