export interface SiteDialogOptions { title?: string; confirmLabel?: string; cancelLabel?: string; defaultValue?: string; inputLabel?: string }
interface DialogApi { alert(message: unknown, options?: SiteDialogOptions): Promise<void>; confirm(message: unknown, options?: SiteDialogOptions): Promise<boolean>; prompt(message: unknown, options?: SiteDialogOptions | string): Promise<string | null>; isOpen(): boolean }
declare global { interface Window { JackyunDialog?: DialogApi } }
let loading: Promise<DialogApi> | undefined;
function load(): Promise<DialogApi> {
  if (window.JackyunDialog) return Promise.resolve(window.JackyunDialog);
  return loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/shared/site-dialog.js';
    script.onload = () => window.JackyunDialog ? resolve(window.JackyunDialog) : reject(new Error('站内提醒加载失败'));
    script.onerror = () => { loading = undefined; reject(new Error('站内提醒加载失败，请重试')); };
    document.head.appendChild(script);
  });
}
export async function siteAlert(message: unknown, options?: SiteDialogOptions) { return (await load()).alert(message, options); }
export async function siteConfirm(message: unknown, options?: SiteDialogOptions) { return (await load()).confirm(message, options); }
export async function sitePrompt(message: unknown, options?: SiteDialogOptions | string) { return (await load()).prompt(message, options); }
export function isSiteDialogOpen() { return typeof document !== 'undefined' && Boolean(document.querySelector('[data-jackyun-dialog]')); }
