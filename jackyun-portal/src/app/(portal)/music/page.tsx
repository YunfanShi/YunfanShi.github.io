import { createClient } from '@/lib/supabase/server';
import AddTrackForm from '@/components/modules/music/add-track-form';
import PlaylistPanel from '@/components/modules/music/playlist-panel';
import CollapsibleSection from '@/components/modules/music/collapsible-section';

interface Track {
  id: string;
  title: string;
  artist: string | null;
  url: string;
  sort_order: number;
}

interface Playlist {
  id: string;
  name: string;
  description: string | null;
  tracks: Track[];
}

export default async function MusicPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('playlists')
    .select('id, name, description, tracks(id, title, artist, url, sort_order)')
    .order('created_at', { ascending: true });

  const playlists: Playlist[] = (data ?? []).map((p) => ({
    ...p,
    tracks: ((p.tracks as Track[] | null) ?? []).sort(
      (a, b) => a.sort_order - b.sort_order,
    ),
  }));

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Music</h1>
        <p className="mt-1 text-[var(--muted-foreground)]">
          Your personal playlists and tracks
        </p>
      </div>

      {/* Add track / create playlist (collapsible) */}
      <CollapsibleSection label="Add Track / Create Playlist">
        <AddTrackForm playlists={playlists} />
      </CollapsibleSection>

      {/* Playlists + player */}
      <div className="mt-6">
        <PlaylistPanel playlists={playlists} />
      </div>
    </div>
  );
}
