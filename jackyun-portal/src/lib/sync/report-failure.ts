'use client';
import { APP_VERSION } from '@/lib/utils';
import { syncDiagnosticError, type SyncDiagnostic, type SyncFailurePhase } from './diagnostics';

let lastSentAt = 0;
/** Reporting remains independent of the IndexedDB/localStorage that may have failed. */
export async function reportSyncFailure(error: unknown, phase: SyncFailurePhase): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine || Date.now() - lastSentAt < 60_000) return;
  lastSentAt = Date.now();
  try {
    const report: SyncDiagnostic = {version:APP_VERSION,phase,...syncDiagnosticError(error),online:navigator.onLine};
    // Estimate is optional. It must never hold up reporting or synchronization.
    if (report.errorName === 'QuotaExceededError' && navigator.storage?.estimate) {
      const estimate = await Promise.race([navigator.storage.estimate().catch(()=>null),
        new Promise<null>(resolve=>window.setTimeout(()=>resolve(null),1000))]);
      if (estimate) { report.storageUsage = estimate.usage; report.storageQuota = estimate.quota; }
    }
    await fetch('/api/sync/diagnostics',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(report),cache:'no-store',keepalive:true,signal:AbortSignal.timeout(5000)});
  } catch { /* Diagnostic delivery cannot change the durable sync result. */ }
}
