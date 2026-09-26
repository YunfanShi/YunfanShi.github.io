import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ArticleMarkdown from "@/components/content/article-markdown";
export const dynamic = "force-dynamic";
export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();
  if (!admin) throw new Error("内容服务暂时不可用。");
  const { data: access, error } = await admin
    .from("site_articles")
    .select("visibility,published")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error("文章暂时无法加载。");
  if (!access?.published) notFound();
  const client = await createClient();
  if (access.visibility === "login") {
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user || user.is_anonymous)
      redirect(`/login?next=${encodeURIComponent(`/articles/${slug}`)}`);
  }
  const { data: article, error: readError } = await client
    .from("site_articles")
    .select("title,body")
    .eq("slug", slug)
    .maybeSingle();
  if (readError) throw new Error("文章暂时无法加载。");
  if (!article) notFound();
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <Link href="/articles" className="text-sm text-zinc-500">
        JackYun Platform / 文章
      </Link>
      <h1 className="mb-10 mt-8 text-4xl font-semibold leading-tight">
        {article.title}
      </h1>
      <ArticleMarkdown body={article.body} />
    </main>
  );
}
