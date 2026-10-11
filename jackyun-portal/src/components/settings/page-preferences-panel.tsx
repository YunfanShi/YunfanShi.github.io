'use client';

import { useState } from 'react';
import { NAVIGATION_ITEMS } from '@/lib/navigation';
import { t } from '@/lib/i18n';
import { sanitizePagePreferences, PAGE_PROFILES } from '@/lib/page-preferences';
import CloudPreferencesPanel from './cloud-preferences-panel';

export default function PagePreferencesPanel({ initialValue, learning = {}, companion = {} }: { initialValue: Record<string, unknown>; learning?: Record<string, unknown>; companion?: Record<string, unknown> }) {
  const [page, setPage] = useState('dashboard');
  return <div className="space-y-4">
    <label className="block text-sm font-semibold">选择页面<select aria-label="选择页面" value={page} onChange={event => setPage(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3">{PAGE_PROFILES.map(item => <option key={item.id} value={item.id}>{item.label || t(NAVIGATION_ITEMS.find(nav => nav.id === item.id)!.labelKey, 'zh')}</option>)}</select></label>
    <CloudPreferencesPanel key={page} sectionKey="page_preferences" initialValue={sanitizePagePreferences(initialValue)} fields={[
      { key: `${page}:size`, label: '阅读字号', description: '只调整这个页面的文字；表单仍保持适合触摸的字号。', type: 'select', options: [{ value: 'normal', label: '标准' }, { value: 'large', label: '大字' }] },
      { key: `${page}:width`, label: '内容宽度', description: '宽屏可选择居中的阅读布局，手机自动适应屏幕。', type: 'select', options: [{ value: 'full', label: '完整工作区' }, { value: 'reading', label: '居中阅读' }] },
      { key: `${page}:spacing`, label: '页面间距', description: '独立控制这个页面的空间密度。', type: 'select', options: [{ value: 'comfortable', label: '舒适' }, { value: 'compact', label: '紧凑' }] },
      { key: `${page}:motion`, label: '页面动态效果', description: '减少转场与装饰动画；全局减少动态设置仍优先。', type: 'boolean' },
      { key: 'intentPrefetch', label: '按需预加载导航', description: '指向或聚焦菜单时提前准备页面。节省流量模式与慢速网络下自动关闭。', type: 'boolean' },
    ]} />
    {page === 'dashboard' && <section className="border-t border-[var(--card-border)] pt-4"><h3 className="font-semibold">首页学习目标</h3><CloudPreferencesPanel sectionKey="companion_preferences" initialValue={{ goalMinutes: 120, ...companion }} fields={[{ key: 'goalMinutes', label: '每日目标分钟数', description: '首页与 Companion 共用的账号目标；联网保存后更新统计。', type: 'number', min: 10, max: 1440 }]} /></section>}
    {page === 'schedule' && <section className="border-t border-[var(--card-border)] pt-4"><h3 className="font-semibold">日程与 CUE 学习</h3><CloudPreferencesPanel sectionKey="learning_preferences" initialValue={{ cueShuffle: true, cueGameEnabled: false, ...learning }} fields={[
      { key: 'cueShuffle', label: '新学习默认乱序', description: '只影响新开始的 CUE 学习，已保存的进度保留原顺序。', type: 'boolean' },
      { key: 'cueGameEnabled', label: '桌面宇宙与星空收藏', description: '桌面学习使用星空反馈；手机商店独立可用，不播放宇宙动画。', type: 'boolean' },
    ]} /></section>}
    {['quizwise', 'review'].includes(page) && <section className="border-t border-[var(--card-border)] pt-4"><h3 className="font-semibold">答题与 AI 反馈</h3><CloudPreferencesPanel sectionKey="learning_preferences" initialValue={{ quizAnswerLanguage: 'zh_kw_en', quizFeedbackLevel: 'normal', ...learning }} fields={[
      { key: 'quizAnswerLanguage', label: '讲解语言', description: '答题和复习共用的 AI 讲解偏好。', type: 'select', options: [{ value: 'zh_kw_en', label: '中文 / 英文关键词' }, { value: 'zh', label: '中文' }, { value: 'en', label: 'English' }, { value: 'bilingual', label: '中英双语' }] },
      { key: 'quizFeedbackLevel', label: '讲解详细程度', description: '控制新生成的答题讲解。', type: 'select', options: [{ value: 'brief', label: '简洁' }, { value: 'normal', label: '标准' }, { value: 'detailed', label: '详细' }] },
    ]} /></section>}
  </div>;
}
