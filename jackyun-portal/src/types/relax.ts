export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export interface RelaxState {
  water_count: number;
  water_date: string | null;
  theme: 'default' | 'dragon' | 'eri';
}
