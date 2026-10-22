import type { NavigationItem } from './navigation';

interface PrefetchContext {
  signedIn: boolean;
  online: boolean;
  saveData?: boolean;
  effectiveType?: string;
  enabled?: boolean;
}
const GUEST_READ_ONLY = new Set(['/tools', '/resources', '/sleep', '/time-management', '/userscripts', '/update', '/help']);

/** Permission filters still belong to the server. This only bounds optional intent requests. */
export function canPrefetchNavigation(item: NavigationItem, context: PrefetchContext): boolean {
  if (!context.online || context.saveData || context.enabled === false || ['slow-2g', '2g'].includes(context.effectiveType || '')) return false;
  if (item.adminOnly || item.betaOnly || item.featureKey || ['/admin', '/beta', '/studio'].some(path => item.href === path || item.href.startsWith(path + '/'))) return false;
  return context.signedIn || GUEST_READ_ONLY.has(item.href);
}
