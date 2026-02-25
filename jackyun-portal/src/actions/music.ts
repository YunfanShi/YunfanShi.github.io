'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

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
