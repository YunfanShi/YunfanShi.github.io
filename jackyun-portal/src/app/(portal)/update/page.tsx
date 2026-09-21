import type { Metadata } from 'next';
import UpdateShowcase from '@/components/modules/update-showcase';

export const metadata: Metadata = {
  title: '更新记录 · JackYun Portal',
  description: '查看 JackYun Portal 的最新版本、功能改进与完整更新记录。',
};

export default function UpdatePage() {
  return <UpdateShowcase />;
}
