"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ArticleMarkdown from "@/components/content/article-markdown";
import { saveSiteContent } from "@/actions/site-content";
import type { Article, ShareLink } from "@/lib/site-content";
const emptyArticle = {
  id: "",
  slug: "",
  title: "",
  body: "",
  visibility: "public" as "public" | "login",
  published: false,
};
const emptyLink = { id: "", name: "", url: "", enabled: true };
export default function SiteContentPanel({
  articles,
  links,
}: {
  articles: Article[];
  links: ShareLink[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"article" | "link">("article");
  const [article, setArticle] = useState(emptyArticle);
  const [link, setLink] = useState(emptyLink);
  const [preview, setPreview] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const inputClass =
    "w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-white/50";
  function save() {
    startTransition(async () => {
      const result = await saveSiteContent(
        tab,
        (tab === "article" ? article.id : link.id) || null,
        tab === "article" ? article : link,
      );
      setMessage(result.ok ? "已保存。" : result.error);
      if (result.ok) {
        setArticle(emptyArticle);
        setLink(emptyLink);
        setPreview(false);
        router.refresh();
      }
    });
  }
  async function copy(path: string) {
    try {
      await navigator.clipboard.writeText(
        new URL(path, window.location.origin).href,
      );
      setMessage("分享链接已复制。");
    } catch {
      setMessage("无法复制，请打开链接后复制地址栏。");
    }
  }
  return (
    <section className="space-y-6 text-zinc-100">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Publishing studio
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            文章与分享链接
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            发布内容，管理每一个分享入口。
          </p>
        </div>
        <Link
          href="/admin/content/library"
          className="rounded-xl border border-white/15 px-4 py-3 text-sm hover:bg-white/5"
        >
          小说与兑换码 ↗
        </Link>
      </header>
      <div className="flex gap-2 border-b border-white/10 pb-4">
        {(["article", "link"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setMessage("");
            }}
            className={`rounded-xl px-5 py-2.5 text-sm ${tab === t ? "bg-white text-black" : "text-zinc-400 hover:bg-white/5"}`}
          >
            {t === "article" ? "文章" : "分享链接"} ·{" "}
            {t === "article" ? articles.length : links.length}
          </button>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
        <div className="space-y-4 rounded-2xl border border-white/10 bg-[#19191d] p-6">
          <h2 className="text-lg font-medium">
            {(tab === "article" ? article.id : link.id) ? "编辑" : "创建"}
            {tab === "article" ? "文章" : "分享链接"}
          </h2>
          {tab === "article" ? (
            <>
              <label className="block space-y-2 text-sm">
                标题
                <input
                  className={inputClass}
                  maxLength={160}
                  value={article.title}
                  onChange={(e) =>
                    setArticle({ ...article, title: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-2 text-sm">
                文章路径 · /articles/
                <input
                  className={inputClass}
                  placeholder="my-first-article"
                  value={article.slug}
                  onChange={(e) =>
                    setArticle({ ...article, slug: e.target.value })
                  }
                />
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="space-y-2 text-sm">
                  阅读权限
                  <select
                    className={inputClass}
                    value={article.visibility}
                    onChange={(e) =>
                      setArticle({
                        ...article,
                        visibility: e.target.value as "public" | "login",
                      })
                    }
                  >
                    <option className="bg-zinc-900" value="public">
                      所有人可见
                    </option>
                    <option className="bg-zinc-900" value="login">
                      仅登录可见
                    </option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={article.published}
                    onChange={(e) =>
                      setArticle({ ...article, published: e.target.checked })
                    }
                  />
                  发布（取消即草稿）
                </label>
              </div>
              <div className="flex items-center justify-between">
                <label htmlFor="article-body" className="text-sm">
                  Markdown 正文
                </label>
                <button
                  className="text-sm text-zinc-400"
                  onClick={() => setPreview(!preview)}
                >
                  {preview ? "返回编辑" : "预览"}
                </button>
              </div>
              {preview ? (
                <div className="min-h-72 rounded-xl bg-[#202024] p-5 text-zinc-100">
                  <ArticleMarkdown body={article.body} />
                </div>
              ) : (
                <textarea
                  id="article-body"
                  className={`${inputClass} min-h-80 font-mono`}
                  value={article.body}
                  onChange={(e) =>
                    setArticle({ ...article, body: e.target.value })
                  }
                />
              )}
            </>
          ) : (
            <>
              <label className="block space-y-2 text-sm">
                目标名称
                <input
                  className={inputClass}
                  value={link.name}
                  maxLength={160}
                  placeholder="例如：课程资料"
                  onChange={(e) => setLink({ ...link, name: e.target.value })}
                />
              </label>
              <label className="block space-y-2 text-sm">
                目标 URL
                <input
                  className={inputClass}
                  type="url"
                  placeholder="https://…"
                  value={link.url}
                  onChange={(e) => setLink({ ...link, url: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={link.enabled}
                  onChange={(e) =>
                    setLink({ ...link, enabled: e.target.checked })
                  }
                />
                启用链接
              </label>
              <p className="text-xs leading-6 text-zinc-500">
                自动生成随机短码。修改名称或目标后，原分享地址保持不变；停用后访问返回不存在。
              </p>
            </>
          )}
          <div className="flex gap-3">
            <button
              disabled={pending}
              onClick={save}
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
            >
              {pending ? "保存中…" : "保存"}
            </button>
            <button
              disabled={pending}
              onClick={() => {
                setArticle(emptyArticle);
                setLink(emptyLink);
              }}
              className="rounded-xl border border-white/15 px-5 py-3 text-sm"
            >
              新建 / 清空
            </button>
          </div>
          <p role="status" className="text-sm text-zinc-400">
            {message}
          </p>
        </div>
        <div className="space-y-3">
          <input
            className={inputClass}
            aria-label="搜索内容"
            placeholder="搜索名称、路径或目标 URL"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {tab === "article"
            ? articles
                .filter((a) =>
                  `${a.title} ${a.slug}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((a) => (
                  <div
                    key={a.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"
                  >
                    <h3 className="font-medium">{a.title}</h3>
                    <p className="mt-2 text-xs text-zinc-500">
                      {a.published ? "已发布" : "草稿"} ·{" "}
                      {a.visibility === "public" ? "公开" : "仅登录"} ·
                      /articles/{a.slug}
                    </p>
                    <div className="mt-4 flex gap-4 text-sm">
                      <button
                        disabled={pending}
                        onClick={() => {
                          setArticle(a);
                          setPreview(false);
                        }}
                      >
                        编辑
                      </button>
                      <button onClick={() => copy(`/articles/${a.slug}`)}>
                        复制链接
                      </button>
                      {a.published && (
                        <a
                          target="_blank"
                          rel="noreferrer"
                          href={`/articles/${a.slug}`}
                        >
                          查看 ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))
            : links
                .filter((l) =>
                  `${l.name} ${l.code} ${l.url}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((l) => (
                  <div
                    key={l.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"
                  >
                    <h3 className="font-medium">
                      {l.name}{" "}
                      <span className="text-xs text-zinc-500">
                        {l.enabled ? "启用" : "停用"}
                      </span>
                    </h3>
                    <p className="mt-2 text-xs text-zinc-400">/{l.code}</p>
                    <p className="mt-2 break-all text-xs leading-5 text-zinc-500">
                      → {l.url}
                    </p>
                    <div className="mt-4 flex gap-4 text-sm">
                      <button disabled={pending} onClick={() => setLink(l)}>
                        编辑
                      </button>
                      <button onClick={() => copy(`/${l.code}`)}>
                        复制链接
                      </button>
                      <a target="_blank" rel="noreferrer" href={`/${l.code}`}>
                        查看 ↗
                      </a>
                    </div>
                  </div>
                ))}
          {!(tab === "article" ? articles.length : links.length) && (
            <p className="p-6 text-sm text-zinc-500">
              还没有内容，从左侧创建。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
