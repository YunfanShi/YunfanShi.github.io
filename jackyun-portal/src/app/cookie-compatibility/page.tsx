export default function CookieCompatibilityPage() {
  return <main className="grid min-h-dvh place-items-center bg-[var(--background)] px-5 py-10 text-[var(--foreground)]"><section className="w-full max-w-xl rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-7 shadow-lg"><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--brand)]">浏览器兼容性</p><h1 className="mt-3 text-2xl font-bold">请允许本网站使用 Cookie</h1><p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">当前浏览器无法读取本网站的登录 Cookie。请检查隐私或站点设置，允许 Cookie 后刷新页面。现有本机数据不会被清除。</p></section></main>;
}
