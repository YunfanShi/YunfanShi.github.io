'use client';

import { useState, useTransition } from 'react';
import { deletePlaylist, deleteTrack } from '@/actions/music';
import Player, { type Track } from './player';

interface PlaylistWithTracks {
  id: string;
  name: string;
  description: string | null;
  tracks: Track[];
}

interface Props {
  playlists: PlaylistWithTracks[];
}

export default function PlaylistPanel({ playlists }: Props) {
  const [selectedId, setSelectedId] = useState<string>(playlists[0]?.id ?? '');
  const [isPending, startTransition] = useTransition();

  const selected = playlists.find((p) => p.id === selectedId) ?? null;

  function handleDeletePlaylist(id: string) {
    startTransition(async () => {
      await deletePlaylist(id);
      if (selectedId === id) {
        const remaining = playlists.filter((p) => p.id !== id);
        setSelectedId(remaining[0]?.id ?? '');
      }
    });
  }

  function handleDeleteTrack(id: string) {
    startTransition(async () => {
      await deleteTrack(id);
    });
  }

  if (!playlists.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] py-16 text-[var(--muted-foreground)]">
        <span className="material-icons-round text-5xl">library_music</span>
        <p className="text-sm">No playlists yet. Create one above to get started!</p>
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      {/* Left: playlist list */}
      <div className="w-56 shrink-0 rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] overflow-hidden self-start">
        <div className="border-b border-[var(--card-border)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Playlists
          </p>
        </div>
        {playlists.map((playlist) => (
          <div
            key={playlist.id}
            className={`group flex items-center gap-2 border-b border-[var(--card-border)] last:border-b-0 px-3 py-3 transition-colors cursor-pointer ${
              playlist.id === selectedId
                ? 'bg-[#4285F415]'
                : 'hover:bg-[var(--background)]'
            }`}
            onClick={() => setSelectedId(playlist.id)}
          >
            <span
              className={`material-icons-round text-base shrink-0 ${
                playlist.id === selectedId ? 'text-[#4285F4]' : 'text-[var(--muted-foreground)]'
              }`}
            >
              queue_music
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-sm font-medium ${
                  playlist.id === selectedId ? 'text-[#4285F4]' : 'text-[var(--foreground)]'
                }`}
              >
                {playlist.name}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {playlist.tracks.length} track{playlist.tracks.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeletePlaylist(playlist.id);
              }}
              disabled={isPending}
              className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--muted-foreground)] hover:text-[#EA4335] transition-all disabled:opacity-30"
              aria-label="Delete playlist"
            >
              <span className="material-icons-round text-base">delete_outline</span>
            </button>
          </div>
        ))}
      </div>

      {/* Right: player + track list with delete buttons */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="material-icons-round text-xl text-[#4285F4]">queue_music</span>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{selected.name}</h2>
              {selected.description && (
                <span className="text-sm text-[var(--muted-foreground)]">
                  — {selected.description}
                </span>
              )}
            </div>

            {selected.tracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] py-12 text-[var(--muted-foreground)]">
                <span className="material-icons-round text-4xl">music_off</span>
                <p className="text-sm">No tracks yet. Add some above!</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <Player tracks={selected.tracks} />

                {/* Track management rows */}
                <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
                  <div className="border-b border-[var(--card-border)] px-4 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                      Manage Tracks
                    </p>
                  </div>
                  {selected.tracks.map((track) => (
                    <div
                      key={track.id}
                      className="flex items-center gap-3 border-b border-[var(--card-border)] last:border-b-0 px-4 py-3"
                    >
                      <span className="material-icons-round text-base text-[var(--muted-foreground)]">
                        drag_indicator
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--foreground)]">
                          {track.title}
                        </p>
                        {track.artist && (
                          <p className="truncate text-xs text-[var(--muted-foreground)]">
                            {track.artist}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteTrack(track.id)}
                        disabled={isPending}
                        className="shrink-0 text-[var(--muted-foreground)] hover:text-[#EA4335] transition-colors disabled:opacity-30"
                        aria-label="Delete track"
                      >
                        <span className="material-icons-round text-base">delete_outline</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] py-16 text-[var(--muted-foreground)]">
            <span className="material-icons-round text-4xl">playlist_play</span>
            <p className="text-sm">Select a playlist to start listening</p>
          </div>
        )}
      </div>
    </div>
  );
}
