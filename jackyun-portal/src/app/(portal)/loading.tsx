export default function PortalLoading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] animate-pulse" aria-label="正在加载页面">
      <div className="mb-8 h-9 w-56 rounded-lg bg-[var(--card-border)]" />
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="h-24 rounded-2xl bg-[var(--card)]" />
        <div className="h-24 rounded-2xl bg-[var(--card)]" />
        <div className="h-24 rounded-2xl bg-[var(--card)]" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-44 rounded-xl bg-[var(--card)]" />
        ))}
      </div>
    </div>
  );
}
