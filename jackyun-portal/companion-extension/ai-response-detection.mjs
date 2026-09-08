export function hasNewAiResponse(state, baselineCount, baselineText) {
  const text = String(state?.text || '').trim();
  if (!text) return false;
  return Number(state?.newCount || 0) > 0
    || Number(state?.count || 0) > Number(baselineCount || 0)
    || text !== String(baselineText || '').trim();
}
