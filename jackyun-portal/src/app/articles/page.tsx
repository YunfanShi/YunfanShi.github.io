import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function ArticlesPage() {
  const client = await createClient();
  const { data, error } = await client
    .from("site_articles")
    .select("slug,title,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error("文章暂时无法加载，请稍后重试。");
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-zinc-500">
        JackYun Platform
      </Link>
      <h1 className="my-8 text-4xl font-semibold">文章</h1>
      <div className="space-y-4">
        {data?.map((article) => (
          <Link
            className="block rounded-2xl border border-zinc-300 p-6 transition hover:border-zinc-500"
            key={article.slug}
            href={`/articles/${article.slug}`}
          >
            <h2 className="text-xl font-semibold">{article.title}</h2>
          </Link>
        ))}
        {!data?.length && <p>暂无已发布文章。</p>}
      </div>
    </main>
  );
}
