'use client';

import LoggerViewer from './logger-viewer';

export default function LoggerViewerWrapper() {
  return (
    <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-icons-round text-[var(--muted-foreground)] text-lg">terminal</span>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          客户端日志
        </h2>
      </div>
      <p className="text-sm text-[var(--muted-foreground)] mb-4">
        查看浏览器端所有操作日志、网络请求、错误信息等，用于诊断和调试。
      </p>
      <LoggerViewer />
    </section>
  );
}