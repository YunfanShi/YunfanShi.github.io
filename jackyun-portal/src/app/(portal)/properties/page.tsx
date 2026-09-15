import type { Metadata } from 'next';
import PropertyDecksApp from '@/components/modules/property-decks/property-decks-app';

export const metadata: Metadata = {
  title: '对比记忆 · Memory · JackYun',
  description: '用两关学习和横行选择记住不同对象的性质。',
};

export default function PropertiesPage() {
  return <PropertyDecksApp />;
}
