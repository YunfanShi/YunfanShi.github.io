'use server';

import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasPlanAccess, normalizeRedemptionCode } from '@/lib/redemption';

export interface FeatureAccess {
  key: string;
  displayName: string;
  description: string;
  enabled: boolean;
  betaOnly: boolean;
  minimumPlan: string;
  allowed: boolean;
}

export interface CatalogNovel {
  id: string;
  title: string;
  author: string;
  description: string;
  category: string;
  tags: string[];
  language: 'zh' | 'en';
  minimumPlan: string;
  originalFileName: string;
  fileSize: number;
  featured: boolean;
  publishedAt: string;
  owned: boolean;
  needsReaderImport: boolean;
  unlocked: boolean;
  downloadUrl: string | null;
  coverUrl: string | null;
  contentRevision: number;
  chaptersReady: boolean;
  contentUpdatedAt: string;
  coverUpdatedAt: string | null;
}

export interface ReaderBootstrap {
  signedIn: boolean;
  userId: string | null;
  plan: string;
  betaActive: boolean;
  features: Record<string, FeatureAccess>;
  catalog: CatalogNovel[];
}

export type FeatureAccessSnapshot = Omit<ReaderBootstrap, 'catalog'>;

type FeatureRow = { key: string; display_name: string; description: string; enabled: boolean; beta_only: boolean; minimum_plan: string };

function featureAccess(row: FeatureRow, plan: string, betaActive: boolean): FeatureAccess {
  return {
    key: row.key,
    displayName: row.display_name,
    description: row.description,
    enabled: row.enabled,
    betaOnly: row.beta_only,
    minimumPlan: row.minimum_plan,
    allowed: row.enabled && (!row.beta_only || betaActive) && hasPlanAccess(plan, row.minimum_plan),
  };
}

