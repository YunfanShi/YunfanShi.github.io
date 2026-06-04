'use client';

import { memo } from 'react';
import katex from 'katex';

interface LatexRendererProps {
  content: string;
  className?: string;
}

/**
 * Parses text and renders LaTeX delimiters:
 * - Inline: \( ... \) or $ ... $
 * - Block: \[ ... \] or $$ ... $$
 *
 * Non-LaTeX text is rendered as-is with newline support.
 */
const LatexRenderer = memo(function LatexRenderer({ content, className }: LatexRendererProps) {
  // Regex to split on LaTeX inline and block expressions
  // Matches \[ ... \], \( ... \), $$ ... $$, $ ... $
  const regex = /(\\\[[\s\S]*?\\\])|(\\\([\s\S]*?\\\))|(\$\$[\s\S]*?\$\$)|(\$[^\$\n]+?\$)/g;

  const parts: { type: 'text' | 'latex-inline' | 'latex-block'; value: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  regex.lastIndex = 0;

  while ((match = regex.exec(content)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      // Block LaTeX: \[ ... \]
      parts.push({ type: 'latex-block', value: match[1].slice(2, -2).trim() });
    } else if (match[2]) {
      // Inline LaTeX: \( ... \)
      parts.push({ type: 'latex-inline', value: match[2].slice(2, -2).trim() });
    } else if (match[3]) {
      // Block LaTeX: $$ ... $$
      parts.push({ type: 'latex-block', value: match[3].slice(2, -2).trim() });
    } else if (match[4]) {
      // Inline LaTeX: $ ... $
      parts.push({ type: 'latex-inline', value: match[4].slice(1, -1).trim() });
    }

    lastIndex = regex.lastIndex;
  }

  // Remaining text
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          // Render text with line breaks
          return (
            <span key={i}>
              {part.value.split('\n').map((line, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {line}
                </span>
              ))}
            </span>
          );
        }

        // Render LaTeX
        try {
          const html = katex.renderToString(part.value, {
            displayMode: part.type === 'latex-block',
            throwOnError: false,
            output: 'html',
          });
          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          // Fallback: display raw
          return (
            <code key={i} className="text-xs text-red-500">
              {part.value}
            </code>
          );
        }
      })}
    </span>
  );
});

export default LatexRenderer;