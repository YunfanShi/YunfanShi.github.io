export interface PoemRecord {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  content: string;
  mastery_level: number;
  best_time: number | null;
  completion_count: number;
  last_progress: number;
  created_at: string;
  updated_at: string;
}

export interface PoemSession {
  id: string;
  poem_id: string;
  time_seconds: number;
  retreats: number;
  study_mode_used: boolean;
  completed: boolean;
  created_at: string;
}
