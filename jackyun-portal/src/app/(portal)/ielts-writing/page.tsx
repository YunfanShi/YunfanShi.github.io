import type { Metadata } from 'next';
import WritingWorkbench from '@/components/modules/ielts/writing-workbench';

export const metadata: Metadata = {
  title: 'IELTS Writing Lab · JackYun',
  description: 'Diagnose, self-revise, upgrade, and transfer IELTS Writing skills with the Correction → Transfer method.',
};

export default function IeltsWritingPage() {
  return <WritingWorkbench />;
}
