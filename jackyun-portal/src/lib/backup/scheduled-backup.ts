export type ScheduledBackupResult = { ok: true; created: number } | { ok: false; status?: number };

/** Automatic backups are best-effort; callers can defer and retry without failing the page action. */
export async function attemptScheduledBackup(run: () => Promise<number>): Promise<ScheduledBackupResult> {
  try {
    return { ok: true, created: await run() };
  } catch (error) {
    const rawStatus = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
    const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : undefined;
    console.warn('[Backup] Scheduled cloud backup deferred', status ? { status } : {});
    return status ? { ok: false, status } : { ok: false };
  }
}
