import type { Metadata } from 'next';
import DefinitionCardsApp from '@/components/modules/definition-cards/definition-cards-app';

export const metadata: Metadata = {
  title: '定义卡片 · JackYun',
  description: '用主动回忆和间隔复习背定义，支持标准格式与 AI 导入。',
};

export default function DefinitionsPage() {
  return <DefinitionCardsApp />;
}
