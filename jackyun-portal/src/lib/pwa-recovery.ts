/** Refresh the document from the network while retaining personal offline data. */
export async function reopenWorkspace() {
  const url = new URL(window.location.href);
  url.searchParams.set('_jackyun_reopen', String(Date.now()));
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      // A stalled update must not prevent the user from reopening the page.
      void registration?.update().catch(() => {});
      registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    } catch {}
  }
  window.location.replace(url.href);
}
