import type { Metadata } from 'next';
import PropertyDecksApp from '@/components/modules/property-decks/property-decks-app';

export const metadata: Metadata = {
  title: '性质对比 · Memory · JackYun',
  description: '用对比表格逐项翻页背诵不同对象的性质。',
};

export default function PropertiesPage() {
  return <PropertyDecksApp />;
}
