export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <p className="text-sm text-zinc-400">正在加载管理内容…</p>
      <div className="h-12 w-64 animate-pulse rounded-xl bg-white/5" />
      <div className="grid gap-5 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/5"
          />
        ))}
      </div>
    </div>
  );
}
