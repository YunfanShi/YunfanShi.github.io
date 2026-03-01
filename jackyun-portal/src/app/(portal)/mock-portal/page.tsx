'use client';
export default function MockPortalPage() {
  return (
    <div className="w-full h-full -m-6">
      <iframe
        src="/legacy/MockPortal.html"
        title="Mock Portal 刷题界面"
        className="w-full h-full border-0"
        style={{ minHeight: 'calc(100vh - 3.5rem)' }}
      />
    </div>
  );
}
