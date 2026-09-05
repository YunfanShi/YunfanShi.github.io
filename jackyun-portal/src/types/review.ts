import type { QuestionOption, QuestionType } from './quiz';

export type ReviewErrorType = 'concept' | 'calculation' | 'reading' | 'careless' | 'expression' | 'unknown';
export type ReviewStatus = 'active' | 'mastered' | 'archived';

export interface ReviewItem {
  id: string;
  user_id: string;
  quiz_question_id: string | null;
  subject: string;
  question_text: string;
  question_type: QuestionType;
  options: QuestionOption[] | null;
  correct_answer: string;
  last_user_answer: string | null;
  explanation: string | null;
  knowledge_point: string | null;
  error_type: ReviewErrorType;
  status: ReviewStatus;
  next_review_at: string;
  interval_days: number;
  ease_factor: number;
  streak: number;
  created_at: string;
  updated_at: string;
}
