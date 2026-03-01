'use client';
import { useEffect } from 'react';
export default function OfflinePage() {
  useEffect(() => {
    window.location.href = '/index.html';
  }, []);
  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-[var(--muted-foreground)]">正在跳转到离线版...</p>
    </div>
  );
}
