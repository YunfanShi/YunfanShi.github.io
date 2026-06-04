const changelog = [
  {
    version: 'v1.6',
    date: '2025-12-17',
    platform: 'jackyun.top',
    description: '域名迁移与平台稳定',
    changes: ['将电脑端从旧域名 jack2025a.github.io 迁移到 jackyun.top'],
  },
  {
    version: 'v1.5.5',
    date: '2025-12-16',
    platform: 'jackyun.top',
    description: 'Vocab 模块完善',
    changes: ['完善 Vocab 模块，优化 SRS 算法与 TTS 发音'],
  },
  {
    version: 'v1.0.0',
    date: '2025-12-17',
    platform: 'jack2025a.github.io (Mobile)',
    description: '移动端全新上线',
    changes: [
      '移动端全新上线，全功能无损适配',
      '发布 Vocab Flow (Mobile) v1.0.0 — 专为低配置手机设计',
      '发布 WorkStation ADN v1.0.0 — 跨设备文本传输',
      '发布 Poem 沉浸背诵 Mobile v1.0.0',
      '发布 LexiconLab Mobile v1.0 Beta',
    ],
  },
];

const modules = [
  { name: 'Poem 沉浸背诵', ver: '3.1.3', date: '2025-12-7', status: 'Stable' },
  { name: 'Vocab Master', ver: '1.8.2', date: '2025-12-16', status: 'Stable' },
  { name: 'ADN', ver: '1.0 Beta', date: '2025-12-16', status: 'Beta' },
  { name: 'LexiconLab', ver: '1.0 Beta', date: '2025-12-15', status: 'Beta' },
  { name: 'Battlefield 6 Hub', ver: '1.0 Alpha', date: '2025-10-29', status: 'Alpha' },
  { name: 'Vocab Flow (Mobile)', ver: '1.0.0', date: '2025-12-17', status: 'Stable' },
];

const STATUS_COLORS: Record<string, string> = {
  Stable: '#34A853',
  Beta: '#FBBC05',
  Alpha: '#EA4335',
};

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="material-icons-round text-[var(--muted-foreground)] text-lg">{icon}</span>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
        {title}
      </h2>
    </div>
  );
}

export default function UpdateHubPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Update Hub</h1>
        <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">版本历史与模块状态</p>
      </div>

      {/* Timeline */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="history" title="更新记录" />
        <div className="relative">
          {changelog.map((entry, idx) => (
            <div key={idx} className="relative pl-6 pb-6 last:pb-0">
              {/* vertical line */}
              {idx < changelog.length - 1 && (
                <div className="absolute left-[7px] top-3 bottom-0 w-[2px] bg-[var(--card-border)]" />
              )}
              {/* dot */}
              <div
                className="absolute left-0 top-[6px] w-[14px] h-[14px] rounded-full border-2 border-[var(--card)]"
                style={{ backgroundColor: '#4285F4' }}
              />
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs text-[var(--muted-foreground)]">{entry.date}</span>
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white bg-[#1f2937]">
                  {entry.version}
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">{entry.platform}</span>
              </div>
              <p className="text-sm font-medium text-[var(--foreground)] mb-1">{entry.description}</p>
              <ul className="space-y-0.5">
                {entry.changes.map((c, i) => (
                  <li key={i} className="text-xs text-[var(--muted-foreground)] flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">·</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Module Status */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="grid_view" title="模块状态" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {modules.map((mod) => (
            <div
              key={mod.name}
              className="rounded-xl border border-[var(--card-border)] p-3 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: `${STATUS_COLORS[mod.status] ?? '#888'}20`,
                    color: STATUS_COLORS[mod.status] ?? '#888',
                  }}
                >
                  {mod.status}
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)] font-mono">{mod.ver}</span>
              </div>
              <span className="text-sm font-medium text-[var(--foreground)] leading-tight">{mod.name}</span>
              <span className="text-xs text-[var(--muted-foreground)]">{mod.date}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
