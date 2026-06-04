import EnforcerApp from '@/components/admin/enforcer-app';

export default function EnforcerPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">专注模式</h1>
        <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">Focus Enforcer — 强制专注计时器</p>
      </div>
      <EnforcerApp />
    </div>
  );
}
