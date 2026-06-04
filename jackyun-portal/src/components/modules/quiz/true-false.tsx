'use client';

interface TrueFalseProps {
  selectedAnswer: string;
  onSelect: (answer: string) => void;
  disabled: boolean;
  isCorrect: boolean;
  correctAnswer: string;
  showResult: boolean;
}

export default function TrueFalse({
  selectedAnswer,
  onSelect,
  disabled,
  isCorrect,
  correctAnswer,
  showResult,
}: TrueFalseProps) {
  const options = ['True', 'False'];

  const getButtonStyle = (value: string) => {
    const isSelected = selectedAnswer.toLowerCase() === value.toLowerCase();
    const isCorrectAnswer = correctAnswer.toLowerCase().includes(value.toLowerCase());

    if (!showResult || !disabled) {
      if (isSelected) {
        return 'bg-[#4285F4] text-white border-[#4285F4] shadow-md';
      }
      return 'bg-[var(--background)] text-[var(--foreground)] border-[var(--card-border)] hover:border-[#4285F4] hover:bg-[#4285F4]/5';
    }

    // After result
    if (isCorrectAnswer) {
      return 'bg-[#34A853]/10 text-[#34A853] border-[#34A853] font-semibold';
    }
    if (isSelected && !isCorrect) {
      return 'bg-[#EA4335]/10 text-[#EA4335] border-[#EA4335]';
    }
    return 'bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--card-border)] opacity-60';
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((opt) => {
        const isSelected = selectedAnswer.toLowerCase() === opt.toLowerCase();
        const isCorrectAnswer = correctAnswer.toLowerCase().includes(opt.toLowerCase());

        return (
          <button
            key={opt}
            onClick={() => !disabled && onSelect(opt)}
            disabled={disabled}
            className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 text-sm font-medium transition-all duration-200 ${
              getButtonStyle(opt)
            } ${disabled ? 'cursor-default' : 'cursor-pointer active:scale-[0.97]'}`}
          >
            <span className={`material-icons-round text-lg ${
              isCorrectAnswer && showResult ? '' : isSelected && !showResult ? '' : ''
            }`}>
              {opt === 'True' ? 'thumb_up' : 'thumb_down'}
            </span>
            {opt}
            {showResult && isCorrectAnswer && (
              <span className="material-icons-round text-[#34A853] text-sm">check_circle</span>
            )}
            {showResult && isSelected && !isCorrect && (
              <span className="material-icons-round text-[#EA4335] text-sm">cancel</span>
            )}
          </button>
        );
      })}
    </div>
  );
}