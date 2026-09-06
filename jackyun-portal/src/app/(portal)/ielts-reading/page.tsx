import type { Metadata } from 'next';
import ReadingWorkbench from '@/components/modules/ielts/reading-workbench';

export const metadata: Metadata = {
  title: 'IELTS Reading Studio · JackYun',
  description: 'Generate level-controlled English reading, build a personal shelf, look up words in context, and track comprehension.',
};

export default function IeltsReadingPage() {
  return <ReadingWorkbench />;
}
