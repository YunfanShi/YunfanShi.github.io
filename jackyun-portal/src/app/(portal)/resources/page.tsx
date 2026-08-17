import type { Metadata } from 'next';
import ResourceDirectory from '@/components/modules/resource-directory';

export const metadata: Metadata = {
  title: '学习网站收录 · JackYun Portal',
  description: 'IGCSE、A Level、IELTS、AI、数学科学、公开课程、编程与研究工具资源导航。',
};

export default function ResourcesPage() {
  return <ResourceDirectory />;
}
