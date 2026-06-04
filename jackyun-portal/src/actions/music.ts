'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { MusicSong, MusicSettings } from '@/types/music';

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return { supabase, user };
}

export async function createPlaylist(name: string, description: string) {
  const { supabase, user } = await getAuthenticatedUser();

  if (!name?.trim()) throw new Error('Playlist name is required');

  const { error } = await supabase.from('playlists').insert({
    user_id: user.id,
    name: name.trim(),
    description: description.trim() || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/music');
}

export async function deletePlaylist(id: string) {
  const { supabase, user } = await getAuthenticatedUser();

  await supabase.from('tracks').delete().eq('playlist_id', id).eq('user_id', user.id);

  const { error } = await supabase
    .from('playlists')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/music');
}

export async function addTrack(
  playlistId: string,
  title: string,
  artist: string,
  audioUrl: string,
) {
  const { supabase, user } = await getAuthenticatedUser();

  if (!title?.trim()) throw new Error('Track title is required');
  if (!audioUrl?.trim()) throw new Error('Audio URL is required');

  const { data: existing } = await supabase
    .from('tracks')
    .select('sort_order')
    .eq('playlist_id', playlistId)
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const sort_order = existing ? existing.sort_order + 1 : 0;

  const { error } = await supabase.from('tracks').insert({
    user_id: user.id,
    playlist_id: playlistId,
    title: title.trim(),
    artist: artist.trim() || null,
    url: audioUrl.trim(),
    sort_order,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/music');
}

export async function deleteTrack(id: string) {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase
    .from('tracks')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/music');
}

export async function reorderTracks(tracks: { id: string; sort_order: number }[]) {
  const { supabase, user } = await getAuthenticatedUser();

  await Promise.all(
    tracks.map(({ id, sort_order }) =>
      supabase
        .from('tracks')
        .update({ sort_order, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id),
    ),
  );

  revalidatePath('/music');
}

// ── NTP Sync Player actions ─────────────────────────────────────────────────

export async function getSongs(): Promise<MusicSong[]> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from('music_songs')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MusicSong[];
}

export async function addSong(neteaseId: string, name: string): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!neteaseId?.trim()) throw new Error('NetEase ID is required');
  if (!name?.trim()) throw new Error('Song name is required');

  const { data: last } = await supabase
    .from('music_songs')
    .select('sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();
  const sort_order = last ? last.sort_order + 1 : 0;

  const { error } = await supabase.from('music_songs').insert({
    user_id: user.id,
    netease_id: neteaseId.trim(),
    name: name.trim(),
    sort_order,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/music');
}

export async function deleteSong(id: string): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  const { error } = await supabase
    .from('music_songs')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);
  revalidatePath('/music');
}

export async function importSongs(songs: { id: string; name: string }[]): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!songs.length) return;

  const { data: last } = await supabase
    .from('music_songs')
    .select('sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();
  const baseOrder = last ? last.sort_order + 1 : 0;

  const rows = songs.map((s, i) => ({
    user_id: user.id,
    netease_id: s.id.trim(),
    name: s.name.trim(),
    sort_order: baseOrder + i,
  }));

  const { error } = await supabase.from('music_songs').insert(rows);
  if (error) throw new Error(error.message);
  revalidatePath('/music');
}

export async function getMusicSettings(): Promise<MusicSettings> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data } = await supabase
    .from('music_settings')
    .select('manual_offset, interval_ms, play_mode')
    .eq('user_id', user.id)
    .single();
  if (!data) {
    return { manual_offset: 0, interval_ms: 10000, play_mode: 'sequence' };
  }
  return data as MusicSettings;
}

export async function updateMusicSettings(settings: Partial<MusicSettings>): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  const { error } = await supabase
    .from('music_settings')
    .upsert(
      { user_id: user.id, ...settings, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(error.message);
}
