'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  return { supabase, user };
}

/**
 * Soft-delete the current user's account.
 * Sets deleted_at on profiles table, then signs out.
 * Data is preserved for 30 days (can be restored by admin).
 */
export async function requestAccountDeletion(): Promise<{ success: boolean; error: string | null }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    // 1. Mark profile as deleted
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', user.id);

    if (profileError) {
      console.error('[requestAccountDeletion] profile update error:', profileError);
      return { success: false, error: '无法标记账户为已删除' };
    }

    // 2. Optionally: anonymize user_settings and legacy_sync_data
    // Keep data but disassociate from a "live" account
    // (For now, they stay in DB referenced by user_id, but frontend filters out deleted profiles)

    // 3. Sign out
    await supabase.auth.signOut();

    revalidatePath('/');
    return { success: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('[requestAccountDeletion] exception:', err);
    return { success: false, error: message };
  }
}

/**
 * Cancel a pending account deletion (within 30-day grace period).
 * Only admins can restore accounts.
 */
export async function cancelAccountDeletion(
  userId: string,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.role !== 'admin') {
      return { success: false, error: 'Forbidden: Admin only' };
    }

    const { error } = await supabase
      .from('profiles')
      .update({ deleted_at: null })
      .eq('id', userId);

    if (error) {
      console.error('[cancelAccountDeletion] error:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/admin');
    return { success: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return { success: false, error: message };
  }
}
