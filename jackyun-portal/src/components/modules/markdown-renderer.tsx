'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkEmoji from 'remark-emoji';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import 'katex/dist/katex.min.css';

interface MarkdownRendererProps {
  content: string;
}

/** Extended sanitize schema that allows KaTeX MathML + highlight.js classes */
const customSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    // KaTeX MathML tags
    'math', 'semantics', 'annotation', 'mrow', 'mi', 'mn', 'mo', 'mfrac', 'msqrt',
    'msup', 'msub', 'msubsup', 'mover', 'munder', 'munderover', 'mtable', 'mtr', 'mtd',
    'mpadded', 'mtext', 'mspace', 'mstyle', 'merror', 'mphantom', 'mroot', 'menclose',
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] || []), ['className', 'style', 'encoding']],
    code: [...(defaultSchema.attributes?.code || []), ['className']],
    span: [...(defaultSchema.attributes?.span || []), ['className', 'style']],
    div: [...(defaultSchema.attributes?.div || []), ['className', 'style']],
    math: [...(defaultSchema.attributes?.math || []), ['xmlns', 'display']],
    annotation: [...(defaultSchema.attributes?.annotation || []), ['encoding']],
    // Allow data-* attributes globally for highlight.js
    pre: [...(defaultSchema.attributes?.pre || []), ['className']],
  },
};

/**
 * Full-featured Markdown renderer using react-markdown with:
 * - GitHub Flavored Markdown (tables, strikethrough, task lists, autolinks)
 * - LaTeX math formulas (via KaTeX)
 * - Emoji shortcodes (:smile:)
 * - Code syntax highlighting (via highlight.js)
 * - Raw HTML support (sanitized)
 */
export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  return (
    <div className="markdown-body prose prose-sm max-w-none dark:prose-invert
      prose-headings:font-semibold prose-headings:text-[var(--foreground)]
      prose-p:text-[var(--foreground)] prose-p:leading-relaxed
      prose-a:text-[#4285F4] prose-a:no-underline hover:prose-a:underline
      prose-strong:text-[var(--foreground)] prose-strong:font-semibold
      prose-code:bg-black/10 dark:prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
      prose-pre:bg-black/5 dark:prose-pre:bg-white/5 prose-pre:border prose-pre:border-[var(--card-border)] prose-pre:rounded-xl
      prose-blockquote:border-l-3 prose-blockquote:border-[#4285F4]/30 prose-blockquote:pl-3 prose-blockquote:italic prose-blockquote:opacity-90
      prose-li:text-[var(--foreground)]
      prose-table:border prose-table:border-[var(--card-border)] prose-table:rounded-lg
      prose-th:bg-[var(--background)] prose-th:px-3 prose-th:py-2 prose-th:text-xs prose-th:font-semibold
      prose-td:px-3 prose-td:py-2 prose-td:text-sm
      prose-img:rounded-xl
      [&_.katex]:text-base [&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkEmoji]}
        rehypePlugins={[
          rehypeRaw,
          rehypeKatex,
          rehypeHighlight,
          [rehypeSanitize, customSchema],
        ]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}