export interface SyllabusUnit {
  name: string;
  steps: StepState[];
}

export interface StepState {
  label: string;
  done: boolean;
}

export interface SyllabusSubject {
  id: string;
  user_id: string;
  subject_name: string;
  color: string;
  units: SyllabusUnit[];
}

export interface StudyConfig {
  school_date: string | null;
  exam_date: string | null;
  emergency_subjects: string[];
  emergency_deadline: string | null;
  emergency_note: string | null;
}

export interface MockRecord {
  id: string;
  subject: string;
  paper: string | null;
  score: number | null;
  max_score: number | null;
  duration_minutes: number | null;
  notes: string | null;
  created_at: string;
}
