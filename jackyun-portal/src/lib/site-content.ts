export interface Article {
  id: string;
  slug: string;
  title: string;
  body: string;
  visibility: "public" | "login";
  published: boolean;
  updated_at: string;
}
export interface ShareLink {
  id: string;
  code: string;
  name: string;
  url: string;
  enabled: boolean;
  updated_at: string;
}
export function validateContent(kind: string, input: Record<string, unknown>) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (kind === "article") {
    if (
      !title ||
      title.length > 160 ||
      typeof input.slug !== "string" ||
      !/^[a-z0-9][a-z0-9-]{2,79}$/.test(input.slug) ||
      typeof input.body !== "string" ||
      input.body.length > 200000 ||
      !["public", "login"].includes(String(input.visibility)) ||
      typeof input.published !== "boolean"
    )
      throw new Error(
        "文章标题、路径、正文或权限无效。路径须为 3–80 位小写字母、数字或连字符。",
      );
    return {
      title,
      slug: input.slug,
      body: input.body,
      visibility: input.visibility,
      published: input.published,
    };
  }
  if (
    kind !== "link" ||
    !name ||
    name.length > 160 ||
    typeof input.url !== "string" ||
    input.url.length > 4096 ||
    typeof input.enabled !== "boolean"
  )
    throw new Error("链接名称或 URL 无效。");
  const url = new URL(input.url);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("仅支持不含账户密码的 HTTP/HTTPS 链接。");
  return { name, url: url.href, enabled: input.enabled };
}
