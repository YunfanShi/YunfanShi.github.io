export interface CountdownEvent {
  id: string;
  user_id: string;
  title: string;
  target_date: string;
  description: string | null;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface TimeLeft {
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
}
