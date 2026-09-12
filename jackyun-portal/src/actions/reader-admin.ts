"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminIdentity } from "@/lib/admin-auth";
import {
  formatRedemptionCode,
  isPlanCode,
  isValidCustomCode,
  normalizeRedemptionCode,
  parseShanghaiDateTime,
  type PlanCode,
} from "@/lib/redemption";
import { parseNovelFile } from "@/lib/novel-import";
import { splitNovelIntoChapters, type NovelChapter } from "@/lib/novel-reader";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isAdminIdentity(user, profile?.role))
    throw new Error("Forbidden: Admin only");
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY 未配置。");
  return { admin, user };
}

export interface AdminFeature {
  key: string;
  displayName: string;
  description: string;
  enabled: boolean;
  betaOnly: boolean;
  minimumPlan: PlanCode;
}

export interface AdminNovel {
  id: string;
  title: string;
  author: string;
  description: string;
  language: "zh" | "en";
  minimumPlan: PlanCode;
  category: string;
  tags: string[];
  originalFileName: string;
  fileSize: number;
  enabled: boolean;
  featured: boolean;
  publishedAt: string;
  contentRevision: number;
  chaptersReady: boolean;
}
export interface AdminTag {
  id: string;
  name: string;
  usageCount: number;
}

export interface AdminCode {
  id: string;
  codePrefix: string;
  label: string;
  rewardType: "novel" | "membership";
  novelId: string | null;
  planCode: PlanCode | null;
  membershipDays: number | null;
  notBefore: string | null;
  expiresAt: string | null;
  usageLimit: number;
  redeemedCount: number;
  enabled: boolean;
  createdAt: string;
}

export async function getReaderAdminDashboard(): Promise<{
  features: AdminFeature[];
  novels: AdminNovel[];
  codes: AdminCode[];
  tags: AdminTag[];
}> {
  const { admin } = await requireAdmin();
  const [features, novels, codes, tags, catalogTags] = await Promise.all([
    admin.from("app_features").select("*").order("key"),
    admin
      .from("novel_catalog")
      .select("*")
      .order("published_at", { ascending: false }),
    admin
      .from("redemption_codes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300),
    admin.from("novel_tags").select("id, name").order("name"),
    admin.from("novel_catalog_tags").select("tag_id"),
  ]);
  if (
    features.error ||
    novels.error ||
    codes.error ||
    tags.error ||
    catalogTags.error
  )
    throw new Error(
      features.error?.message ??
        novels.error?.message ??
        codes.error?.message ??
        tags.error?.message ??
        catalogTags.error?.message ??
        "读取管理数据失败。",
    );
  const tagUsage = new Map<string, number>();
  for (const row of catalogTags.data ?? [])
    tagUsage.set(row.tag_id, (tagUsage.get(row.tag_id) ?? 0) + 1);
  return {
    features: (features.data ?? []).map((row) => ({
      key: row.key,
      displayName: row.display_name,
      description: row.description,
      enabled: row.enabled,
      betaOnly: row.beta_only,
      minimumPlan: row.minimum_plan,
    })),
    novels: (novels.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      author: row.author,
      description: row.description,
      language: row.language,
      minimumPlan: row.minimum_plan,
      category: row.category ?? "未分类",
      tags: Array.isArray(row.tags) ? row.tags : [],
      originalFileName: row.original_file_name,
      fileSize: Number(row.file_size),
      enabled: row.enabled,
      featured: row.featured,
      publishedAt: row.published_at,
      contentRevision: Number(row.content_revision ?? 1),
      chaptersReady: Boolean(row.chapters_ready),
    })),
    codes: (codes.data ?? []).map((row) => ({
      id: row.id,
      codePrefix: row.code_prefix,
      label: row.label,
      rewardType: row.reward_type,
      novelId: row.novel_id,
      planCode: row.plan_code,
      membershipDays: row.membership_days,
      notBefore: row.not_before,
      expiresAt: row.expires_at,
      usageLimit: row.usage_limit,
      redeemedCount: row.redeemed_count,
      enabled: row.enabled,
      createdAt: row.created_at,
    })),
    tags: (tags.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      usageCount: tagUsage.get(row.id) ?? 0,
    })),
  };
}

export async function createNovelTag(name: string) {
  const { admin } = await requireAdmin();
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 40)
    return { success: false, error: "标签名称须为 1–40 个字符。" };
  const { data, error } = await admin
    .from("novel_tags")
    .insert({ name: cleanName })
    .select("id, name")
    .single();
  if (error)
    return {
      success: false,
      error: error.code === "23505" ? "这个标签已经存在。" : error.message,
    };
  revalidatePath("/admin/content");
  return {
    success: true,
    tag: { id: data.id, name: data.name, usageCount: 0 } satisfies AdminTag,
  };
}

