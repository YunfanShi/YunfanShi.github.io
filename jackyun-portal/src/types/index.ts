export interface Profile {
  id: string;
  github_username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface VocabWord {
  id: string;
  user_id: string;
  word: string;
  meaning: string;
  category: string | null;
  mastered: boolean;
  review_count: number;
  created_at: string;
  updated_at: string;
}

export interface StudyPlan {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyTask {
  id: string;
  user_id: string;
  plan_id: string | null;
  title: string;
  completed: boolean;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Poem {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  content: string;
  mastery_level: number;
  created_at: string;
  updated_at: string;
}

export interface Playlist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Track {
  id: string;
  user_id: string;
  playlist_id: string | null;
  title: string;
  artist: string | null;
  url: string;
  duration_seconds: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Countdown {
  id: string;
  user_id: string;
  title: string;
  target_date: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
}
