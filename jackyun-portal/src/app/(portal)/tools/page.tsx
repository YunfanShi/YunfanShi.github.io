import ToolsTabs from '@/components/modules/tools/tools-tabs';

export default function ToolsPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">工具箱</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">文本处理、时间换算、剪贴板 · Text, Time & Clipboard</p>
      </div>
      <ToolsTabs />
    </div>
  );
}
