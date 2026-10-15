import {
  Document, Packer, Paragraph, TextRun, HeadingLevel as DocxHeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType, convertInchesToTwip,
} from 'docx';

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

    // 分隔线
    if (/^(---+|___+|\*\*\*+)$/.test(trimmed)) {
      children.push(new Paragraph({
        children: [new TextRun({ text: '────────────────────────', color: 'B7B7B7' })],
        spacing: { before: 120, after: 120 },
      }));
      i++;
      continue;
    }

    // GitHub task list
    const taskMatch = trimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.+)/);
    if (taskMatch) {
      children.push(new Paragraph({
        children: [new TextRun({ text: taskMatch[1].toLowerCase() === 'x' ? '☒  ' : '☐  ' }), ...parseInlineMarkdown(taskMatch[2])],
        indent: { left: convertInchesToTwip(0.35) },
        spacing: { before: 60, after: 60 },
      }));
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

export async function createMarkdownDocx(mdContent: string) {
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

      return Packer.toBlob(doc);
}
