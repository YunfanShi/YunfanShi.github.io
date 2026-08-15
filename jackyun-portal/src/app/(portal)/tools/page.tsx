import ToolsTabs from '@/components/modules/tools/tools-tabs';

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-4xl p-0 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">工具箱</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">文本处理、时间换算、剪贴板 · Text, Time & Clipboard</p>
      </div>
      <ToolsTabs />
    </div>
  );
}
