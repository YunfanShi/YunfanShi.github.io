import { getSongs, getMusicSettings } from '@/actions/music';
import MusicPlayerApp from '@/components/modules/music/music-player-app';

export default async function MusicPage() {
  const [songs, settings] = await Promise.all([getSongs(), getMusicSettings()]);

  return <MusicPlayerApp initialSongs={songs} initialSettings={settings} />;
}
