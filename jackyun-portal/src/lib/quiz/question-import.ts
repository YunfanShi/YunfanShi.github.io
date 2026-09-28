import { parseAiJson } from '../ai-json.ts';
import type { AnalyzedQuestion, QuestionType } from '../../types/quiz.ts';

const QUESTION_TYPES = new Set<QuestionType>([
  'multiple_choice', 'multi_select', 'fill_blank', 'numeric', 'short_answer',
  'essay', 'true_false', 'matching', 'ordering',
]);

/** Validate AI output and manually imported JSON through the same path. */
export function parseQuizQuestions(source: string): AnalyzedQuestion[] {
  const parsed = parseAiJson(source);
  const items = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? (parsed as { questions?: unknown }).questions : null;
  if (!Array.isArray(items) || items.length === 0) throw new Error('JSON 必须包含非空的 questions 数组。');
  return items.map((item, index) => {
    const number = index + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`第 ${number} 题不是题目对象。`);
    const question = item as Record<string, unknown>;
    if (typeof question.type !== 'string' || !QUESTION_TYPES.has(question.type as QuestionType)) throw new Error(`第 ${number} 题的 type 不受支持。`);
    if (typeof question.questionText !== 'string' || !question.questionText.trim()) throw new Error(`第 ${number} 题缺少 questionText。`);
    if (typeof question.correctAnswer !== 'string' || !question.correctAnswer.trim()) throw new Error(`第 ${number} 题缺少 correctAnswer。`);
    if (question.explanation != null && typeof question.explanation !== 'string') throw new Error(`第 ${number} 题的 explanation 必须是文字。`);
    let options: AnalyzedQuestion['options'] = null;
    if (question.options != null) {
      if (!Array.isArray(question.options) || !question.options.every((option) => option && typeof option === 'object' && typeof option.label === 'string' && option.label.trim() && typeof option.text === 'string' && option.text.trim())) throw new Error(`第 ${number} 题的 options 格式不正确。`);
      options = question.options.map((option) => ({ label: option.label.trim(), text: option.text.trim() }));
    }
    if (['multiple_choice', 'multi_select', 'matching', 'ordering'].includes(question.type) && (!options || options.length < 2)) throw new Error(`第 ${number} 题需要至少两个选项。`);
    return {
      type: question.type as QuestionType,
      questionText: question.questionText.trim(),
      options,
      correctAnswer: question.correctAnswer.trim(),
      explanation: typeof question.explanation === 'string' ? question.explanation.trim() : '',
      needsGrading: question.type === 'essay' || question.type === 'fill_blank',
    };
  });
}
