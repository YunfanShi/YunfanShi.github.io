/** Accepts common escaped comparison symbols inside user-authored LaTeX. */
export function normalizeLatexRelations(value: string): string {
  return value.replace(/\\([<>])/gu, '$1');
}

/** Repair commands damaged by older JSON imports that decoded f/t/r as controls. */
export function normalizeLegacyLatex(value: string): string {
  return value
    .replace(/\\?\u000c(?=rac)/gu, String.raw`\f`)
    .replace(/\\?\u0009(?=imes|heta|ext)/gu, String.raw`\t`)
    .replace(/\\?\u000d(?=ight)/gu, String.raw`\r`)
    .replace(/\\ ight\b/gu, String.raw`\right`);
}

export type MathTextPart = { type: 'text' | 'latex-inline' | 'latex-block'; value: string };

/** Only infer plain math with explicit mathematical markers, never a slash alone. */
function plainMathParts(text: string): MathTextPart[] {
  const group = String.raw`\((?:[^()\n]|\([^()\n]*\))*\)`;
  const term = String.raw`(?:√\s*(?:${group}|[A-Za-z0-9]+)|${group}|[A-Za-z0-9]+(?:_[A-Za-z0-9]+)?[⁰¹²³⁴⁵⁶⁷⁸⁹]*)(?:\^(?:${group}|-?[A-Za-z0-9]+))?`;
  const expression = new RegExp(String.raw`(?<![\w/])${term}(?:[ \t]*(?:[=+*/−-]|±)[ \t]*${term})*(?![\w/])`, 'gu');
  const parts: MathTextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(expression)) {
    const value = match[0];
    if (!/[_^=±√⁰¹²³⁴⁵⁶⁷⁸⁹]/u.test(value)) continue;
    if (match.index! > last) parts.push({ type: 'text', value: text.slice(last, match.index) });
    const superscripts: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
    const latex = value.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/gu, (run) => `^{${[...run].map((char) => superscripts[char]).join('')}}`)
      .replace(/\^\(([^()]*)\)/gu, '^{$1}')
      .replace(/_([A-Za-z0-9]+)/gu, '_{$1}')
      .replace(/±/gu, String.raw`\pm `)
      .replace(/−/gu, '-')
      .replace(/√\s*\(([^()]*)\)/gu, String.raw`\sqrt{$1}`)
      .replace(/√\s*([A-Za-z0-9]+)/gu, String.raw`\sqrt{$1}`);
    parts.push({ type: 'latex-inline', value: latex });
    last = match.index! + value.length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

/** Older imports may contain a clear LaTeX command but no math delimiters. */
function unmarkedMathParts(text: string): MathTextPart[] {
  const parts: MathTextPart[] = [];
  const command = /\\(?:left|frac|sqrt|times|pm|Delta|cdot|theta|text|sin|cos|tan)(?![A-Za-z])[^\n\u3400-\u9fff；。]{0,240}/gu;
  let last = 0;
  for (const match of text.matchAll(command)) {
    const candidate = match[0].split(/\s+[A-Za-z]{3,}(?=\s|[.,;:]|$)/u)[0].trimEnd();
    if (!candidate) continue;
    if (match.index! > last) parts.push(...plainMathParts(text.slice(last, match.index)));
    parts.push({ type: 'latex-inline', value: candidate });
    last = match.index! + candidate.length;
  }
  if (last < text.length) parts.push(...plainMathParts(text.slice(last)));
  return parts;
}

/** Explicit LaTeX always wins; infer only unambiguous math in remaining prose. */
export function splitMathText(content: string): MathTextPart[] {
  content = normalizeLegacyLatex(content);
  const regex = /(\\\[[\s\S]*?\\\])|(\\\([\s\S]*?\\\))|(\$\$[\s\S]*?\$\$)|(\$[^$\n]+?\$)/g;
  const parts: MathTextPart[] = [];
  let last = 0;
  for (const match of content.matchAll(regex)) {
    if (match.index! > last) parts.push(...unmarkedMathParts(content.slice(last, match.index)));
    const block = Boolean(match[1] || match[3]);
    const delimiter = match[4] ? 1 : 2;
    parts.push({ type: block ? 'latex-block' : 'latex-inline', value: match[0].slice(delimiter, -delimiter).trim() });
    last = match.index! + match[0].length;
  }
  if (last < content.length) parts.push(...unmarkedMathParts(content.slice(last)));
  return parts;
}