async function loadFeatureAccess(): Promise<{ snapshot: FeatureAccessSnapshot; admin: NonNullable<ReturnType<typeof createAdminClient>> | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();
  if (!admin) return { snapshot: { signedIn: Boolean(user), userId: user?.id ?? null, plan: 'free', betaActive: false, features: {} }, admin: null };

  const now = new Date().toISOString();
  const [featureResult, entitlementResult, betaResult] = await Promise.all([
    admin.from('app_features').select('key, display_name, description, enabled, beta_only, minimum_plan'),
    user ? admin.from('user_entitlements').select('plan_code, expires_at').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    user ? admin.from('beta_enrollments').select('status').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const entitlement = entitlementResult.data as { plan_code?: string; expires_at?: string | null } | null;
  const plan = entitlement && (!entitlement.expires_at || entitlement.expires_at > now) ? entitlement.plan_code ?? 'free' : 'free';
  const betaActive = (betaResult.data as { status?: string } | null)?.status === 'accepted';
  const features = Object.fromEntries(((featureResult.data ?? []) as FeatureRow[]).map((row) => [row.key, featureAccess(row, plan, betaActive)]));
  return { snapshot: { signedIn: Boolean(user), userId: user?.id ?? null, plan, betaActive, features }, admin };
}

export async function getFeatureAccessSnapshot(): Promise<FeatureAccessSnapshot> {
  return (await loadFeatureAccess()).snapshot;
}

export async function getReaderBootstrap(): Promise<ReaderBootstrap> {
  const { snapshot, admin } = await loadFeatureAccess();
  const { signedIn, userId, plan, betaActive, features } = snapshot;
  if (!admin) return { ...snapshot, catalog: [] };
  const [catalogResult, unlockedResult] = await Promise.all([
    admin.from('novel_catalog').select('*').eq('enabled', true).order('featured', { ascending: false }).order('published_at', { ascending: false }),
    userId ? admin.from('user_novel_entitlements').select('novel_id, reader_added_at').eq('user_id', userId) : Promise.resolve({ data: [], error: null }),
  ]);
  const entitlementImportState = new Map((unlockedResult.data ?? []).map((row: { novel_id: string; reader_added_at: string | null }) => [row.novel_id, row.reader_added_at]));
  const unlockedIds = new Set(entitlementImportState.keys());
  const visibleRows = features.novel_store?.allowed ? (catalogResult.data ?? []) : (catalogResult.data ?? []).filter((row) => unlockedIds.has(row.id));
  const catalog = await Promise.all(visibleRows.map(async (row) => {
    const owned = unlockedIds.has(row.id);
    const unlocked = hasPlanAccess(plan, row.minimum_plan) || owned;
    const [fileResult, coverResult] = await Promise.all([
      unlocked ? admin.storage.from('novel-files').createSignedUrl(row.storage_path, 3600) : Promise.resolve({ data: null }),
      row.cover_path ? admin.storage.from('novel-files').createSignedUrl(row.cover_path, 3600) : Promise.resolve({ data: null }),
    ]);
    return {
      id: row.id, title: row.title, author: row.author, description: row.description, category: row.category ?? '未分类', tags: Array.isArray(row.tags) ? row.tags : [],
      language: row.language, minimumPlan: row.minimum_plan, originalFileName: row.original_file_name,
      fileSize: Number(row.file_size), featured: row.featured, publishedAt: row.published_at,
      owned, needsReaderImport: owned && !entitlementImportState.get(row.id), unlocked, downloadUrl: fileResult.data?.signedUrl ?? null, coverUrl: coverResult.data?.signedUrl ?? null,
      contentRevision: Number(row.content_revision ?? 1), chaptersReady: Boolean(row.chapters_ready), contentUpdatedAt: row.content_updated_at ?? row.updated_at,
      coverUpdatedAt: row.cover_updated_at ?? null,
    } satisfies CatalogNovel;
  }));
  return { signedIn, userId, plan, betaActive, features, catalog };
}

const redemptionErrors: Record<string, string> = {
  INVALID_CODE: '兑换码不存在或已停用。',
  CODE_NOT_STARTED: '这个兑换码还未到生效时间。',
  CODE_EXPIRED: '这个兑换码已经过期。',
  CODE_EXHAUSTED: '这个兑换码的可用次数已用完。',
  CODE_ALREADY_USED: '你已经使用过这个兑换码。',
  NOVEL_UNAVAILABLE: '对应小说暂时无法领取。',
  PLAN_LOWER_THAN_CURRENT: '兑换码等级低于你当前的会员等级。',
};

export async function redeemCode(code: string): Promise<{ success: boolean; reward?: Record<string, unknown>; error?: string }> {
  const normalized = normalizeRedemptionCode(code);
  if (!/^[A-Z0-9]{6,32}$/u.test(normalized)) return { success: false, error: '请输入 6–32 位兑换码。' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '登录后才能兑换权益。' };
  const admin = createAdminClient();
  if (!admin) return { success: false, error: '兑换服务暂未配置。' };
  const hash = createHash('sha256').update(normalized).digest('hex');
  const { data, error } = await admin.rpc('redeem_reward_code', { p_user_id: user.id, p_code_hash: hash });
  if (error) {
    const key = Object.keys(redemptionErrors).find((item) => error.message.includes(item));
    return { success: false, error: key ? redemptionErrors[key] : '兑换失败，请稍后重试。' };
  }
  return { success: true, reward: data as Record<string, unknown> };
}

export async function acknowledgeCatalogNovelImport(novelId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/iu.test(novelId)) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from('user_novel_entitlements').update({ reader_added_at: new Date().toISOString() }).eq('user_id', user.id).eq('novel_id', novelId).is('reader_added_at', null);
}

export async function getRedemptionHistory(): Promise<Array<{ id: string; reward: Record<string, unknown>; redeemedAt: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from('redemption_uses').select('id, reward_snapshot, redeemed_at').eq('user_id', user.id).order('redeemed_at', { ascending: false }).limit(20);
  return (data ?? []).map((row) => ({ id: row.id, reward: row.reward_snapshot as Record<string, unknown>, redeemedAt: row.redeemed_at }));
}