export async function deleteNovelTag(id: string) {
  const { admin } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/iu.test(id))
    return { success: false, error: "标签参数无效。" };
  const { error } = await admin.from("novel_tags").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/content");
  return { success: true };
}

export async function getAdminNovelChapters(
  id: string,
): Promise<{ success: boolean; chapters?: NovelChapter[]; error?: string }> {
  const { admin } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/iu.test(id))
    return { success: false, error: "小说参数无效。" };
  const { data: stored, error: storedError } = await admin
    .from("novel_catalog_chapters")
    .select("chapter_index, title, content, character_count")
    .eq("novel_id", id)
    .order("chapter_index");
  if (storedError) return { success: false, error: storedError.message };
  if (stored?.length)
    return {
      success: true,
      chapters: stored.map((row) => ({
        index: row.chapter_index,
        title: row.title,
        content: row.content,
        characterCount: row.character_count,
      })),
    };
  const { data: novel, error: novelError } = await admin
    .from("novel_catalog")
    .select("storage_path, original_file_name")
    .eq("id", id)
    .maybeSingle();
  if (novelError || !novel)
    return { success: false, error: novelError?.message ?? "小说不存在。" };
  const { data: blob, error: downloadError } = await admin.storage
    .from("novel-files")
    .download(novel.storage_path);
  if (downloadError || !blob)
    return {
      success: false,
      error: downloadError?.message ?? "无法读取小说正文。",
    };
  try {
    const parsed = await parseNovelFile(
      new File([blob], novel.original_file_name),
      "auto",
    );
    const chapters = parsed.chapters ?? splitNovelIntoChapters(parsed.text);
    return chapters.length
      ? { success: true, chapters }
      : { success: false, error: "没有识别到可管理的章节。" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "章节识别失败。",
    };
  }
}

