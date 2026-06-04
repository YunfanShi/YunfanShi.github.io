'use client';

import { useState } from 'react';
import { QuizSettings } from '@/types/quiz';
import { SUBJECT_CATEGORIES } from '@/types/quiz';

interface QuizSettingsPanelProps {
  settings: QuizSettings;
  onChange: (settings: QuizSettings) => void;
  onClose: () => void;
}

export default function QuizSettingsPanel({ settings, onChange, onClose }: QuizSettingsPanelProps) {
  const [showAnswerImmediately, setShowAnswerImmediately] = useState(settings.show_answer_immediately);
  const [autoSubmit, setAutoSubmit] = useState(settings.auto_submit_on_enter);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const handleSave = () => {
    onChange({
      ...settings,
      show_answer_immediately: showAnswerImmediately,
      auto_submit_on_enter: autoSubmit,
    });
    onClose();
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const categoryLabels: Record<string, string> = {
    igcse: 'IGCSE',
    alevel: 'A-Level',
    ap: 'AP',
    ib: 'IB',
  };

  const categoryIcons: Record<string, string> = {
    igcse: 'school',
    alevel: 'emoji_events',
    ap: 'rocket_launch',
    ib: 'globe',
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
          <span className="material-icons-round text-[#4285F4]">settings</span>
          Quiz Settings
        </h2>
      </div>

      {/* Answer Settings */}
      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          Answer Display
        </p>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--foreground)]">Show answer immediately</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Show correct/incorrect after each question
            </p>
          </div>
          <button
            onClick={() => setShowAnswerImmediately(!showAnswerImmediately)}
            className={`relative w-12 h-7 rounded-full transition-all duration-300 ${
              showAnswerImmediately ? 'bg-[#4285F4]' : 'bg-[var(--card-border)]'
            }`}
          >
            <span
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 ${
                showAnswerImmediately ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[var(--card-border)]">
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--foreground)]">Auto-submit on Enter</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Press Enter to submit fill-in-the-blank and essay answers
            </p>
          </div>
          <button
            onClick={() => setAutoSubmit(!autoSubmit)}
            className={`relative w-12 h-7 rounded-full transition-all duration-300 ${
              autoSubmit ? 'bg-[#4285F4]' : 'bg-[var(--card-border)]'
            }`}
          >
            <span
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 ${
                autoSubmit ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Subject Categories */}
      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          Preferred Subject Categories
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Select your preferred categories. These will appear as defaults when starting a new quiz.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {Object.entries(categoryLabels).map(([key, label]) => (
            <button
              key={key}
              onClick={() => toggleCategory(key)}
              className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                selectedCategories.includes(key)
                  ? 'border-[#4285F4] bg-[#4285F4]/5 text-[#4285F4]'
                  : 'border-[var(--card-border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:border-[#4285F4]/30'
              }`}
            >
              <span className="material-icons-round text-base">{categoryIcons[key]}</span>
              {label}
              {selectedCategories.includes(key) && (
                <span className="material-icons-round text-xs ml-auto">check</span>
              )}
            </button>
          ))}
        </div>

        {/* Subject count */}
        <p className="text-xs text-[var(--muted-foreground)]">
          {Object.values(SUBJECT_CATEGORIES).flat().length} total subjects available across all categories
        </p>
      </div>

      {/* About */}
      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          About QuizWise
        </p>
        <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
          QuizWise uses AI to analyze your questions, generates interactive quiz components, and grades your answers automatically.
          All quiz data is saved locally and synced to your cloud account.
        </p>
        <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <span className="material-icons-round text-xs">auto_awesome</span>
          Powered by your configured AI provider
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        className="w-full py-3 rounded-xl bg-[#4285F4] text-white font-medium text-sm hover:bg-[#3367d6] active:scale-[0.98] transition-all shadow-md"
      >
        Save Settings
      </button>
    </div>
  );
}