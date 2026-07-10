'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import MarkdownRenderer from '@/components/modules/markdown-renderer';
import { Document, Packer, Paragraph, TextRun, HeadingLevel as DocxHeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, convertInchesToTwip } from 'docx';
import { saveAs } from 'file-saver';

const EXAMPLE_MD = `# IELTS Writing Task 1 & Task 2 Complete Collection

---

# WRITING TASK 1

---

## TASK 1 TYPE 1: Bar Chart + Pie Chart (Mixed)

---

### Your Title
The first chart below shows how energy is used in an average Australian household. The second chart shows the greenhouse gas emissions which result from this energy use.

---

### Your Original Essay

These charts discribes the amount of greenhouse gas released by Australian household and the data of energy used.
The biggest part of energe use is heating for almost 42%, but the biggest part of greenhouse gas emissions for Australian household is not heating, it is water heating which constituted of 32% of the total.

---

### Your Essay (With Correction)

These charts **describe** the amount of greenhouse gas released by Australian **households** and the data **on energy use**.

The **largest proportion of energy** use is heating, **accounting for nearly 42%**. However, the largest **source** of greenhouse gas emissions for Australian **households** is not heating; it is water heating, which **constitutes 32%** of the total.

---

### Error Notebook

| Error Type | Mistake | Correction | Explanation |
|------------|---------|------------|-------------|
| Spelling | discribes | describe | Subject is plural (charts) |
| Plural/Singular | household | households | Referring to households in general |
| Preposition | data of energy used | data on energy use | "On/about" for topic |

---

### Key Vocabulary

| Academic Term | Meaning | Example |
|---------------|---------|---------|
| Constitutes | Makes up / forms | Water heating constitutes 32% of emissions. |
| Accounts for | Represents / comprises | Heating accounts for 42% of energy use. |
| Percentage points | Unit for comparing percentages | 42% vs 30% = 12 percentage points difference |

---

# WRITING TASK 2

---

## TASK 2 TYPE: Discussion (Advantages & Disadvantages)

### Topic: Media & Technology

---

### Your Original Essay

Books appeared for thousands of years. Even now, they are still the main sources of knowledge. Although sometimes reading books is boring and the content isn't up-to-date, reading books can develop our thinking abilities, and the content in books is deeper and more comprehensive than that of radio and television.

---

### Your Essay (With Correction)

Books **have existed** for thousands of years. Even now, they are still the main **sources of knowledge**. Although reading books **can be** boring and the content isn't always up-to-date, reading books **can develop** our thinking abilities, and the content in books is **more** in-depth and comprehensive than **that of** radio and television.

---

### Error Notebook

| Error Type | Mistake | Correction | Explanation |
|------------|---------|------------|-------------|
| Modal + non-base verb | can reading | can read | Modal + base verb |
| Intransitive passive | was emerged | emerged | "Emerge" is intransitive |
| Unequal comparison | deeper than radio | deeper than that of radio | Compare same things |
| Although + but | Although...but | Although... | Use only one |

---

### Key Vocabulary for Task 2

| Academic Term | Meaning | Example |
|---------------|---------|---------|
| Emerged | Came into existence | Radio emerged in the last century. |
| Comprehend | Understand fully | Videos help people comprehend content. |
| Distract | Divert attention | Fragmented information distracts viewers. |
| Hinder | Slow down / obstruct | Television may hinder deep thinking. |
| Fragmented | Broken into pieces | Television provides fragmented information. |
| Drawbacks | Disadvantages | Books have some drawbacks. |

---

# Final Summary: IELTS Writing Quick Reference

## Task 1 (Data Description)

| Do ✅ | Don't ❌ |
|-------|----------|
| Use past tense for past data | Use dynamic verbs for static data |
| Compare highs/lows | Say "increased/decreased" for one year |
| Use "percentage points" | Say "% less" |
| Use "higher/lower" for percentages | Say "bigger/smaller" for percentages |

## Task 2 (Essay Writing)

| Do ✅ | Don't ❌ |
|-------|----------|
| Use modal + base verb | Use modal + infinitive/gerund |
| Connect "Although" to main clause | End sentence after "Although" |
| Use "that of" for comparisons | Compare different things |
| Use academic vocabulary | Use "things", "good", "bad" |

---

**End of Writing Collection**`;

