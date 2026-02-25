export interface VocabWordSRS {
  id: string;
  user_id: string;
  word: string;
  meaning: string;
  ex: string;
  cn: string;
  category: string | null;
  status: 'new' | 'learning' | 'review' | 'mastered';
  stage: number;
  next_review: number; // timestamp ms
  interval_minutes: number;
  learned_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface VocabDayStats {
  today_time: number;
  today_learned: number;
  today_reviewed: number;
  date: string;
}

export interface VocabSettings {
  tts: boolean;
  rate: number;
  theme: 'light' | 'dark';
}

export interface ImportWordData {
  word: string;
  meaning: string;
  ex?: string;
  cn?: string;
  category?: string;
}

export interface SessionWord extends VocabWordSRS {
  sessionStage: number;
}
