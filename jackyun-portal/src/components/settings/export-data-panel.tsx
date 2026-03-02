'use client';

import { useState } from 'react';
import { exportUserData } from '@/actions/export';

export default function ExportDataPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(format: 'json' | 'csv') {
    setLoading(true);
    setError(null);
    try {
      const data = await exportUserData(format);
      const blob = new Blob([data], {
        type: format === 'json' ? 'application/json' : 'text/csv',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button
        onClick={() => handleExport('json')}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[#4285F4]/5 hover:border-[#4285F4]/30 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <span className="material-icons-round text-base text-[#4285F4]">data_object</span>
        导出 JSON
      </button>
      <button
        onClick={() => handleExport('csv')}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[#34A853]/5 hover:border-[#34A853]/30 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <span className="material-icons-round text-base text-[#34A853]">table_view</span>
        导出 CSV
      </button>
      {loading && (
        <span className="flex items-center gap-1 text-sm text-[var(--muted-foreground)]">
          <span className="material-icons-round text-sm animate-spin">autorenew</span>
          导出中...
        </span>
      )}
      {error && (
        <p className="w-full text-sm text-[#EA4335] bg-[#EA4335]/10 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
