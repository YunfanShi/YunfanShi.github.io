import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function ArticlesPage() {
  const client = await createClient();
  const { data, error } = await client
    .from("site_articles")
    .select("slug,title,updated_at")
    .order("updated_at", { ascending: false });

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-zinc-500">
        JackYun Platform
      </Link>
      <h1 className="my-8 text-4xl font-semibold">文章</h1>
      <div className="space-y-4">
        {error && <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-900"><p>文章服务暂时无法连接，已保存的工作区数据不受影响。</p><Link href="/articles" className="mt-3 inline-block rounded-xl border px-4 py-3">重新连接</Link></div>}
        {data?.map((article) => (
          <Link
            className="block rounded-2xl border border-zinc-300 p-6 transition hover:border-zinc-500"
            key={article.slug}
            href={`/articles/${article.slug}`}
          >
            <h2 className="text-xl font-semibold">{article.title}</h2>
          </Link>
        ))}
        {!error && !data?.length && <p>暂无已发布文章。</p>}
      </div>
    </main>
  );
}
