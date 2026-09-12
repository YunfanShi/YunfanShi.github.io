export function hasNewAiResponse(state, baselineCount, baselineText) {
  const text = String(state?.text || '').trim();
  if (!text) return false;
  return Number(state?.newCount || 0) > 0
    || Number(state?.count || 0) > Number(baselineCount || 0)
    || text !== String(baselineText || '').trim();
}

export function expectsStructuredAiResponse(prompt) {
  const instructions = String(prompt || '').split('\n\n[RESPONSE FORMAT]')[0];
  return /(?:return|respond with|output)\s+(?:one\s+|only\s+|a\s+)?(?:valid\s+|strict\s+)?(?:json|ndjson|jsonl)\b|\bjson\s+(?:shape|object|array|schema)\b|\bndjson\b/iu.test(instructions);
}

/** Prefer untouched DOM text for JSON/NDJSON. Markdown escaping is useful for
 * prose, but adding backslashes before braces and brackets corrupts structured
 * responses before Portal can parse them. Code blocks are checked separately
 * because AI sites often render their language label outside the code element.
 */
export function selectAiResponseText(state, preserveStructured = false) {
  const markdownText = String(state?.text || '').trim();
  if (!preserveStructured) return markdownText;
  const rawText = String(state?.rawText || '').trim();
  const codeBlocks = Array.isArray(state?.codeBlocks)
    ? state.codeBlocks.map((block) => String(block || '').trim()).filter(Boolean)
    : [];
  if (codeBlocks.length) return codeBlocks.join('\n');
  return rawText || markdownText;
}
