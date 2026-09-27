'use server';

import { serviceErrorMessage } from '@/lib/service-errors';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { BETA_AGREEMENT_VERSION, type BetaEnrollment } from '@/lib/beta';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(serviceErrorMessage(authError, '认证服务'));
  if (!user) throw new Error('登录会话已失效，请重新登录。（SESSION_EXPIRED）');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') throw new Error('Forbidden: Admin only');
  return supabase;
}

export async function respondToBetaInvitation(accept: boolean): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录。' };
  const { error } = await supabase.rpc('respond_to_beta_invitation', {
    p_accept: accept,
    p_agreement_version: BETA_AGREEMENT_VERSION,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function getAdminBetaEnrollments(): Promise<BetaEnrollment[]> {
  const supabase = await requireAdmin();
  const { data, error } = await supabase.rpc('admin_list_beta_enrollments');
  if (error) throw new Error(error.message);
  return (data ?? []) as BetaEnrollment[];
}

export async function setBetaInvitation(userId: string, invited: boolean): Promise<{ success: boolean; error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { success: false, error: '用户 ID 无效。' };
  const supabase = await requireAdmin();
  const { error } = await supabase.rpc('admin_set_beta_invitation', { p_user_id: userId, p_invited: invited });
  if (error) return { success: false, error: error.message };
  revalidatePath('/admin/users');
  revalidatePath('/', 'layout');
  return { success: true };
}