/** 将 Markdown 解析为 docx 元素 */
function mdToDocxElements(md: string) {
  const lines = md.split('\n');
  const children: (Paragraph | Table)[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    // 表格
    if (trimmed.startsWith('|') && line.includes('|')) {
      const tableRows: { cells: string[]; isHeader: boolean }[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const rowLine = lines[i].trim();
        if (/^\|[\s:-]+\|$/.test(rowLine)) { i++; continue; }
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
      const level = parseInt(headingMatch[1]) as 1 | 2 | 3 | 4 | 5 | 6;
      const text = headingMatch[2];
      const runs = parseInlineMarkdown(text);
      levels = [, DocxHeadingLevel.HEADING_1, DocxHeadingLevel.HEADING_2, DocxHeadingLevel.HEADING_3, DocxHeadingLevel.HEADING_4, DocxHeadingLevel.HEADING_5, DocxHeadingLevel.HEADING_6];
      children.push(
        new Paragraph({
          children: runs,
          heading: levels[level] ?? DocxHeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        })
      );
      i++;
      continue;
    }

    // 无序列表
    const ulMatch = trimmed.match(/^[-*+]\s+(.+)/);
    if (ulMatch) {
      const runs = parseInlineMarkdown(ulMatch[1]);
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
      const runs = parseInlineMarkdown(olMatch[2]);
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${olMatch[1]}. ` }), ...runs],
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
      const runs = parseInlineMarkdown(quoteMatch[1]);
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '│ ', font: 'Courier New', color: '888888' }), ...runs],
          indent: { left: convertInchesToTwip(0.3) },
          spacing: { before: 80, after: 80 },
        })
      );
      i++;
      continue;
    }

    // 代码块
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { codeLines.push(lines[i]); i++; }
      i++;
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

    // 分隔线
    if (trimmed.match(/^[-_*]{3,}$/)) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '────────────────────────────────', color: 'CCCCCC', size: 16 })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 60, after: 60 },
        })
      );
      i++;
      continue;
    }

    // 图片
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `[图片: ${imgMatch[1]}]`, italics: true, color: '666666' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 120 },
        })
      );
      i++;
      continue;
    }

    // 普通段落
    const runs = parseInlineMarkdown(trimmed);
    children.push(new Paragraph({ children: runs, spacing: { before: 60, after: 60 } }));
    i++;
  }

  return children;
}

let levels: any[];

/** 解析行内 Markdown */
function parseInlineMarkdown(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }));
    }
    if (match[2]) runs.push(new TextRun({ text: match[2], bold: true, italics: true }));
    else if (match[3]) runs.push(new TextRun({ text: match[3], bold: true }));
    else if (match[4]) runs.push(new TextRun({ text: match[4], italics: true }));
    else if (match[5]) runs.push(new TextRun({ text: match[5], font: 'Courier New', size: 18 }));
    else if (match[6]) runs.push(new TextRun({ text: match[6] }));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) runs.push(new TextRun({ text: text.slice(lastIndex) }));
  return runs.length > 0 ? runs : [new TextRun({ text })];
}

/** Markdown 转 HTML（用于复制到 Word） */
function simpleMdToHtml(md: string): string {
  let html = md
    .replace(/```[\s\S]*?```/g, (m) => {
      const code = m.replace(/```\w*\n?/, '').replace(/```$/, '');
      return `<pre style="background:#f5f5f5;padding:12px;border-radius:6px;font-family:monospace;font-size:12px;">${escapeHtml(code)}</pre>`;
    })
    .replace(/^######\s+(.+)$/gm, '<h6 style="font-size:12px;font-weight:bold;margin:12px 0 6px;">$1</h6>')
    .replace(/^#####\s+(.+)$/gm, '<h5 style="font-size:13px;font-weight:bold;margin:12px 0 6px;">$1</h5>')
    .replace(/^####\s+(.+)$/gm, '<h4 style="font-size:14px;font-weight:bold;margin:14px 0 6px;">$1</h4>')
    .replace(/^###\s+(.+)$/gm, '<h3 style="font-size:16px;font-weight:bold;margin:16px 0 8px;">$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2 style="font-size:18px;font-weight:bold;margin:18px 0 8px;">$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1 style="font-size:22px;font-weight:bold;margin:20px 0 10px;">$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:2px 6px;border-radius:3px;font-family:monospace;font-size:12px;">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;"/>')
    .replace(/\|(.+)\|/g, (m) => {
      if (/^\|[\s:-]+\|$/.test(m)) return '';
      const cells = m.split('|').filter(c => c.trim());
      return '<td style="border:1px solid #ddd;padding:6px 10px;">' + cells.join('</td><td style="border:1px solid #ddd;padding:6px 10px;">') + '</td>';
    })
    .replace(/^>\s+(.+)$/gm, '<blockquote style="border-left:3px solid #4285F4;padding:4px 12px;margin:10px 0;color:#666;">$1</blockquote>')
    .replace(/^[-*+]\s+(.+)$/gm, '<li style="margin:4px 0;">$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li style="margin:4px 0;">$1</li>')
    .replace(/\n\n/g, '</p><p style="margin:8px 0;">')
    .replace(/^---+\s*$/gm, '<hr style="border:none;border-top:1px solid #ddd;margin:16px 0;" />');

  return `<html><body style="font-family:'Microsoft YaHei',sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:800px;margin:0 auto;padding:20px;"><p style="margin:8px 0;">${html}</p></body></html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

export default function Md2WordPage() {
  const [mdContent, setMdContent] = useState(EXAMPLE_MD);
  const [converting, setConverting] = useState(false);
  const [copiedForWord, setCopiedForWord] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);

  const lines = useMemo(() => mdContent.split('\n').length, [mdContent]);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown') && !file.name.endsWith('.txt')) {
      alert('请上传 .md 或 .markdown 文件');
      return;
    }
    if (file.size > 10 * 1024 * 1024) { alert('文件大小不能超过 10MB'); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setMdContent(e.target?.result as string);
    reader.readAsText(file);
  }, []);

  const handleDownloadDocx = useCallback(async () => {
    if (!mdContent.trim()) { alert('请输入 Markdown 内容'); return; }
    setConverting(true);
    try {
      levels = [];
      const elements = mdToDocxElements(mdContent);
      const doc = new Document({
        title: 'Markdown 转 Word 文档',
        styles: {
          default: {
            document: {
              run: { font: 'Microsoft YaHei', size: 22 },
              paragraph: { spacing: { after: 120 } },
            },
          },
        },
        sections: [{
          properties: { page: { margin: { top: convertInchesToTwip(1), right: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1) } } },
          children: elements,
        }],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, fileName ? fileName.replace(/\.(md|markdown|txt)$/, '.docx') : 'markdown-to-word.docx');
      setShowCopied(true); setTimeout(() => setShowCopied(false), 2000);
    } catch (err) {
      console.error(err);
      alert('文档生成失败，请检查 Markdown 格式');
    } finally { setConverting(false); }
  }, [mdContent, fileName]);

  const handleCopyForWord = useCallback(async () => {
    if (!mdContent.trim()) { alert('请输入 Markdown 内容'); return; }
    const html = simpleMdToHtml(mdContent);
    try {
      const blob = new Blob([html], { type: 'text/html' });
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })]);
      setCopiedForWord(true); setTimeout(() => setCopiedForWord(false), 2500);
    } catch {
      try { await navigator.clipboard.writeText(mdContent); setCopiedForWord(true); setTimeout(() => setCopiedForWord(false), 2500); }
      catch { alert('复制失败，请手动复制'); }
    }
  }, [mdContent]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-[var(--card)]">
      {/* Hero */}
      <div className="container mx-auto px-4 py-12 sm:py-16 text-center">
        <h1 className="mb-4 text-3xl font-bold leading-tight text-[var(--foreground)] sm:text-4xl md:text-5xl">
          Markdown 转 Word 转换器
        </h1>
        <p className="max-w-2xl mx-auto text-base text-[var(--muted-foreground)] sm:text-lg">
          免费、快速、安全的在线工具，一键将 Markdown 文件转换为 Word 文档。无需注册，无需安装。
        </p>
      </div>

      {/* Converter Section */}
      <div className="container mx-auto px-4 pb-8" id="converter-section">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Left: Editor */}
          <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
            {/* Upload */}
            <div className="p-6">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold sm:text-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
                上传 Markdown 文件
              </h2>
              <div
                role="presentation"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${dragOver ? 'border-[#4285F4] bg-[#4285F4]/5' : 'border-[var(--card-border)] hover:border-[var(--foreground)]/40'}`}
              >
                <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="hidden" />
                <svg className="mx-auto mb-2 w-9 h-9 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                <p className="text-sm font-medium text-[var(--muted-foreground)]">{fileName ? `已选择: ${fileName}` : '拖放文件到此处，或点击选择文件'}</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">支持 .md、.markdown 文件（最大 10MB）</p>
              </div>
            </div>
            {/* Editor */}
            <div className="p-6 pt-0">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
                  编辑 Markdown 内容
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--muted-foreground)] hidden sm:inline">{lines} 行</span>
                  <button onClick={() => setMdContent(EXAMPLE_MD)} className="rounded-md border border-input bg-background px-3 py-1 text-xs font-medium hover:bg-accent transition-colors">加载示例</button>
                </div>
              </div>
              <textarea
                value={mdContent}
                onChange={(e) => setMdContent(e.target.value)}
                placeholder="# 在此输入 Markdown 内容..."
                className="h-[350px] w-full resize-none rounded-lg border border-[var(--card-border)] bg-muted p-4 font-mono text-sm text-[var(--foreground)] focus:border-transparent focus:ring-2 focus:ring-[#4285F4]"
              />
            </div>
          </div>

          {/* Right: Preview */}
          <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                  实时预览
                </h3>
              </div>
              <div className="max-h-[542px] min-h-[300px] overflow-y-auto rounded-lg border border-[var(--card-border)] bg-card p-4 lg:h-[480px]">
                {mdContent.trim() ? <MarkdownRenderer content={mdContent} /> : <p className="text-sm text-[var(--muted-foreground)]">Markdown 预览将显示在此处</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={handleDownloadDocx}
              disabled={converting || !mdContent.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4285F4] px-6 py-3 text-base font-medium text-white shadow hover:bg-[#4285F4]/90 transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              {converting ? '生成中...' : '下载为 .docx'}
            </button>
            <button
              onClick={handleCopyForWord}
              disabled={!mdContent.trim()}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-6 py-3 text-base font-medium text-[var(--foreground)] hover:bg-accent transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
              {copiedForWord ? '已复制，可粘贴到 Word' : '复制为 Word 格式'}
            </button>
            <button onClick={() => { setMdContent(''); setFileName(null); }} disabled={!mdContent} className="inline-flex items-center gap-2 rounded-lg border border-[var(--card-border)] bg-transparent px-5 py-3 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-40">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              清空
            </button>
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">
            需要直接粘贴到 Word 而不是下载？试试「复制为 Word 格式」按钮，粘贴即可保留格式。
          </p>
          {showCopied && (
            <div className="rounded-lg bg-green-100 dark:bg-green-900/30 px-4 py-2 text-sm text-green-700 dark:text-green-300">
              ✅ 文档生成成功！
            </div>
          )}
        </div>
      </div>

      {/* How to Convert */}
      <div className="bg-background pt-16 pb-8">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold sm:text-4xl text-[var(--foreground)]">三步完成 Markdown 转 Word</h2>
            <p className="mt-2 text-[var(--muted-foreground)] lg:text-lg">按照这个快速工作流，上传、预览、下载一份精美的 DOCX 文件</p>
          </div>
          <div className="relative mx-auto max-w-4xl">
            <div className="absolute bottom-0 left-[1.125rem] top-0 w-px border-r border-[var(--card-border)]" />
            <div className="flex flex-col gap-8">
              {[
                { num: 1, title: '上传或粘贴 Markdown', desc: '拖放 Markdown 文件或直接将内容粘贴到编辑器中。支持 .md 和 .markdown 文件（最大 10MB），拖拽上传或从剪贴板粘贴。' },
                { num: 2, title: '预览和调整格式', desc: '通过实时预览查看标题、表格和列表的效果。全面 Markdown 语法支持，即时预览，编辑文本和结构直到满意为止。' },
                { num: 3, title: '下载为 Word 文档', desc: '导出保留所有标题、样式和块的 DOCX 文件。表格、代码块和排版完美保留，可在 Microsoft Word、Google Docs 和 WPS 中无缝打开。' },
              ].map((step) => (
                <div key={step.num} className="relative pl-10">
                  <span className="absolute left-0 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border bg-background font-mono text-xs font-medium text-[var(--foreground)]">{step.num}</span>
                  <div className="p-6 bg-[var(--card)] rounded-lg border border-[var(--card-border)]">
                    <h3 className="text-xl font-semibold text-[var(--foreground)]">{step.title}</h3>
                    <p className="text-[var(--muted-foreground)] mt-1">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Format Comparison */}
      <div className="bg-background pt-16 pb-8">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold sm:text-4xl text-[var(--foreground)]">Markdown 转 Word 格式对比</h2>
            <p className="mt-2 text-[var(--muted-foreground)] lg:text-lg">直观对比，轻松了解 Markdown 到 Word 的转换效果</p>
          </div>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 max-w-6xl mx-auto">
            <div>
              <h3 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Markdown 源码示例</h3>
              <div className="rounded-lg border border-slate-900 bg-slate-900 p-4 text-slate-50 dark:border-slate-200 dark:bg-slate-100 dark:text-slate-900">
                <pre className="overflow-x-auto whitespace-pre-wrap text-sm">{`# Sample Document

