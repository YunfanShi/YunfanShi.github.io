// Quiz type definitions

export type QuestionType = 'multiple_choice' | 'fill_blank' | 'essay' | 'true_false' | 'matching';

export interface QuestionOption {
  label: string; // A, B, C, D
  text: string;
}

export interface AnalyzedQuestion {
  type: QuestionType;
  questionText: string;
  options: QuestionOption[] | null;
  correctAnswer: string;
  explanation: string;
  id?: string; // assigned after saving
  /** Whether this question needs on-demand AI grading (essay/fill-blank) */
  needsGrading?: boolean;
}

export interface QuizSession {
  id: string;
  user_id: string;
  subject_id: string | null;
  subject_name: string;
  started_at: string;
  completed_at: string | null;
  total_questions: number;
  correct_count: number;
  accuracy: number;
  duration_seconds: number;
}

export interface QuizQuestion {
  id: string;
  session_id: string;
  question_text: string;
  question_type: QuestionType;
  options: QuestionOption[] | null;
  correct_answer: string;
  user_answer: string | null;
  is_correct: boolean | null;
  explanation: string | null;
  answered_at: string | null;
  order_index: number;
}

export interface QuizSubject {
  id: string;
  user_id: string;
  name: string;
  category: string;
  is_custom: boolean;
  created_at: string;
}

export interface QuizSettings {
  show_answer_immediately: boolean;
  auto_submit_on_enter: boolean;
  default_subject_id: string | null;
  selected_subjects: string[];
}

export interface QuizSessionWithQuestions extends QuizSession {
  questions: QuizQuestion[];
}

// Predefined subjects by category
export const SUBJECT_CATEGORIES: Record<string, string[]> = {
  igcse: [
    'IGCSE Mathematics (0580)',
    'IGCSE Mathematics Additional (0606)',
    'IGCSE Physics (0625)',
    'IGCSE Chemistry (0620)',
    'IGCSE Biology (0610)',
    'IGCSE English (0500)',
    'IGCSE English Literature (0475)',
    'IGCSE Computer Science (0478)',
    'IGCSE ICT (0417)',
    'IGCSE Economics (0455)',
    'IGCSE Business Studies (0450)',
    'IGCSE History (0470)',
    'IGCSE Geography (0460)',
    'IGCSE Chinese (0547)',
    'IGCSE French (0520)',
    'IGCSE Spanish (0530)',
  ],
  alevel: [
    'A-Level Mathematics (9709)',
    'A-Level Further Mathematics (9231)',
    'A-Level Physics (9702)',
    'A-Level Chemistry (9701)',
    'A-Level Biology (9700)',
    'A-Level Economics (9708)',
    'A-Level Business (9609)',
    'A-Level Computer Science (9618)',
    'A-Level Psychology (9990)',
    'A-Level Sociology (9699)',
    'A-Level History (9489)',
    'A-Level Geography (9696)',
    'A-Level English (9093)',
  ],
  ap: [
    'AP Calculus AB',
    'AP Calculus BC',
    'AP Statistics',
    'AP Physics 1',
    'AP Physics 2',
    'AP Physics C: Mechanics',
    'AP Physics C: E&M',
    'AP Chemistry',
    'AP Biology',
    'AP Computer Science A',
    'AP Computer Science Principles',
    'AP English Language',
    'AP English Literature',
    'AP US History',
    'AP World History',
    'AP Psychology',
    'AP Economics (Micro)',
    'AP Economics (Macro)',
  ],
  ib: [
    'IB Mathematics AA SL',
    'IB Mathematics AA HL',
    'IB Mathematics AI SL',
    'IB Mathematics AI HL',
    'IB Physics SL',
    'IB Physics HL',
    'IB Chemistry SL',
    'IB Chemistry HL',
    'IB Biology SL',
    'IB Biology HL',
    'IB Economics SL',
    'IB Economics HL',
    'IB Business Management',
    'IB Computer Science',
    'IB English A Literature',
    'IB English A Language & Literature',
  ],
};