/** Poll only while usable; serialize requests and back off failures. No immediate focus storms. */
export function startVisiblePoll(task: () => Promise<unknown>, intervalMs = 60_000) {
  let stopped = false, running = false, lastStarted = -Infinity, failures = 0;
  const run = async () => {
    if (stopped || running || document.visibilityState !== 'visible' || !navigator.onLine
      || Date.now() - lastStarted < Math.min(300_000, intervalMs * 2 ** failures)) return;
    running = true; lastStarted = Date.now();
    try { await task(); failures = 0; } catch { failures = Math.min(failures + 1, 3); }
    finally { running = false; }
  };
  const trigger = () => { void run(); };
  const timer = window.setInterval(trigger, Math.min(intervalMs, 5000));
  window.addEventListener('online', trigger);
  document.addEventListener('visibilitychange', trigger);
  trigger();
  return () => { stopped = true; window.clearInterval(timer); window.removeEventListener('online', trigger); document.removeEventListener('visibilitychange', trigger); };
}