export async function saveAdminNovelChapters(
  id: string,
  chapters: NovelChapter[],
) {
  const { admin } = await requireAdmin();
  const normalized = chapters.map((chapter, index) => ({
    index,
    title: chapter.title.trim(),
    content: chapter.content,
    characterCount: chapter.content.length,
  }));
  if (
    !/^[0-9a-f-]{36}$/iu.test(id) ||
    normalized.length < 1 ||
    normalized.length > 5000 ||
    normalized.some((chapter) => !chapter.title || chapter.title.length > 200)
  )
    return {
      success: false,
      error: "章节须为 1–5000 个，标题须为 1–200 个字符。",
    };
  const { data, error } = await admin.rpc("replace_novel_catalog_chapters", {
    p_novel_id: id,
    p_chapters: normalized,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/content");
  revalidatePath("/reading");
  return { success: true, revision: Number(data) };
}

export async function updateFeatureAccess(input: {
  key: string;
  enabled: boolean;
  betaOnly: boolean;
  minimumPlan: string;
}) {
  const { admin, user } = await requireAdmin();
  if (
    !/^[a-z][a-z0-9_]{1,63}$/u.test(input.key) ||
    !isPlanCode(input.minimumPlan)
  )
    return { success: false, error: "功能或套餐参数无效。" };
  const { error } = await admin
    .from("app_features")
    .update({
      enabled: input.enabled,
      beta_only: input.betaOnly,
      minimum_plan: input.minimumPlan,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("key", input.key);
  if (error) return { success: false, error: error.message };
  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateCatalogNovel(input: {
  id: string;
  title?: string;
  author?: string;
  description?: string;
  category?: string;
  tags?: string[];
  language?: string;
  enabled: boolean;
  featured: boolean;
  minimumPlan: string;
}) {
  const { admin } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/iu.test(input.id) || !isPlanCode(input.minimumPlan))
    return { success: false, error: "小说或套餐参数无效。" };
  const { data: existing, error: readError } = await admin
    .from("novel_catalog")
    .select("title, author, description, category, tags, language")
    .eq("id", input.id)
    .maybeSingle();
  if (readError || !existing)
    return { success: false, error: readError?.message ?? "小说不存在。" };
  const title = (input.title ?? existing.title).trim();
  const author = (input.author ?? existing.author).trim();
  const description = (input.description ?? existing.description).trim();
  const category =
    (input.category ?? existing.category ?? "未分类").trim() || "未分类";
  const tags = [
    ...new Set(
      (input.tags ?? existing.tags ?? [])
        .map((tag: string) => tag.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);
  const language = input.language ?? existing.language;
  if (
    !title ||
    title.length > 160 ||
    author.length > 120 ||
    description.length > 1000 ||
    category.length > 40 ||
    !["zh", "en"].includes(language)
  )
    return { success: false, error: "请检查书名、作者、简介、分类和语言。" };
  const { error } = await admin
    .from("novel_catalog")
    .update({
      title,
      author,
      description,
      category,
      language,
      enabled: input.enabled,
      featured: input.featured,
      minimum_plan: input.minimumPlan,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { success: false, error: error.message };
  const { error: tagError } = await admin.rpc("replace_novel_catalog_tags", {
    p_novel_id: input.id,
    p_tags: tags,
  });
  if (tagError) return { success: false, error: tagError.message };
  revalidatePath("/admin/content");
  revalidatePath("/reading");
  return { success: true };
}

export async function deleteCatalogNovel(id: string) {
  const { admin } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/iu.test(id))
    return { success: false, error: "小说参数无效。" };
  const { data: novel, error: readError } = await admin
    .from("novel_catalog")
    .select("storage_path, cover_path")
    .eq("id", id)
    .maybeSingle();
  if (readError || !novel)
    return { success: false, error: readError?.message ?? "小说不存在。" };
  const { error } = await admin.from("novel_catalog").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  const paths = [novel.storage_path, novel.cover_path].filter(
    (path): path is string => Boolean(path),
  );
  const storageResult = paths.length
    ? await admin.storage.from("novel-files").remove(paths)
    : { error: null };
  revalidatePath("/admin/content");
  revalidatePath("/reading");
  return {
    success: true,
    warning: storageResult.error
      ? `书目已删除，但文件清理失败：${storageResult.error.message}`
      : undefined,
  };
}

export async function createRedemptionCodes(input: {
  customCode?: string;
  quantity: number;
  label: string;
  rewardType: "novel" | "membership";
  novelId?: string;
  planCode?: string;
  membershipDays?: number;
  notBefore?: string | null;
  expiresAt?: string | null;
  validDays?: number;
  usageLimit: number;
}): Promise<{ success: boolean; codes?: string[]; error?: string }> {
  const { admin, user } = await requireAdmin();
  const quantity = Math.floor(input.quantity);
  const usageLimit = Math.floor(input.usageLimit);
  if (
    quantity < 1 ||
    quantity > 200 ||
    usageLimit < 1 ||
    usageLimit > 1_000_000
  )
    return {
      success: false,
      error: "批量数量须为 1–200，单码人数须为 1–1,000,000。",
    };
  if (input.customCode && quantity !== 1)
    return { success: false, error: "自定义兑换码只能单个创建。" };
  if (input.customCode && !isValidCustomCode(input.customCode))
    return { success: false, error: "自定义码须为 6–32 位字母或数字。" };
  if (input.rewardType === "novel" && !input.novelId)
    return { success: false, error: "请选择要兑换的小说。" };
  if (
    input.rewardType === "membership" &&
    (!input.planCode ||
      !isPlanCode(input.planCode) ||
      !Number.isInteger(input.membershipDays) ||
      input.membershipDays! < 1 ||
      input.membershipDays! > 3650)
  )
    return { success: false, error: "会员等级或有效天数无效。" };
  const notBefore = parseShanghaiDateTime(input.notBefore);
  let expiresAt = parseShanghaiDateTime(input.expiresAt);
  if ((input.notBefore && !notBefore) || (input.expiresAt && !expiresAt))
    return { success: false, error: "有效时间格式无效。" };
  if (
    input.validDays !== undefined &&
    (!Number.isInteger(input.validDays) ||
      input.validDays < 1 ||
      input.validDays > 3650)
  )
    return { success: false, error: "兑换码有效期须为 1–3650 天。" };
  if (!expiresAt && input.validDays)
    expiresAt = new Date(
      (notBefore?.getTime() ?? Date.now()) + input.validDays * 86_400_000,
    );
  if (notBefore && expiresAt && expiresAt <= notBefore)
    return { success: false, error: "结束时间必须晚于开始时间。" };

  const rawCodes = Array.from({ length: quantity }, (_, index) =>
    input.customCode && index === 0
      ? normalizeRedemptionCode(input.customCode)
      : randomBytes(6).toString("hex").toUpperCase(),
  );
  const rows = rawCodes.map((code) => ({
    code_hash: createHash("sha256").update(code).digest("hex"),
    code_prefix: code.slice(0, 4),
    label: input.label.trim(),
    reward_type: input.rewardType,
    novel_id: input.rewardType === "novel" ? input.novelId : null,
    plan_code: input.rewardType === "membership" ? input.planCode : null,
    membership_days:
      input.rewardType === "membership" ? input.membershipDays : null,
    not_before: notBefore?.toISOString() ?? null,
    expires_at: expiresAt?.toISOString() ?? null,
    usage_limit: usageLimit,
    created_by: user.id,
  }));
  const { error } = await admin.from("redemption_codes").insert(rows);
  if (error)
    return {
      success: false,
      error:
        error.code === "23505" ? "兑换码已存在，请更换后重试。" : error.message,
    };
  revalidatePath("/admin/content");
  return { success: true, codes: rawCodes.map(formatRedemptionCode) };
}

export async function setRedemptionCodeEnabled(id: string, enabled: boolean) {
  const { admin } = await requireAdmin();
  const { error } = await admin
    .from("redemption_codes")
    .update({ enabled })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/content");
  return { success: true };
}
