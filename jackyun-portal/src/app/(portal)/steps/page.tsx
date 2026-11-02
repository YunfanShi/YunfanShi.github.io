import type { Metadata } from 'next';
import StepwiseRecallApp from '@/components/modules/stepwise-recall/stepwise-recall-app';

export const metadata: Metadata = {
  title: '步骤背诵 · JackYun',
  description: '把多个定义要点、操作步骤与课文内容按顺序拆分，并逐条遮挡背诵。',
};

export default function StepsPage() {
  return <StepwiseRecallApp />;
}
