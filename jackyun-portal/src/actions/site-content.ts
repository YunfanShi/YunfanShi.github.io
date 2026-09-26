"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminIdentity } from "@/lib/admin-auth";
import {
  validateContent,
  type Article,
  type ShareLink,
} from "@/lib/site-content";
async function requireContentAdmin() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error("请登录。");
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role, account_status, deleted_at")
    .eq("id", user.id)
    .maybeSingle();
  if (
    profileError ||
    profile?.account_status === "suspended" ||
    profile?.deleted_at ||
    !isAdminIdentity(user, profile?.role)
  )
    throw new Error("需要管理员权限。");
  const admin = createAdminClient();
  if (!admin) throw new Error("内容服务未配置。");
  return admin;
}
export async function getSiteContent() {
  const admin = await requireContentAdmin();
  const [articles, links] = await Promise.all([
    admin
      .from("site_articles")
      .select("*")
      .order("updated_at", { ascending: false }),
    admin
      .from("site_share_links")
      .select("*")
      .order("updated_at", { ascending: false }),
  ]);
  if (articles.error || links.error)
    throw new Error("内容加载失败，请检查数据库迁移。");
  return {
    articles: articles.data as Article[],
    links: links.data as ShareLink[],
  };
}
export async function saveSiteContent(
  kind: "article" | "link",
  id: string | null,
  input: Record<string, unknown>,
) {
  try {
    const admin = await requireContentAdmin();
    if (id && !/^[a-f0-9-]{36}$/.test(id)) throw new Error("无效 ID。");
    const value = {
      ...validateContent(kind, input),
      updated_at: new Date().toISOString(),
    };
    const table = kind === "article" ? "site_articles" : "site_share_links";
    const result = id
      ? await admin.from(table).update(value).eq("id", id).select("id").single()
      : await admin
          .from(table)
          .insert(
            kind === "link"
              ? { ...value, code: `j-${randomBytes(8).toString("hex")}` }
              : value,
          )
          .select("id")
          .single();
    if (result.error)
      throw new Error(
        result.error.code === "23505"
          ? "路径已被使用，请换一个。"
          : "保存失败，请重试。",
      );
    revalidatePath("/admin/content");
    revalidatePath("/articles");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "保存失败。",
    };
  }
}
