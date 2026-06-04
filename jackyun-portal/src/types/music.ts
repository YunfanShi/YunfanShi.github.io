export interface MusicSong {
  id: string;
  user_id: string;
  netease_id: string;
  name: string;
  sort_order: number;
}

export interface MusicSettings {
  manual_offset: number;
  interval_ms: number; // 10000/20000/30000/60000
  play_mode: 'sequence' | 'loop_one' | 'random';
}
