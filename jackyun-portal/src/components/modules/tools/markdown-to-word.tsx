'use client';

import { siteAlert } from '@/lib/site-dialog';
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import MarkdownRenderer from '@/components/modules/markdown-renderer';
import { saveAs } from 'file-saver';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { useToolDraft } from './tool-drafts';
const EXAMPLE_MD = `# Markdown 转 Word 示例

## 基本格式

这是一段**粗体文字**和*斜体文字*的示例，还有 ~~删除线~~ 和 \`行内代码\`。

### 列表

1. 第一项
2. 第二项
3. 第三项

- 无序列表项
- 另一个项目
- 最后一个项目

### 代码块

\`\`\`javascript
function hello() {
  console.log("Hello, World!");
}
\`\`\`

### 引用

> 这是一段引用文字
> 可以包含多行内容

### 表格

| 名称 | 年龄 | 城市 |
| :--- | :--: | ---: |
| 张三 | 28 | 北京 |
| 李四 | 35 | 上海 |

### 链接和图片

[访问 GitHub](https://github.com)

![占位图](https://via.placeholder.com/150)
`;

export default function MarkdownToWord() {
  const [mdContent, setMdContent] = useToolDraft('markdown.content', EXAMPLE_MD);
  const [converting, setConverting] = useState(false);
  const [copiedForWord, setCopiedForWord] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useToolDraft<string | null>('markdown.fileName', null);
  const [outputName, setOutputName] = useToolDraft('markdown.outputName', '学习笔记');

  const generation = useRef(0);
  const readerRef = useRef<FileReader | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    generation.current++;
    readerRef.current?.abort();
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  function editContent(value: string) {
    readerRef.current?.abort();
    setMdContent(value);
    setCopiedForWord(false);
  }

  const lines = useMemo(() => mdContent.split('\n').length, [mdContent]);

  /** 上传文件 */
  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown') && !file.name.endsWith('.txt')) {
      siteAlert('请上传 .md 或 .markdown 文件');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      siteAlert('文件大小不能超过 10MB');
      return;
    }
    readerRef.current?.abort();
    const reader = new FileReader();
    readerRef.current = reader;
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setMdContent(text);
      setFileName(file.name);
      setCopiedForWord(false);
    };
    reader.onerror = () => { void siteAlert('文件读取失败，原内容已保留'); };
    reader.readAsText(file);
  }, [setMdContent, setFileName]);

  /** 下载为 .docx */
  const handleDownloadDocx = useCallback(async () => {
    if (!mdContent.trim()) {
      siteAlert('请输入 Markdown 内容');
      return;
    }
    const token = generation.current;
    setConverting(true);
    try {
      const { createMarkdownDocx } = await import('./markdown-docx');
      const blob = await createMarkdownDocx(mdContent);
      if (token !== generation.current) return;
      const safeName = outputName.trim().replace(/[\\/:*?"<>|]/g, '-') || (fileName ? fileName.replace(/\.(md|markdown|txt)$/i, '') : 'markdown-to-word');
      saveAs(blob, `${safeName}.docx`);
    } catch (err) {
      console.error('DOCX 生成失败:', err);
      if (token === generation.current) void siteAlert('文档生成失败，输入已保留，请重试');
    } finally {
      if (token === generation.current) setConverting(false);
    }
  }, [mdContent, fileName, outputName]);

  /** 复制为 Word 格式 */
  const handleCopyForWord = useCallback(async () => {
    if (!mdContent.trim()) {
      siteAlert('请输入 Markdown 内容');
      return;
    }

    const token = generation.current;
    // 使用简单的 HTML 转换，便于粘贴到 Word
    const html = simpleMdToHtml(mdContent);

    try {
      // 将 HTML 写入剪贴板（text/html 类型），Word 可以直接粘贴保留格式
      const blob = new Blob([html], { type: 'text/html' });
      const clipboardItem = new ClipboardItem({ 'text/html': blob });
      await navigator.clipboard.write([clipboardItem]);
      if (token !== generation.current) return;
      setCopiedForWord(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedForWord(false), 2500);
    } catch {
      if (token !== generation.current) return;
      // fallback: 复制纯文本
      try {
        await navigator.clipboard.writeText(mdContent);
        if (token !== generation.current) return;
        setCopiedForWord(true);
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopiedForWord(false), 2500);
      } catch {
        if (token === generation.current) void siteAlert('复制失败，请手动复制');
      }
    }
  }, [mdContent]);

  /** 拖拽处理 */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="flex flex-col gap-5">
      {/* 上传区域 */}
      <div
        role="button"
        tabIndex={0}
        aria-label="上传 Markdown 文件"
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInputRef.current?.click(); }
        }}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`cursor-pointer rounded-[10px] border-2 border-dashed p-4 text-center transition-colors ${
          dragOver
            ? 'border-[#4285F4] bg-[#4285F4]/5'
            : 'border-[var(--card-border)] hover:border-[var(--foreground)]/40'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
          className="hidden"
        />
        <span className="material-icons-round text-3xl text-[var(--muted-foreground)]" aria-hidden="true">upload</span>
        <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">
          {fileName ? `已选择: ${fileName}` : '点击或拖拽上传 .md 文件'}
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">支持 .md、.markdown 文件（最大 10MB）</p>
      </div>

      {/* 编辑器 + 预览左右分栏 */}
      <label className="flex flex-col gap-1 text-sm font-medium text-[var(--foreground)] sm:max-w-sm">
        输出文件名
        <div className="flex items-center rounded-[10px] border border-[var(--card-border)] bg-[var(--background)] px-3 focus-within:ring-2 focus-within:ring-[#4285F4]">
          <Input value={outputName} onChange={event => setOutputName(event.target.value)} className="min-w-0 flex-1 border-0" placeholder="学习笔记" />
          <span className="text-xs text-[var(--muted-foreground)]">.docx</span>
        </div>
      </label>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 左侧：编辑器 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="tool-markdown-content" className="text-sm font-medium text-[var(--foreground)]">Markdown 编辑</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--muted-foreground)]">{lines} 行</span>
              <Button
                onClick={() => editContent(EXAMPLE_MD)}
                variant="outline"
                size="sm"
              >
                加载示例
              </Button>
            </div>
          </div>
          <Textarea
            id="tool-markdown-content"
            value={mdContent}
            onChange={(e) => editContent(e.target.value)}
            placeholder="在此输入 Markdown 内容..."
            rows={16}
            className="font-mono"
          />
        </div>

        {/* 右侧：预览 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-[var(--foreground)]">实时预览</label>
          <div className="min-h-[400px] max-h-[500px] overflow-y-auto rounded-[10px] border border-[var(--card-border)] bg-[var(--card)] p-4">
            {mdContent.trim() ? (
              <MarkdownRenderer content={mdContent} />
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">Markdown 预览将显示在此处</p>
            )}
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleDownloadDocx}
          busy={converting}
          disabled={!mdContent.trim()}
        >
          <span className="material-icons-round text-base" aria-hidden="true">{converting ? 'hourglass_top' : 'download'}</span>
          {converting ? '生成中...' : '下载为 .docx'}
        </Button>
        <Button
          variant="outline"
          onClick={handleCopyForWord}
          disabled={!mdContent.trim()}
        >
          <span className="material-icons-round text-base" aria-hidden="true">{copiedForWord ? 'check' : 'content_copy'}</span>
          {copiedForWord ? '已复制，可粘贴到 Word' : '复制为 Word 格式'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => { editContent(''); setFileName(null); }}
          disabled={!mdContent}

        >
          <span className="material-icons-round text-base" aria-hidden="true">delete_outline</span>
          清空
        </Button>
      </div>
    </div>
  );
}

/** 简化版 Markdown 转 HTML（用于复制到 Word） */
function simpleMdToHtml(md: string): string {
  const html = md
    // 代码块
    .replace(/```[\s\S]*?```/g, (match) => {
      const code = match.replace(/```\w*\n?/, '').replace(/```$/, '');
      return `<pre style="background:#f5f5f5;padding:12px;border-radius:6px;font-family:monospace;font-size:12px;overflow-x:auto;">${escapeHtml(code)}</pre>`;
    })
    // 标题
    .replace(/^######\s+(.+)$/gm, '<h6 style="font-size:12px;font-weight:bold;margin:12px 0 6px;">$1</h6>')
    .replace(/^#####\s+(.+)$/gm, '<h5 style="font-size:13px;font-weight:bold;margin:12px 0 6px;">$1</h5>')
    .replace(/^####\s+(.+)$/gm, '<h4 style="font-size:14px;font-weight:bold;margin:14px 0 6px;">$1</h4>')
    .replace(/^###\s+(.+)$/gm, '<h3 style="font-size:16px;font-weight:bold;margin:16px 0 8px;">$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2 style="font-size:18px;font-weight:bold;margin:18px 0 8px;">$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1 style="font-size:22px;font-weight:bold;margin:20px 0 10px;">$1</h1>')
    // 行内格式
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:2px 6px;border-radius:3px;font-family:monospace;font-size:12px;">$1</code>')
    // 链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // 图片
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;"/>')
    // 表格
    .replace(/\|(.+)\|/g, (match) => {
      if (/^\|[\s:-]+\|$/.test(match)) return '';
      const cells = match.split('|').filter(c => c.trim());
      return '<td style="border:1px solid #ddd;padding:6px 10px;">' + cells.join('</td><td style="border:1px solid #ddd;padding:6px 10px;">') + '</td>';
    })
    // 引用
    .replace(/^>\s+(.+)$/gm, '<blockquote style="border-left:3px solid #4285F4;padding:4px 12px;margin:10px 0;color:#666;">$1</blockquote>')
    // 无序列表
    .replace(/^[-*+]\s+(.+)$/gm, '<li style="margin:4px 0;">$1</li>')
    // 有序列表
    .replace(/^\d+\.\s+(.+)$/gm, '<li style="margin:4px 0;">$1</li>')
    // 段落
    .replace(/\n\n/g, '</p><p style="margin:8px 0;">');

  return `<html><body style="font-family:&#39;Microsoft YaHei&#39;,sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:800px;margin:0 auto;padding:20px;"><p style="margin:8px 0;">${html}</p></body></html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}
