'use server';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminIdentity } from '@/lib/admin-auth';
import { formatRedemptionCode, isPlanCode, isValidCustomCode, normalizeRedemptionCode, parseShanghaiDateTime, type PlanCode } from '@/lib/redemption';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!isAdminIdentity(user, profile?.role)) throw new Error('Forbidden: Admin only');
  const admin = createAdminClient();
  if (!admin) throw new Error('SUPABASE_SERVICE_ROLE_KEY 未配置。');
  return { admin, user };
}

export interface AdminFeature {
  key: string; displayName: string; description: string; enabled: boolean; betaOnly: boolean; minimumPlan: PlanCode;
}

export interface AdminNovel {
  id: string; title: string; author: string; description: string; language: 'zh' | 'en'; minimumPlan: PlanCode;
  originalFileName: string; fileSize: number; enabled: boolean; featured: boolean; publishedAt: string; ownerCount: number;
}

export interface AdminCode {
  id: string; codePrefix: string; label: string; rewardType: 'novel' | 'membership'; novelId: string | null; novelIds: string[]; novelTitles: string[];
  planCode: PlanCode | null; membershipDays: number | null; notBefore: string | null; expiresAt: string | null;
  usageLimit: number; redeemedCount: number; enabled: boolean; createdAt: string;
}

export async function getReaderAdminDashboard(): Promise<{ features: AdminFeature[]; novels: AdminNovel[]; codes: AdminCode[] }> {
  const { admin } = await requireAdmin();
  const [features, novels, codes, codeNovels, entitlements] = await Promise.all([
    admin.from('app_features').select('*').order('key'),
    admin.from('novel_catalog').select('*').order('published_at', { ascending: false }),
    admin.from('redemption_codes').select('*').order('created_at', { ascending: false }).limit(300),
    admin.from('redemption_code_novels').select('code_id, novel_id, sort_order').order('sort_order'),
    admin.from('user_novel_entitlements').select('novel_id'),
  ]);
  if (features.error || novels.error || codes.error || codeNovels.error || entitlements.error) throw new Error(features.error?.message ?? novels.error?.message ?? codes.error?.message ?? codeNovels.error?.message ?? entitlements.error?.message ?? '读取管理数据失败。');
  const novelTitles = new Map((novels.data ?? []).map((row) => [row.id, row.title]));
  const ownerCounts = new Map<string, number>();
  for (const row of entitlements.data ?? []) ownerCounts.set(row.novel_id, (ownerCounts.get(row.novel_id) ?? 0) + 1);
  const novelsByCode = new Map<string, string[]>();
  for (const row of codeNovels.data ?? []) novelsByCode.set(row.code_id, [...(novelsByCode.get(row.code_id) ?? []), row.novel_id]);
  return {
    features: (features.data ?? []).map((row) => ({ key: row.key, displayName: row.display_name, description: row.description, enabled: row.enabled, betaOnly: row.beta_only, minimumPlan: row.minimum_plan })),
    novels: (novels.data ?? []).map((row) => ({ id: row.id, title: row.title, author: row.author, description: row.description, language: row.language, minimumPlan: row.minimum_plan, originalFileName: row.original_file_name, fileSize: Number(row.file_size), enabled: row.enabled, featured: row.featured, publishedAt: row.published_at, ownerCount: ownerCounts.get(row.id) ?? 0 })),
    codes: (codes.data ?? []).map((row) => { const novelIds = novelsByCode.get(row.id) ?? (row.novel_id ? [row.novel_id] : []); return { id: row.id, codePrefix: row.code_prefix, label: row.label, rewardType: row.reward_type, novelId: row.novel_id, novelIds, novelTitles: novelIds.map((id) => novelTitles.get(id) ?? '已删除小说'), planCode: row.plan_code, membershipDays: row.membership_days, notBefore: row.not_before, expiresAt: row.expires_at, usageLimit: row.usage_limit, redeemedCount: row.redeemed_count, enabled: row.enabled, createdAt: row.created_at }; }),
  };
}

