'use client';

import { useState, useTransition } from 'react';
import { addTrack, createPlaylist } from '@/actions/music';

interface Playlist {
  id: string;
  name: string;
}

interface Props {
  playlists: Playlist[];
  selectedPlaylistId?: string;
}

const inputCls =
  'w-full rounded-[8px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors';

export default function AddTrackForm({ playlists, selectedPlaylistId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Track form
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [url, setUrl] = useState('');
  const [playlistId, setPlaylistId] = useState(selectedPlaylistId ?? playlists[0]?.id ?? '');

  // Playlist creation
  const [playlistName, setPlaylistName] = useState('');
  const [playlistDesc, setPlaylistDesc] = useState('');

  function handleAddTrack(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!playlistId) {
      setError('Please select or create a playlist first');
      return;
    }
    startTransition(async () => {
      try {
        await addTrack(playlistId, title, artist, url);
        setSuccess('Track added!');
        setTitle('');
        setArtist('');
        setUrl('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add track');
      }
    });
  }

  function handleCreatePlaylist(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await createPlaylist(playlistName, playlistDesc);
        setSuccess(`Playlist "${playlistName}" created!`);
        setPlaylistName('');
        setPlaylistDesc('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create playlist');
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Add Track */}
      <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <span className="material-icons-round text-base text-[#4285F4]">music_note</span>
          Add Track
        </h3>

        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-[8px] bg-[#EA433515] px-3 py-2 text-sm text-[#EA4335]">
            <span className="material-icons-round text-base">error_outline</span>
            {error}
          </div>
        )}
        {success && (
          <div className="mb-3 flex items-center gap-2 rounded-[8px] bg-[#34A85315] px-3 py-2 text-sm text-[#34A853]">
            <span className="material-icons-round text-base">check_circle_outline</span>
            {success}
          </div>
        )}

        <form onSubmit={handleAddTrack} className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Track title (required)"
            required
            className={inputCls}
          />
          <input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Artist"
            className={inputCls}
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Audio URL (required)"
            required
            className={inputCls}
          />
          <select
            value={playlistId}
            onChange={(e) => setPlaylistId(e.target.value)}
            className={inputCls}
            required
          >
            <option value="" disabled>
              Select playlist…
            </option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isPending || !title.trim() || !url.trim() || !playlistId}
            className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#4285F4] py-2 text-sm font-medium text-white hover:bg-[#3574e0] disabled:opacity-50 transition-colors"
          >
            <span className="material-icons-round text-base">add</span>
            {isPending ? 'Adding…' : 'Add Track'}
          </button>
        </form>
      </div>

      {/* Create Playlist */}
      <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <span className="material-icons-round text-base text-[#34A853]">queue_music</span>
          Create Playlist
        </h3>

        <form onSubmit={handleCreatePlaylist} className="space-y-3">
          <input
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder="Playlist name (required)"
            required
            className={inputCls}
          />
          <input
            type="text"
            value={playlistDesc}
            onChange={(e) => setPlaylistDesc(e.target.value)}
            placeholder="Description (optional)"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={isPending || !playlistName.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#34A853] py-2 text-sm font-medium text-white hover:bg-[#2d9147] disabled:opacity-50 transition-colors"
          >
            <span className="material-icons-round text-base">create_new_folder</span>
            {isPending ? 'Creating…' : 'Create Playlist'}
          </button>
        </form>
      </div>
    </div>
  );
}