## Basic Formatting

This is **bold text** and *italic text*.

### List Example

- First item
- Second item
  - Nested item

### Code Example

\`\`\`javascript
function hello() {
  console.log("Hello World!");
}
\`\`\`

### Table Example

| Name | Age | City |
| :--- | :--: | ---: |
| Alice | 28 | London |
| Bob | 35 | New York |`}</pre>
              </div>
            </div>
            <div>
              <h3 className="mb-4 text-lg font-semibold text-[var(--foreground)]">转换后的 Word 文档</h3>
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm">
                <div className="space-y-3 font-serif">
                  <h1 className="text-2xl font-bold">Sample Document</h1>
                  <h2 className="text-xl font-semibold">Basic Formatting</h2>
                  <p>This is <strong>bold text</strong> and <em>italic text</em>.</p>
                  <h3 className="text-lg font-medium">List Example</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>First item</li>
                    <li>Second item</li>
                    <li className="pl-4">Nested item</li>
                  </ul>
                  <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded font-mono text-sm">
                    <p><span className="text-blue-600">function</span> hello() {'{'}</p>
                    <p className="pl-4">console.<span className="text-yellow-600">log</span>(<span className="text-green-600">"Hello World!"</span>);</p>
                    <p>{'}'}</p>
                  </div>
                  <table className="w-full border-collapse border border-gray-300">
                    <thead><tr className="bg-gray-100 dark:bg-gray-800"><th className="border p-2 text-left">Name</th><th className="border p-2 text-left">Age</th><th className="border p-2 text-left">City</th></tr></thead>
                    <tbody><tr><td className="border p-2">Alice</td><td className="border p-2">28</td><td className="border p-2">London</td></tr><tr><td className="border p-2">Bob</td><td className="border p-2">35</td><td className="border p-2">New York</td></tr></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="mb-12 text-center text-2xl font-bold sm:text-4xl text-[var(--foreground)]">为什么选择我们的 Markdown 转 Word 转换器？</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              { icon: '🛡️', title: '绝对安全与隐私', desc: '所有转换在浏览器本地完成，文档永远不会离开你的电脑。', color: 'bg-blue-100 dark:bg-blue-500/20' },
              { icon: '⚡', title: '闪电般快速', desc: '无需等待上传或下载，即时本地转换，几秒内完成 Markdown 到 Word 的转换。', color: 'bg-yellow-100 dark:bg-yellow-500/20' },
              { icon: '📄', title: '实时预览', desc: '实时预览功能让你在编辑 Markdown 时即可看到最终效果。', color: 'bg-green-100 dark:bg-green-500/20' },
              { icon: '🖼️', title: '全面语法支持', desc: '不仅支持基本 Markdown，还支持数学公式、代码高亮和图表渲染。', color: 'bg-purple-100 dark:bg-purple-500/20' },
              { icon: '❤️', title: '完全免费', desc: '无需注册，无隐藏费用，永久免费使用所有功能。', color: 'bg-red-100 dark:bg-red-500/20' },
              { icon: '🏆', title: '专业质量输出', desc: '生成专业级别的 Word 文档，格式和布局完美，兼容所有主流办公软件。', color: 'bg-indigo-100 dark:bg-indigo-500/20' },
            ].map((f) => (
              <div key={f.title} className="text-center p-6 rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm hover:shadow-md transition-shadow">
                <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${f.color} text-2xl`}>{f.icon}</div>
                <h3 className="mb-2 text-xl font-bold text-[var(--foreground)]">{f.title}</h3>
                <p className="text-[var(--muted-foreground)]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Use Cases */}
      <div className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold sm:text-4xl text-[var(--foreground)]">使用场景</h2>
            <p className="mt-4 text-lg text-[var(--muted-foreground)]">Markdown 转 Word 六大高频使用场景</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: '</>', title: '技术文档', desc: 'README、API 文档、架构规格。导出 PDF 归档，DOCX 给团队审阅。', color: 'bg-blue-100 dark:bg-blue-500/20 text-blue-600' },
              { icon: '📊', title: '报告与更新', desc: '数据分析、项目复盘、OKR。高效写作，版本控制，正式提交。', color: 'bg-green-100 dark:bg-green-500/20 text-green-600' },
              { icon: '🎓', title: '学术与教育', desc: '论文、实验报告、讲义。结构清晰，PDF 打印，DOCX 反馈批改。', color: 'bg-purple-100 dark:bg-purple-500/20 text-purple-600' },
              { icon: '💼', title: '商务文档', desc: '提案、投标、白皮书。专业排版，PDF 锁定，DOCX 可编辑。', color: 'bg-orange-100 dark:bg-orange-500/20 text-orange-600' },
              { icon: '👥', title: '团队协作', desc: '会议记录、需求文档、决策。方便追踪变更，导出即可分享。', color: 'bg-teal-100 dark:bg-teal-500/20 text-teal-600' },
              { icon: '✍️', title: '内容创作', desc: '博客、文案、知识库。单一源头，PDF 供下载，DOCX 供编辑。', color: 'bg-pink-100 dark:bg-pink-500/20 text-pink-600' },
            ].map((c) => (
              <div key={c.title} className="flex gap-4 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm hover:bg-accent/50 hover:shadow-md transition-all">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.color} font-bold text-sm`}>{c.icon}</div>
                <div>
                  <h3 className="font-semibold text-[var(--foreground)]">{c.title}</h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold sm:text-4xl text-[var(--foreground)]">关于 Markdown 转 Word 的常见问题</h2>
            <p className="mt-2 text-[var(--muted-foreground)] lg:text-lg">使用我们的免费在线转换器时常见问题的解答</p>
          </div>
          <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-8 shadow-sm">
            <div className="space-y-6">
              {[
                { q: 'Markdown 转 Word 转换器完全免费吗？', a: '是的，我们的服务完全免费，无需注册，无使用限制，永久免费使用所有功能。' },
                { q: '使用这个转换器安全吗？', a: '绝对安全。所有文件处理都在你的浏览器本地完成，文件永远不会上传到服务器。' },
                { q: '支持哪些 Markdown 语法？', a: '支持所有标准 Markdown 语法，包括标题、列表、表格、链接、图片、代码块、粗斜体、引用等。' },
                { q: '文件大小有限制吗？', a: '支持最大 10MB 的 Markdown 文件，确保快速可靠的转换。' },
                { q: '可以一次转换多个文件吗？', a: '目前一次处理一个文件，以保证最高的转换质量。' },
                { q: '转换需要多长时间？', a: '大多数转换即时完成，下载过程只需几秒，取决于文件大小。' },
                { q: '转换后的文档可以用于商业用途吗？', a: '可以，你对转换后的文档拥有完全的使用权，可用于个人、教育或商业用途。' },
              ].map((faq, i) => (
                <details key={i} className="group">
                  <summary className="flex cursor-pointer items-center justify-between gap-2 text-lg font-semibold text-[var(--foreground)] list-none">
                    {faq.q}
                    <svg className="w-5 h-5 shrink-0 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="m6 9 6 6 6-6"/></svg>
                  </summary>
                  <p className="mt-2 text-[var(--muted-foreground)]">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="pb-16">
        <div className="container mx-auto px-4">
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-12 text-center shadow-sm">
            <h2 className="mb-6 text-3xl font-bold sm:text-4xl text-[var(--foreground)]">准备好开始转换了吗？</h2>
            <button
              onClick={() => document.getElementById('converter-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4285F4] px-8 py-4 text-lg font-medium text-white shadow hover:bg-[#4285F4]/90 transition-colors"
            >
              立即转换
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}