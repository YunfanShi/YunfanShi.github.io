import SleepOptimizer from '@/components/modules/sleep/sleep-optimizer';

export const metadata = {
  title: 'Sleep Optimizer 睡眠逆推 · JackYun Portal',
  description: '根据起床时间和入睡耗时，反推今晚适合上床的时间。',
};

export default function SleepPage() {
  return <SleepOptimizer />;
}

