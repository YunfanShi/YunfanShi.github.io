'use client';

import { memo } from 'react';
import katex from 'katex';
import { normalizeLatexRelations, splitMathText } from '@/lib/latex-text';
import 'katex/dist/katex.min.css';

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
  const parts = splitMathText(content);

  return (
    <span className={`math-text ${className ?? ''}`}>
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
          const html = katex.renderToString(normalizeLatexRelations(part.value), {
            displayMode: part.type === 'latex-block',
            throwOnError: false,
            output: 'htmlAndMathml',
          });
          return (
            <span
              key={i}
              className="math-expression"
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
