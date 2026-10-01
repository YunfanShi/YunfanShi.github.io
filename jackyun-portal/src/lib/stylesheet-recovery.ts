/** Retry a missing app stylesheet once, bypassing a cached failed response. */
export function retryStylesheet(link: HTMLLinkElement, origin: string): boolean {
  if (link.rel !== 'stylesheet' || link.disabled || link.sheet || link.dataset.jackyunRetried) return false;
  const url = new URL(link.href, origin);
  if (url.origin !== origin || !url.pathname.startsWith('/_next/static/') || !url.pathname.endsWith('.css')) return false;
  link.dataset.jackyunRetried = '1';
  url.searchParams.set('_jackyun_css_retry', '1');
  link.href = url.href;
  return true;
}
