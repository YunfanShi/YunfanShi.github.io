'use client';

export function probeBrowserCookieSupport(): boolean {
  try {
    const name = `jy_cookie_probe_${Math.random().toString(36).slice(2)}`;
    document.cookie = `${name}=1; Path=/; SameSite=Lax`;
    const available = document.cookie.split(';').some((entry) => entry.trim().startsWith(`${name}=`));
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    return available;
  } catch {
    return false;
  }
}
