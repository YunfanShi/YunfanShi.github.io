'use client';

import { useEffect, useRef, useState } from 'react';

export interface Track {
  id: string;
  title: string;
  artist: string | null;
  url: string;
  sort_order: number;
}

interface Props {
  tracks: Track[];
  initialTrackIndex?: number;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Player({ tracks, initialTrackIndex = 0 }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentIndex, setCurrentIndex] = useState(
    Math.min(initialTrackIndex, Math.max(tracks.length - 1, 0)),
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const currentTrack = tracks[currentIndex] ?? null;

  // Load new track when index changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    audio.src = currentTrack.url;
    audio.load();
    if (isPlaying) audio.play().catch(() => setIsPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      if (currentIndex < tracks.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [currentIndex, tracks.length]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => setIsPlaying(false));
    }
  }

  function playTrack(index: number) {
    if (index === currentIndex) {
      togglePlay();
    } else {
      setIsPlaying(true);
      setCurrentIndex(index);
    }
  }

  function handlePrev() {
    if (currentIndex > 0) {
      setIsPlaying(true);
      setCurrentIndex((i) => i - 1);
    }
  }

  function handleNext() {
    if (currentIndex < tracks.length - 1) {
      setIsPlaying(true);
      setCurrentIndex((i) => i + 1);
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * duration;
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!tracks.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--muted-foreground)]">
        <span className="material-icons-round text-4xl">music_off</span>
        <p className="text-sm">No tracks in this playlist</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Player card */}
      <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        {/* Track info */}
        <div className="mb-4 text-center">
          <p className="truncate text-base font-semibold text-[var(--foreground)]">
            {currentTrack?.title ?? '—'}
          </p>
          {currentTrack?.artist && (
            <p className="mt-0.5 truncate text-sm text-[var(--muted-foreground)]">
              {currentTrack.artist}
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div
          className="mb-2 h-2 w-full cursor-pointer rounded-full bg-[var(--card-border)] overflow-hidden"
          onClick={handleSeek}
        >
          <div
            className="h-full rounded-full bg-[#4285F4] transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Time */}
        <div className="mb-4 flex justify-between text-xs text-[var(--muted-foreground)]">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-30 transition-colors"
            aria-label="Previous"
          >
            <span className="material-icons-round text-3xl">skip_previous</span>
          </button>
          <button
            onClick={togglePlay}
            disabled={!currentTrack}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[#4285F4] text-white hover:bg-[#3574e0] disabled:opacity-50 transition-colors shadow-md"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            <span className="material-icons-round text-2xl">
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex === tracks.length - 1}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-30 transition-colors"
            aria-label="Next"
          >
            <span className="material-icons-round text-3xl">skip_next</span>
          </button>
        </div>
      </div>

      {/* Track list */}
      <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        {tracks.map((track, idx) => (
          <button
            key={track.id}
            onClick={() => playTrack(idx)}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--background)] border-b border-[var(--card-border)] last:border-b-0 ${
              idx === currentIndex ? 'bg-[#4285F415]' : ''
            }`}
          >
            <span
              className={`material-icons-round text-lg ${
                idx === currentIndex ? 'text-[#4285F4]' : 'text-[var(--muted-foreground)]'
              }`}
            >
              {idx === currentIndex && isPlaying ? 'volume_up' : 'music_note'}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-sm font-medium ${
                  idx === currentIndex ? 'text-[#4285F4]' : 'text-[var(--foreground)]'
                }`}
              >
                {track.title}
              </p>
              {track.artist && (
                <p className="truncate text-xs text-[var(--muted-foreground)]">{track.artist}</p>
              )}
            </div>
            <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
              {idx + 1}
            </span>
          </button>
        ))}
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} preload="metadata" />
    </div>
  );
}
