'use client';

import LatexRenderer from './latex-renderer';
import 'katex/dist/katex.min.css';

interface MarkdownRendererProps {
  content: string;
}

/**
 * Renders basic Markdown + LaTeX in a single component.
 * Supported Markdown:
 * - **bold**
 * - *italic*
 * - `inline code`
 * - ```code block```
 * - - unordered list
 * - > blockquote
 * LaTeX is handled by LatexRenderer first.
 */
export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  // Split into lines, process each line for block-level Markdown,
  // then process inline Markdown + LaTeX
  const lines = content.split('\n');
  const result: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBlockContent = '';
  let inList = false;
  let blockQuoteContent: string[] = [];

  const flushList = () => {
    inList = false;
  };

  const flushBlockQuote = () => {
    if (blockQuoteContent.length > 0) {
      const joined = blockQuoteContent.join('\n');
      result.push(
        <blockquote key={`bq-${result.length}`} className="border-l-3 border-[#4285F4]/30 pl-3 my-1 italic opacity-90">
          {<LatexRenderer content={processInlineMarkdown(joined)} />}
        </blockquote>
      );
      blockQuoteContent = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        result.push(
          <pre key={`code-${result.length}`} className="bg-black/10 dark:bg-white/5 rounded-lg p-3 my-1 overflow-x-auto text-xs font-mono">
            <code>{codeBlockContent}</code>
          </pre>
        );
        codeBlockContent = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        flushBlockQuote();
        flushList();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent += (codeBlockContent ? '\n' : '') + line;
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith('> ')) {
      flushList();
      blockQuoteContent.push(line.trimStart().replace(/^>\s?/, ''));
      // If next line isn't blockquote, flush
      const nextLine = i + 1 < lines.length ? lines[i + 1] : null;
      if (!nextLine || !nextLine.trimStart().startsWith('> ')) {
        flushBlockQuote();
      }
      continue;
    }

    // Flush pending blockquote
    flushBlockQuote();

    // Unordered list
    const ulMatch = line.trimStart().match(/^-\s+(.+)/);
    if (ulMatch) {
      if (!inList) {
        inList = true;
      }
      result.push(
        <li key={`li-${result.length}`} className="ml-4 list-disc my-0.5 text-sm">
          <LatexRenderer content={processInlineMarkdown(ulMatch[1])} />
        </li>
      );
      continue;
    } else {
      flushList();
    }

    // Ordered list
    const olMatch = line.trimStart().match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      result.push(
        <li key={`li-${result.length}`} className="ml-4 list-decimal my-0.5 text-sm">
          <LatexRenderer content={processInlineMarkdown(olMatch[1])} />
        </li>
      );
      continue;
    } else {
      flushList();
    }

    // Empty line
    if (line.trim() === '') {
      result.push(<br key={`br-${result.length}`} />);
      continue;
    }

    // Regular paragraph line
    result.push(
      <span key={`p-${result.length}`}>
        <LatexRenderer content={processInlineMarkdown(line)} />
        <br />
      </span>
    );
  }

  // Flush any remaining block
  flushBlockQuote();
  flushList();

  return <div className="markdown-body">{result}</div>;
}

/**
 * Process inline Markdown within a line:
 * **bold**, *italic*, `code`
 * Returns HTML string for the LatexRenderer to handle.
 */
function processInlineMarkdown(text: string): string {
  let result = text;

  // Inline code (protect from other processing)
  const codePlaceholders: string[] = [];
  result = result.replace(/`([^`]+)`/g, (_, code) => {
    codePlaceholders.push(`<code class="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-xs font-mono">${code}</code>`);
    return `%%CODE${codePlaceholders.length - 1}%%`;
  });

  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic (but not inside already-processed bold)
  result = result.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');

  // Restore code placeholders
  result = result.replace(/%%CODE(\d+)%%/g, (_, idx) => codePlaceholders[parseInt(idx)]);

  return result;
}