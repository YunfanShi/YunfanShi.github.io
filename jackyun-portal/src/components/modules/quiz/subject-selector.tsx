'use client';

import { useState } from 'react';
import { AnalyzedQuestion, SUBJECT_CATEGORIES } from '@/types/quiz';
import { getSelectedSubject, saveSelectedSubject } from '@/lib/quiz/storage';

interface SubjectSelectorProps {
  questions: AnalyzedQuestion[];
  onStart: (subject: string) => void;
  onCancel: () => void;
}

export default function SubjectSelector({ questions, onStart, onCancel }: SubjectSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>(() => getSelectedSubject() || '');
  const [customSubject, setCustomSubject] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  const questionTypes = questions.reduce((acc, q) => {
    acc[q.type] = (acc[q.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleStart = () => {
    const subject = isCustom ? customSubject.trim() : selectedSubject;
    if (!subject) return;
    saveSelectedSubject(subject);
    onStart(subject);
  };

  const categoryIcons: Record<string, string> = {
    igcse: 'school',
    alevel: 'emoji_events',
    ap: 'rocket_launch',
    ib: 'globe',
  };

  const categoryColors: Record<string, string> = {
    igcse: '#4285F4',
    alevel: '#34A853',
    ap: '#EA4335',
    ib: '#FBBC04',
  };

  return (
    <div className="animate-fade-in space-y-4">
      {/* Questions Preview */}
      <div className="p-4 rounded-2xl border-2 border-[#4285F4] bg-[#4285F4]/5">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-icons-round text-[#4285F4]">check_circle</span>
          <span className="text-sm font-semibold text-[#4285F4]">{questions.length} Question{questions.length > 1 ? 's' : ''} Analyzed</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(questionTypes).map(([type, count]) => (
            <span key={type} className="px-2 py-0.5 rounded-full bg-white text-xs font-medium text-[var(--foreground)] border border-[var(--card-border)]">
              {count}× {type.replace('_', ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* Category Selection */}
      <div>
        <p className="text-sm font-medium text-[var(--foreground)] mb-2">Select Subject Category</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(categoryIcons).map(([key, icon]) => (
            <button
              key={key}
              onClick={() => {
                setSelectedCategory(key);
                setSelectedSubject('');
                setIsCustom(false);
              }}
              className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                selectedCategory === key
                  ? 'text-white shadow-md'
                  : 'border-[var(--card-border)] text-[var(--foreground)] hover:border-[var(--card-border)]/60'
              }`}
              style={selectedCategory === key
                ? { backgroundColor: categoryColors[key], borderColor: categoryColors[key] }
                : {}
              }
            >
              <span className="material-icons-round text-base">{icon}</span>
              {key.toUpperCase()}
            </button>
          ))}
          <button
            onClick={() => { setIsCustom(true); setSelectedCategory(''); setSelectedSubject(''); }}
            className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
              isCustom
                ? 'border-[#6366F1] bg-[#6366F1] text-white shadow-md'
                : 'border-[var(--card-border)] text-[var(--foreground)] hover:border-[var(--card-border)]/60'
            }`}
          >
            <span className="material-icons-round text-base">edit</span>
            Custom
          </button>
        </div>
      </div>

      {/* Subject List */}
      {selectedCategory && !isCustom && (
        <div className="animate-fade-in">
          <p className="text-sm font-medium text-[var(--foreground)] mb-2">Select Subject</p>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {SUBJECT_CATEGORIES[selectedCategory]?.map(subject => (
              <button
                key={subject}
                onClick={() => setSelectedSubject(subject)}
                className={`w-full flex items-center gap-2 p-2.5 rounded-lg text-left text-sm transition-all ${
                  selectedSubject === subject
                    ? 'bg-[#4285F4]/10 text-[#4285F4] font-medium border border-[#4285F4]/20'
                    : 'text-[var(--foreground)] hover:bg-[var(--background)] border border-transparent'
                }`}
              >
                <span className="material-icons-round text-sm shrink-0">
                  {selectedSubject === subject ? 'radio_button_checked' : 'radio_button_unchecked'}
                </span>
                <span className="truncate">{subject}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom Subject */}
      {isCustom && (
        <div className="animate-fade-in">
          <p className="text-sm font-medium text-[var(--foreground)] mb-2">Enter Subject Name</p>
          <input
            type="text"
            value={customSubject}
            onChange={(e) => setCustomSubject(e.target.value)}
            placeholder="e.g., Chemistry Paper 4, Math Mock Exam..."
            className="w-full rounded-xl border-2 border-[var(--card-border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#6366F1] focus:ring-4 focus:ring-[#6366F1]/10 transition-all"
            autoFocus
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl border-2 border-[var(--card-border)] text-[var(--foreground)] font-medium text-sm hover:bg-[var(--background)] active:scale-[0.98] transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleStart}
          disabled={!isCustom && !selectedSubject || isCustom && !customSubject.trim()}
          className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#4285F4] to-[#34A853] text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-md hover:shadow-lg"
        >
          Start Quiz
        </button>
      </div>
    </div>
  );
}