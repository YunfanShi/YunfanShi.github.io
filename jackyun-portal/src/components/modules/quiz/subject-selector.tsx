'use client';

import { useState } from 'react';
import { AnalyzedQuestion, SUBJECT_CATEGORIES } from '@/types/quiz';
import { getSelectedSubject, saveSelectedSubject } from '@/lib/quiz/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
            <Button
              type="button"
              variant={selectedCategory === key ? 'default' : 'outline'}
              key={key}
              aria-pressed={selectedCategory === key}
              onClick={() => {
                setSelectedCategory(key);
                setSelectedSubject('');
                setIsCustom(false);
              }}
              className="w-full justify-start p-3"
              style={selectedCategory === key
                ? { backgroundColor: categoryColors[key], borderColor: categoryColors[key] }
                : {}
              }
            >
              <span className="material-icons-round text-base">{icon}</span>
              {key.toUpperCase()}
            </Button>
          ))}
          <Button
            type="button"
            variant={isCustom ? 'default' : 'outline'}
            aria-pressed={isCustom}
            onClick={() => { setIsCustom(true); setSelectedCategory(''); setSelectedSubject(''); }}
            className="w-full justify-start p-3"
          >
            <span className="material-icons-round text-base">edit</span>
            Custom
          </Button>
        </div>
      </div>

      {/* Subject List */}
      {selectedCategory && !isCustom && (
        <div className="animate-fade-in">
          <p className="text-sm font-medium text-[var(--foreground)] mb-2">Select Subject</p>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {SUBJECT_CATEGORIES[selectedCategory]?.map(subject => (
              <Button
                type="button"
                variant={selectedSubject === subject ? 'default' : 'ghost'}
                key={subject}
                aria-pressed={selectedSubject === subject}
                onClick={() => setSelectedSubject(subject)}
                className="w-full justify-start text-left"
              >
                <span className="material-icons-round text-sm shrink-0">
                  {selectedSubject === subject ? 'radio_button_checked' : 'radio_button_unchecked'}
                </span>
                <span className="truncate">{subject}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Custom Subject */}
      {isCustom && (
        <div className="animate-fade-in">
          <p className="text-sm font-medium text-[var(--foreground)] mb-2">Enter Subject Name</p>
          <Input
            type="text"
            value={customSubject}
            onChange={(e) => setCustomSubject(e.target.value)}
            placeholder="e.g., Chemistry Paper 4, Math Mock Exam..."
            className="rounded-xl"
            autoFocus
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline"
          onClick={onCancel}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          onClick={handleStart}
          disabled={!isCustom && !selectedSubject || isCustom && !customSubject.trim()}
          className="flex-1 font-semibold shadow-md"
        >
          Start Quiz
        </Button>
      </div>
    </div>
  );
}
