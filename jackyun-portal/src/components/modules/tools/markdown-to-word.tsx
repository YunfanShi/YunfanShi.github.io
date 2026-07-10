'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import MarkdownRenderer from '@/components/modules/markdown-renderer';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel as DocxHeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType, convertInchesToTwip,
} from 'docx';
import { saveAs } from 'file-saver';

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

/** 将简化的 Markdown 行解析为 docx 元素 */
function mdToDocxElements(md: string) {
  const lines = md.split('\n');
  const children: (Paragraph | Table)[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 空行
    if (!trimmed) {
      children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
      i++;
      continue;
    }

    // 表格：检测以 | 开头
    if (trimmed.startsWith('|') && line.includes('|')) {
      // 收集表格行
      const tableRows: { cells: string[]; isHeader: boolean }[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const rowLine = lines[i].trim();
        // 跳过分隔行（如 | --- | --- |）
        if (/^\|[\s:-]+\|$/.test(rowLine) || rowLine.match(/^\|[\s:-]+\|[\s:-]+\|/)) {
          i++;
          continue;
        }
        const cells = rowLine.split('|').filter(c => c.trim() !== '').map(c => c.trim());
        if (cells.length > 0) {
          tableRows.push({ cells, isHeader: tableRows.length === 0 });
        }
        i++;
      }

      if (tableRows.length > 0) {
        const rows = tableRows.map((row) => {
          const cells = row.cells.map((cellText) => {
            const runs = parseInlineMarkdown(cellText);
            return new TableCell({
              children: [new Paragraph({ children: runs })],
              width: { size: 100 / row.cells.length, type: WidthType.PERCENTAGE },
            });
          });
          return new TableRow({ children: cells });
        });

        children.push(new Table({ rows }));
      }
      continue;
    }

    // 标题
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const text = headingMatch[2];
      const runs = parseInlineMarkdown(text);
      children.push(
        new Paragraph({
          children: runs,
          heading: ([
            , // index 0 unused
            DocxHeadingLevel.HEADING_1,
            DocxHeadingLevel.HEADING_2,
            DocxHeadingLevel.HEADING_3,
            DocxHeadingLevel.HEADING_4,
            DocxHeadingLevel.HEADING_5,
            DocxHeadingLevel.HEADING_6,
          ])[level] ?? DocxHeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        })
      );
      i++;
      continue;
    }

    // 无序列表
    const ulMatch = trimmed.match(/^[-*+]\s+(.+)/);
    if (ulMatch) {
      const text = ulMatch[1];
      const runs = parseInlineMarkdown(text);
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '•  ', font: 'Symbol' }), ...runs],
          indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
          spacing: { before: 60, after: 60 },
        })
      );
      i++;
      continue;
    }

    // 有序列表
    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (olMatch) {
      const num = olMatch[1];
      const text = olMatch[2];
      const runs = parseInlineMarkdown(text);
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${num}. ` }), ...runs],
          indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
          spacing: { before: 60, after: 60 },
        })
      );
      i++;
      continue;
    }

    // 引用
    const quoteMatch = trimmed.match(/^>\s+(.+)/);
    if (quoteMatch) {
      const text = quoteMatch[1];
      const runs = parseInlineMarkdown(text);
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '│ ', font: 'Courier New', color: '888888' }), ...runs],
          indent: { left: convertInchesToTwip(0.3) },
          spacing: { before: 80, after: 80 },
          style: 'Quote',
        })
      );
      i++;
      continue;
    }

    // 代码块（```）
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // 跳过结尾 ```
      const codeText = codeLines.join('\n');
      children.push(
        new Paragraph({
          children: [new TextRun({ text: codeText, font: 'Courier New', size: 18 })],
          indent: { left: convertInchesToTwip(0.3) },
          spacing: { before: 120, after: 120 },
          shading: { type: 'clear', fill: 'F5F5F5' },
        })
      );
      continue;
    }

    // 普通段落 - 包含图片检测
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) {
      const alt = imgMatch[1];
      const src = imgMatch[2];
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `[图片: ${alt}]`, italics: true, color: '666666' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 120 },
        })
      );
      i++;
      continue;
    }

    // 普通段落
    const runs = parseInlineMarkdown(trimmed);
    const hasLink = runs.some(r => r instanceof TextRun && (r as any).link !== undefined);
    children.push(
      new Paragraph({
        children: runs,
        spacing: { before: 60, after: 60 },
      })
    );
    i++;
  }

  return children;
}

/** 解析行内 Markdown：粗体、斜体、行内代码、链接 */
function parseInlineMarkdown(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // 简单解析：交替匹配粗体、斜体、行内代码、链接
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // 普通文本
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }));
    }

    if (match[2]) {
      // ***粗斜体***
      runs.push(new TextRun({ text: match[2], bold: true, italics: true }));
    } else if (match[3]) {
      // **粗体**
      runs.push(new TextRun({ text: match[3], bold: true }));
    } else if (match[4]) {
      // *斜体*
      runs.push(new TextRun({ text: match[4], italics: true }));
    } else if (match[5]) {
      // `行内代码`
      runs.push(new TextRun({ text: match[5], font: 'Courier New', size: 18 }));
    } else if (match[6] && match[7]) {
      // [链接](url)
      runs.push(
        new TextRun({
          text: match[6],
          style: 'Hyperlink',
        })
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // 剩余文本
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex) }));
  }

  return runs.length > 0 ? runs : [new TextRun({ text })];
}

