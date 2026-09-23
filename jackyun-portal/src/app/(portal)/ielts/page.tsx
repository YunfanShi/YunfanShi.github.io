import type { Metadata } from 'next';
import IeltsDashboard from '@/components/modules/ielts/ielts-dashboard';

export const metadata: Metadata = {
  title: 'IELTS 备考 · JackYun',
  description: '设置雅思目标，记录四科练习证据，并根据进度选择下一步训练。',
};

export default function IeltsPage() {
  return <IeltsDashboard />;
}
