'use client';

import { useRef, useEffect } from 'react';

interface QuestionInputProps {
  inputText: string;
  setInputText: (text: string) => void;
  onAnalyze: (text: string) => void;
  isAnalyzing: boolean;
  error: string | null;
}

export default function QuestionInput({
  inputText,
  setInputText,
  onAnalyze,
  isAnalyzing,
  error,
}: QuestionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isAnalyzing) {
      textareaRef.current?.focus();
    }
  }, [isAnalyzing]);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 400) + 'px';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted && !inputText) {
      // Auto-analyze on paste if no existing text
      setTimeout(() => {
        if (pasted.trim().length > 10) {
          onAnalyze(pasted);
        }
      }, 300);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const text = textareaRef.current?.value?.trim();
      if (text) onAnalyze(text);
    }
  };

  const handleSubmit = () => {
    const text = inputText.trim();
    if (!text || isAnalyzing) return;
    onAnalyze(text);
  };

  return (
    <div className="animate-fade-in space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-[#4285F4]/5 border border-[#4285F4]/10">
        <span className="material-icons-round text-[#4285F4] text-xl mt-0.5">auto_awesome</span>
        <div className="text-sm text-[var(--muted-foreground)]">
          <p className="font-medium text-[var(--foreground)] mb-1">Paste your questions</p>
          <p>Paste one or more questions. AI will automatically detect the type, extract answer choices, and identify the correct answer.</p>
          <p className="mt-1">
            <strong>Supported:</strong> Multiple Choice, Fill-in-the-Blank, True/False, Essay Questions
          </p>
        </div>
      </div>

      {/* Textarea */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            autoResize();
          }}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={`Paste your questions here...\n\nExample:\n1. What is the capital of France?\nA) London\nB) Paris\nC) Berlin\nD) Madrid\n\n2. ...`}
          disabled={isAnalyzing}
          rows={8}
          className="w-full resize-none rounded-2xl border-2 border-[var(--card-border)] bg-[var(--card)] px-5 py-4 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] text-sm leading-relaxed outline-none focus:border-[#4285F4] focus:ring-4 focus:ring-[#4285F4]/10 disabled:opacity-60 transition-all"
        />
        {isAnalyzing && (
          <div className="absolute inset-0 rounded-2xl bg-[var(--card)]/80 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#4285F4] animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 rounded-full bg-[#4285F4] animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 rounded-full bg-[#4285F4] animate-bounce" />
              </div>
              <p className="text-sm text-[var(--muted-foreground)] font-medium">
                AI is analyzing your questions...
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={!inputText.trim() || isAnalyzing}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#4285F4] text-white font-medium text-sm hover:bg-[#3367d6] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-md hover:shadow-lg"
        >
          <span className="material-icons-round text-lg">psychology</span>
          Analyze Questions
        </button>
        <span className="text-xs text-[var(--muted-foreground)]">
          or press <kbd className="px-1.5 py-0.5 rounded bg-[var(--background)] border border-[var(--card-border)] font-mono text-[10px]">⌘ + ↵</kbd>
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[#EA4335]/10 border border-[#EA4335]/20 text-sm text-[#EA4335]">
          <span className="material-icons-round text-base mt-0.5">error_outline</span>
          <div>
            <p className="font-medium">Analysis failed</p>
            <p className="text-xs opacity-80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Quick Tips */}
      {!isAnalyzing && !error && (
        <div className="grid grid-cols-3 gap-3 pt-2">
          {[
            { icon: 'quiz', title: 'Multiple Choice', desc: 'Questions with A/B/C/D options' },
            { icon: 'edit_note', title: 'Fill in Blank', desc: 'Questions with missing words/phrases' },
            { icon: 'article', title: 'Essay Questions', desc: 'Open-ended answers graded by AI' },
          ].map((tip) => (
            <div key={tip.title} className="p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-center">
              <span className="material-icons-round text-[#4285F4] text-xl mb-1">{tip.icon}</span>
              <p className="text-xs font-medium text-[var(--foreground)]">{tip.title}</p>
              <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{tip.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}