export async function updateFeatureAccess(input: { key: string; enabled: boolean; betaOnly: boolean; minimumPlan: string }) {
  const { admin, user } = await requireAdmin();
  if (!/^[a-z][a-z0-9_]{1,63}$/u.test(input.key) || !isPlanCode(input.minimumPlan)) return { success: false, error: '功能或套餐参数无效。' };
  const { error } = await admin.from('app_features').update({ enabled: input.enabled, beta_only: input.betaOnly, minimum_plan: input.minimumPlan, updated_by: user.id, updated_at: new Date().toISOString() }).eq('key', input.key);
  if (error) return { success: false, error: error.message };
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function updateCatalogNovel(input: { id: string; title: string; author: string; description: string; language: string; enabled: boolean; featured: boolean; minimumPlan: string }) {
  const { admin } = await requireAdmin();
  const title = input.title.trim();
  const author = input.author.trim();
  const description = input.description.trim();
  if (!/^[0-9a-f-]{36}$/iu.test(input.id) || !title || title.length > 160 || author.length > 120 || description.length > 1000 || !['zh', 'en'].includes(input.language) || !isPlanCode(input.minimumPlan)) return { success: false, error: '请检查书名、作者、简介、语言和套餐设置。' };
  const { error } = await admin.from('novel_catalog').update({ title, author, description, language: input.language, enabled: input.enabled, featured: input.featured, minimum_plan: input.minimumPlan, updated_at: new Date().toISOString() }).eq('id', input.id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/admin/content'); revalidatePath('/reading');
  return { success: true };
}

export async function deleteCatalogNovel(id: string) {
  const { admin } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/iu.test(id)) return { success: false, error: '小说参数无效。' };
  const { data: novel, error: readError } = await admin.from('novel_catalog').select('storage_path, cover_path').eq('id', id).maybeSingle();
  if (readError) return { success: false, error: readError.message };
  if (!novel) return { success: false, error: '小说不存在或已删除。' };
  const { error: deleteError } = await admin.from('novel_catalog').delete().eq('id', id);
  if (deleteError) return { success: false, error: deleteError.message };
  const paths = [novel.storage_path, novel.cover_path].filter((path): path is string => Boolean(path));
  const storageResult = paths.length ? await admin.storage.from('novel-files').remove(paths) : { error: null };
  revalidatePath('/admin/content'); revalidatePath('/reading');
  return { success: true, warning: storageResult.error ? `书目已删除，但存储文件清理失败：${storageResult.error.message}` : undefined };
}

export async function createRedemptionCodes(input: {
  customCode?: string; quantity: number; label: string; rewardType: 'novel' | 'membership'; novelIds?: string[];
  planCode?: string; membershipDays?: number; notBefore?: string | null; expiresAt?: string | null; validDays?: number; usageLimit: number;
}): Promise<{ success: boolean; codes?: string[]; error?: string }> {
  const { admin, user } = await requireAdmin();
  const quantity = Math.floor(input.quantity);
  const usageLimit = Math.floor(input.usageLimit);
  if (quantity < 1 || quantity > 200 || usageLimit < 1 || usageLimit > 1_000_000) return { success: false, error: '批量数量须为 1–200，单码人数须为 1–1,000,000。' };
  if (input.customCode && quantity !== 1) return { success: false, error: '自定义兑换码只能单个创建。' };
  if (input.customCode && !isValidCustomCode(input.customCode)) return { success: false, error: '自定义码须为 6–32 位字母或数字。' };
  const novelIds = [...new Set(input.novelIds ?? [])];
  if (input.rewardType === 'novel' && (novelIds.length < 1 || novelIds.length > 50 || novelIds.some((id) => !/^[0-9a-f-]{36}$/iu.test(id)))) return { success: false, error: '请选择 1–50 本要兑换的小说。' };
  if (input.rewardType === 'membership' && (!input.planCode || !isPlanCode(input.planCode) || !Number.isInteger(input.membershipDays) || input.membershipDays! < 1 || input.membershipDays! > 3650)) return { success: false, error: '会员等级或有效天数无效。' };
  const notBefore = parseShanghaiDateTime(input.notBefore);
  let expiresAt = parseShanghaiDateTime(input.expiresAt);
  if ((input.notBefore && !notBefore) || (input.expiresAt && !expiresAt)) return { success: false, error: '有效时间格式无效。' };
  if (input.validDays !== undefined && (!Number.isInteger(input.validDays) || input.validDays < 1 || input.validDays > 3650)) return { success: false, error: '兑换码有效期须为 1–3650 天。' };
  if (!expiresAt && input.validDays) expiresAt = new Date((notBefore?.getTime() ?? Date.now()) + input.validDays * 86_400_000);
  if (notBefore && expiresAt && expiresAt <= notBefore) return { success: false, error: '结束时间必须晚于开始时间。' };

  if (input.rewardType === 'novel') {
    const { data: selectedNovels, error: novelError } = await admin.from('novel_catalog').select('id, enabled').in('id', novelIds);
    if (novelError || selectedNovels?.length !== novelIds.length || selectedNovels.some((novel) => !novel.enabled)) return { success: false, error: '选中的小说中包含已删除或未上架的书目。' };
  }

  const rawCodes = Array.from({ length: quantity }, (_, index) => input.customCode && index === 0 ? normalizeRedemptionCode(input.customCode) : randomBytes(6).toString('hex').toUpperCase());
  const rows = rawCodes.map((code) => ({
    id: randomUUID(),
    code_hash: createHash('sha256').update(code).digest('hex'), code_prefix: code.slice(0, 4), label: input.label.trim(), reward_type: input.rewardType,
    novel_id: input.rewardType === 'novel' ? novelIds[0] : null, plan_code: input.rewardType === 'membership' ? input.planCode : null,
    membership_days: input.rewardType === 'membership' ? input.membershipDays : null,
    not_before: notBefore?.toISOString() ?? null, expires_at: expiresAt?.toISOString() ?? null,
    usage_limit: usageLimit, created_by: user.id,
  }));
  const { error } = await admin.from('redemption_codes').insert(rows);
  if (error) return { success: false, error: error.code === '23505' ? '兑换码已存在，请更换后重试。' : error.message };
  if (input.rewardType === 'novel') {
    const bundleRows = rows.flatMap((row) => novelIds.map((novelId, sortOrder) => ({ code_id: row.id, novel_id: novelId, sort_order: sortOrder })));
    const { error: bundleError } = await admin.from('redemption_code_novels').insert(bundleRows);
    if (bundleError) { await admin.from('redemption_codes').delete().in('id', rows.map((row) => row.id)); return { success: false, error: `创建图书组合失败：${bundleError.message}` }; }
  }
  revalidatePath('/admin/content');
  return { success: true, codes: rawCodes.map(formatRedemptionCode) };
}

export async function setRedemptionCodeEnabled(id: string, enabled: boolean) {
  const { admin } = await requireAdmin();
  const { error } = await admin.from('redemption_codes').update({ enabled }).eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/admin/content');
  return { success: true };
}
