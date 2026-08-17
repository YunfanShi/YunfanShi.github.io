'use client';

import { useEffect, useState } from 'react';
import { getSettingsSection, saveSettingsField } from '@/actions/settings';

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="material-icons-round text-[var(--muted-foreground)] text-lg">{icon}</span>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
        {title}
      </h2>
    </div>
  );
}

export default function QuizLanguageSection() {
  const [values, setValues] = useState({ quizUiLanguage: 'zh', quizAnswerLanguage: 'zh_kw_en', quizFeedbackLevel: 'normal' });
  useEffect(() => { void getSettingsSection('learning_preferences').then((cloud) => setValues((current) => ({ ...current, ...cloud }))); }, []);
  function update(key: keyof typeof values, value: string, localKey: string) { setValues((current) => ({ ...current, [key]: value })); localStorage.setItem(localKey, value); void saveSettingsField('learning_preferences', key, value); }
  return (
    <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
      <SectionHeader icon="translate" title="QuizWise 语言与回答偏好" />
      <p className="text-sm text-[var(--muted-foreground)] mb-4">
        自定义 AI 分析题目时的回答语言和格式偏好。
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
            UI 语言
          </label>
          <select
            value={values.quizUiLanguage}
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
            onChange={e => update('quizUiLanguage', e.target.value, 'quizwise_ui_lang')}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
            回答语言偏好
          </label>
          <select
            value={values.quizAnswerLanguage}
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
            onChange={e => update('quizAnswerLanguage', e.target.value, 'quizwise_answer_lang')}
          >
            <option value="zh_kw_en">中文回答 + 关键词英文（推荐）</option>
            <option value="zh">全中文</option>
            <option value="en">全英文（English）</option>
            <option value="en_kw_zh">English answer + Chinese keywords</option>
            <option value="bilingual">中英双语</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
            反馈详细程度
          </label>
          <select
            value={values.quizFeedbackLevel}
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
            onChange={e => update('quizFeedbackLevel', e.target.value, 'quizwise_feedback_level')}
          >
            <option value="brief">简洁（要点提示）</option>
            <option value="normal">标准（详细解释）</option>
            <option value="detailed">详细（含步骤推导）</option>
          </select>
        </div>
      </div>
    </section>
  );
}