export default function MarkdownToWord() {
  const [mdContent, setMdContent] = useState(EXAMPLE_MD);
  const [converting, setConverting] = useState(false);
  const [copiedForWord, setCopiedForWord] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const lines = useMemo(() => mdContent.split('\n').length, [mdContent]);

  /** 上传文件 */
  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown') && !file.name.endsWith('.txt')) {
      alert('请上传 .md 或 .markdown 文件');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('文件大小不能超过 10MB');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setMdContent(text);
    };
    reader.readAsText(file);
  }, []);

  /** 下载为 .docx */
  const handleDownloadDocx = useCallback(async () => {
    if (!mdContent.trim()) {
      alert('请输入 Markdown 内容');
      return;
    }
    setConverting(true);
    try {
      const elements = mdToDocxElements(mdContent);
      const doc = new Document({
        title: 'Markdown 转 Word 文档',
        description: '由 Markdown 转换生成的 Word 文档',
        styles: {
          default: {
            document: {
              run: {
                font: 'Microsoft YaHei',
                size: 22,
              },
              paragraph: {
                spacing: { after: 120 },
              },
            },
          },
        },
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: convertInchesToTwip(1),
                  right: convertInchesToTwip(1),
                  bottom: convertInchesToTwip(1),
                  left: convertInchesToTwip(1),
                },
              },
            },
            children: elements,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, fileName ? fileName.replace(/\.(md|markdown|txt)$/, '.docx') : 'markdown-to-word.docx');
    } catch (err) {
      console.error('DOCX 生成失败:', err);
      alert('文档生成失败，请检查 Markdown 格式');
    } finally {
      setConverting(false);
    }
  }, [mdContent, fileName]);

  /** 复制为 Word 格式 */
  const handleCopyForWord = useCallback(async () => {
    if (!mdContent.trim()) {
      alert('请输入 Markdown 内容');
      return;
    }

    // 使用简单的 HTML 转换，便于粘贴到 Word
    const html = simpleMdToHtml(mdContent);

    try {
      // 将 HTML 写入剪贴板（text/html 类型），Word 可以直接粘贴保留格式
      const blob = new Blob([html], { type: 'text/html' });
      const clipboardItem = new ClipboardItem({ 'text/html': blob });
      await navigator.clipboard.write([clipboardItem]);
      setCopiedForWord(true);
      setTimeout(() => setCopiedForWord(false), 2500);
    } catch {
      // fallback: 复制纯文本
      try {
        await navigator.clipboard.writeText(mdContent);
        setCopiedForWord(true);
        setTimeout(() => setCopiedForWord(false), 2500);
      } catch {
        alert('复制失败，请手动复制');
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
        role="presentation"
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
          }}
          className="hidden"
        />
        <span className="material-icons-round text-3xl text-[var(--muted-foreground)]">upload</span>
        <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">
          {fileName ? `已选择: ${fileName}` : '点击或拖拽上传 .md 文件'}
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">支持 .md、.markdown 文件（最大 10MB）</p>
      </div>

      {/* 编辑器 + 预览左右分栏 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 左侧：编辑器 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-[var(--foreground)]">Markdown 编辑</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--muted-foreground)]">{lines} 行</span>
              <button
                onClick={() => setMdContent(EXAMPLE_MD)}
                className="rounded-[8px] border border-[var(--card-border)] px-3 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
              >
                加载示例
              </button>
            </div>
          </div>
          <textarea
            value={mdContent}
            onChange={(e) => setMdContent(e.target.value)}
            placeholder="在此输入 Markdown 内容..."
            rows={16}
            className="w-full rounded-[10px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[#4285F4] resize-y font-mono"
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
        <button
          onClick={handleDownloadDocx}
          disabled={converting || !mdContent.trim()}
          className="inline-flex items-center gap-2 rounded-[10px] bg-[#4285F4] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <span className="material-icons-round text-base">{converting ? 'hourglass_top' : 'download'}</span>
          {converting ? '生成中...' : '下载为 .docx'}
        </button>
        <button
          onClick={handleCopyForWord}
          disabled={!mdContent.trim()}
          className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--card-border)] bg-[var(--card)] px-5 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--accent)] disabled:opacity-40"
        >
          <span className="material-icons-round text-base">{copiedForWord ? 'check' : 'content_copy'}</span>
          {copiedForWord ? '已复制，可粘贴到 Word' : '复制为 Word 格式'}
        </button>
        <button
          onClick={() => { setMdContent(''); setFileName(null); }}
          disabled={!mdContent}
          className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--card-border)] bg-transparent px-5 py-2.5 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] disabled:opacity-40"
        >
          <span className="material-icons-round text-base">delete_outline</span>
          清空
        </button>
      </div>
    </div>
  );
}

/** 简化版 Markdown 转 HTML（用于复制到 Word） */
function simpleMdToHtml(md: string): string {
  let html = md
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