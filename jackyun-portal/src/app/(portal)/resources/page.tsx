import type { Metadata } from 'next';
import ResourceDirectory from '@/components/modules/resource-directory';

export const metadata: Metadata = {
  title: '学习网站收录 · JackYun Portal',
  description: 'IGCSE、A Level、IELTS、编程与学习工具资源导航。',
};

export default function ResourcesPage() {
  return <ResourceDirectory />;
}
