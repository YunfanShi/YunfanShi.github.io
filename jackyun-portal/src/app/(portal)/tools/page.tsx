import ToolsTabs from '@/components/modules/tools/tools-tabs';

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-4xl p-0 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">工具箱</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">文本、文档、学习规划、时间与日常换算</p>
      </div>
      <ToolsTabs />
    </div>
  );
}
